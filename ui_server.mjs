#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile, readdir, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReview,
  caseMessages,
  caseNativePayload,
  clearReview,
  estimateTokens,
  failedScore,
  loadCases,
  normalizeResultRecord,
  round,
  scoreOutput,
  slugify,
  summarize,
  timestamp,
  validateCases,
  writeRunFiles,
} from "./eval_lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(__dirname, "web");
const RUNS_DIR = path.join(__dirname, "runs");
const DEFAULT_CASES = path.join(__dirname, "testfaelle", "praxis_de.json");
const WATCHDOG_CHECK_INTERVAL_MS = 5000;
const WATCHDOG_IDLE_SECONDS = 180;
const WATCHDOG_REASONING_REVIEW_SECONDS = 300;
const WATCHDOG_REASONING_STALL_SECONDS = 120;
const WATCHDOG_REASONING_MIN_NEW_CHARS = 80;
const WATCHDOG_LOOP_MIN_CHARS = 600;
const WATCHDOG_LOOP_MIN_REPEATS = 5;
const MODEL_UNLOAD_POLL_MS = 3000;
const MODEL_UNLOAD_TIMEOUT_SECONDS = 300;
const MODEL_UNLOAD_REQUEST_TIMEOUT_SECONDS = 20;
const REASONING_STRENGTH = {
  off: 0,
  none: 0,
  on: 1,
  low: 1,
  medium: 3,
  med: 3,
  high: 4,
  xhigh: 5,
  x_high: 5,
  extra_high: 5,
  max: 6,
};
const activeRuns = new Map();

function parseArgs(argv) {
  const args = { port: 8787, host: "127.0.0.1" };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value after ${item}`);
      return argv[index];
    };
    if (item === "--port") args.port = Number.parseInt(next(), 10);
    else if (item === "--host") args.host = next();
    else if (item === "--help" || item === "-h") {
      console.log("Usage: node ui_server.mjs [--port 8787] [--host 127.0.0.1]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  return args;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function text(res, status, data, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function lmRoot(baseUrl) {
  const url = new URL(baseUrl || "http://localhost:1234/v1");
  if (url.pathname.endsWith("/v1")) url.pathname = url.pathname.slice(0, -3) || "/";
  return url.toString().replace(/\/$/, "");
}

function openAiBase(baseUrl) {
  return (baseUrl || "http://localhost:1234/v1").replace(/\/$/, "");
}

async function requestJson(url, apiKey = "lm-studio", timeoutSeconds = 12) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  return JSON.parse(body);
}

async function postJson(url, payload = {}, apiKey = "lm-studio", timeoutSeconds = 12) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  return body ? JSON.parse(body) : { ok: true };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveModel(settings) {
  if (settings.model && settings.model !== "auto") return settings.model;
  const status = await fetchModelStatus({
    get(name) {
      if (name === "baseUrl") return settings.baseUrl;
      if (name === "apiKey") return settings.apiKey;
      return null;
    },
  });
  const models = status.loaded || [];
  if (!models.length) throw new Error("LM Studio meldet kein geladenes Modell unter /v1/models.");
  return models[0].id;
}

async function fetchModelDetails(settings, modelId) {
  const root = lmRoot(settings.baseUrl);
  try {
    const data = await requestJson(`${root}/api/v1/models`, settings.apiKey, 8);
    const models = data.models || data.data || [];
    const model = findAvailableModel(modelId, models);
    if (model) return normalizeModelDetails(model, modelId);
  } catch {
    // Keep evals runnable even if LM Studio changes this metadata endpoint.
  }
  return inferModelDetails(modelId);
}

function findAvailableModel(modelId, models = []) {
  const id = String(modelId || "");
  return (
    models.find((item) => item.key === id) ||
    models.find((item) => item.selected_variant === id) ||
    models.find((item) => (item.variants || []).includes(id)) ||
    models.find((item) => (item.loaded_instances || []).some((instance) => instance.id === id)) ||
    models.find((item) => item.key && id.startsWith(`${item.key}@`)) ||
    null
  );
}

function variantIdForModel(model, modelId) {
  const id = String(modelId || "");
  if ((model.variants || []).includes(id)) return id;
  if (model.key && id.startsWith(`${model.key}@`)) return id;
  return model.selected_variant || id || model.key || null;
}

function normalizeModelDetails(model, modelId) {
  const loaded = (model.loaded_instances || []).find((instance) => instance.id === modelId) || model.loaded_instances?.[0] || null;
  const selectedVariant = variantIdForModel(model, modelId);
  const quantization = inferQuantization(selectedVariant) || model.quantization?.name || inferQuantization(model.key || modelId);
  return {
    id: modelId,
    key: model.key || modelId,
    display_name: model.display_name || modelId,
    publisher: model.publisher || null,
    architecture: model.architecture || null,
    params: model.params_string || null,
    format: model.format || inferFormat(selectedVariant || model.key || modelId),
    quantization,
    bits_per_weight: inferBitsPerWeight(quantization, model.quantization?.bits_per_weight),
    selected_variant: selectedVariant,
    max_context_length: model.max_context_length || null,
    type: model.type || null,
    capabilities: model.capabilities || null,
    loaded_config: loaded?.config || null,
  };
}

function inferModelDetails(modelId) {
  return {
    id: modelId,
    key: modelId,
    display_name: modelId,
    publisher: modelId.includes("/") ? modelId.split("/")[0] : null,
    architecture: null,
    params: null,
    format: inferFormat(modelId),
    quantization: inferQuantization(modelId),
    bits_per_weight: null,
    selected_variant: null,
    max_context_length: null,
    type: null,
    capabilities: null,
    loaded_config: null,
  };
}

function inferFormat(value) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("gguf")) return "gguf";
  if (lower.includes("mlx")) return "mlx";
  if (lower.includes("safetensors")) return "safetensors";
  return null;
}

function inferQuantization(value) {
  const match = String(value || "").match(/(?:@|[-_.])((?:i?q|q)\d(?:_[a-z0-9]+){0,3}|f16|bf16|fp16|fp32)(?:$|[-_.])/i);
  return match ? match[1].toUpperCase() : null;
}

function inferBitsPerWeight(quantization, fallback = null) {
  const value = String(quantization || "").toUpperCase();
  const quantized = value.match(/^(?:I?Q)(\d+)/);
  if (quantized) return Number(quantized[1]);
  if (value === "F16" || value === "BF16" || value === "FP16") return 16;
  if (value === "FP32") return 32;
  return fallback ?? null;
}

function normalizeReasoningOption(option) {
  return String(option || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function reasoningOptionRank(option) {
  const normalized = normalizeReasoningOption(option);
  return REASONING_STRENGTH[normalized] ?? 1;
}

function reasoningOptionsFromDetails(modelDetails = {}) {
  const reasoning = modelDetails.capabilities?.reasoning;
  const options = Array.isArray(reasoning?.allowed_options) ? reasoning.allowed_options.map(String).filter(Boolean) : [];
  return {
    supported_options: options,
    default: reasoning?.default || null,
  };
}

function maxReasoningOption(modelDetails = {}) {
  const { supported_options: options } = reasoningOptionsFromDetails(modelDetails);
  const usable = options.filter((option) => reasoningOptionRank(option) > 0);
  if (!usable.length) return null;
  return usable.reduce((best, option) => (reasoningOptionRank(option) > reasoningOptionRank(best) ? option : best), usable[0]);
}

function createReasoningState(modelDetails = {}) {
  const support = reasoningOptionsFromDetails(modelDetails);
  const requested = maxReasoningOption(modelDetails);
  return {
    supported_options: support.supported_options,
    default: support.default,
    requested,
    observed: false,
    current_case_observed: false,
    completed_cases: 0,
    cases_with_reasoning: 0,
    tokens_total: 0,
    last_case_tokens: 0,
    last_case_used: false,
    using: Boolean(requested),
  };
}

function publicReasoningState(run) {
  return run.reasoningState || createReasoningState(run.modelDetails);
}

function expandLoadedModels(loadedModels = [], availableModels = []) {
  if (!availableModels.length) return loadedModels;
  const expanded = [];
  const seen = new Set();

  function add(rawModel, modelId, availableModel = null) {
    if (seen.has(modelId)) return;
    const details = availableModel ? normalizeModelDetails(availableModel, modelId) : inferModelDetails(modelId);
    if (details.type && details.type !== "llm") return;
    seen.add(modelId);
    expanded.push({
      ...rawModel,
      id: modelId,
      base_id: rawModel.id,
      display_name: details.display_name,
      model_details: details,
      format: details.format,
      quantization: details.quantization,
      params: details.params,
      selected_variant: details.selected_variant,
    });
  }

  for (const rawModel of loadedModels) {
    const availableModel = findAvailableModel(rawModel.id, availableModels);
    if (availableModel?.type && availableModel.type !== "llm") continue;
    const variants = availableModel?.variants?.length ? availableModel.variants : [rawModel.id];
    for (const variantId of variants) add(rawModel, variantId, availableModel);
  }

  return expanded.length ? expanded : loadedModels;
}

async function fetchModelStatus(query) {
  const baseUrl = query.get("baseUrl") || "http://localhost:1234/v1";
  const apiKey = query.get("apiKey") || "lm-studio";
  const root = lmRoot(baseUrl);
  const status = { baseUrl, root, loaded: [], raw_loaded: [], available: [], errors: [] };

  try {
    const loaded = await requestJson(`${openAiBase(baseUrl)}/models`, apiKey, 8);
    status.raw_loaded = loaded.data || [];
    status.loaded = status.raw_loaded;
  } catch (error) {
    status.errors.push(`/v1/models: ${error.message}`);
  }

  try {
    const available = await requestJson(`${root}/api/v1/models`, apiKey, 8);
    status.available = available.models || available.data || [];
  } catch (error) {
    status.errors.push(`/api/v1/models: ${error.message}`);
  }

  status.loaded = expandLoadedModels(status.raw_loaded, status.available);
  return status;
}

function loadedInstanceId(instance) {
  return typeof instance === "string" ? instance : instance?.id || null;
}

function modelBaseId(modelId) {
  return String(modelId || "").split("@")[0];
}

function modelMatchesTarget(model, targetId) {
  const target = String(targetId || "");
  const base = modelBaseId(target);
  if (!target) return false;
  return (
    model.key === target ||
    model.key === base ||
    model.id === target ||
    model.selected_variant === target ||
    (model.variants || []).includes(target) ||
    (model.loaded_instances || []).some((instance) => loadedInstanceId(instance) === target)
  );
}

async function fetchLmLoadState(baseUrl, apiKey, timeoutSeconds = 8) {
  const root = lmRoot(baseUrl);
  const loadedIds = new Set();
  const openAiIds = new Set();
  const errors = [];
  let available = [];
  let apiModelsReachable = false;

  try {
    const loaded = await requestJson(`${openAiBase(baseUrl)}/models`, apiKey, timeoutSeconds);
    for (const item of loaded.data || []) {
      if (item?.id) openAiIds.add(String(item.id));
    }
  } catch (error) {
    errors.push(`/v1/models: ${error.message}`);
  }

  try {
    const data = await requestJson(`${root}/api/v1/models`, apiKey, timeoutSeconds);
    apiModelsReachable = true;
    available = data.models || data.data || [];
    for (const model of available) {
      for (const instance of model.loaded_instances || []) {
        const id = loadedInstanceId(instance);
        if (id) loadedIds.add(String(id));
      }
    }
  } catch (error) {
    errors.push(`/api/v1/models: ${error.message}`);
  }

  if (!available.length && !loadedIds.size && !openAiIds.size && errors.length >= 2) {
    throw new Error(`LM Studio Modellstatus nicht erreichbar: ${errors.join("; ")}`);
  }

  return { available, loadedIds: [...loadedIds], openAiIds: [...openAiIds], apiModelsReachable, errors };
}

function targetLoadedInstanceIds(state, targetId) {
  const target = String(targetId || "");
  const base = modelBaseId(target);
  const ids = new Set();

  for (const id of state.loadedIds || []) {
    if (id === target || id === base || id.startsWith(`${base}@`)) ids.add(id);
  }
  if (!state.apiModelsReachable) {
    for (const id of state.openAiIds || []) {
      if (id === target || id === base || id.startsWith(`${base}@`)) ids.add(id);
    }
  }

  for (const model of state.available || []) {
    const instances = (model.loaded_instances || []).map(loadedInstanceId).filter(Boolean);
    const exact = instances.filter((id) => id === target || id === base || id.startsWith(`${base}@`));
    for (const id of exact) ids.add(id);
    if (!exact.length && modelMatchesTarget(model, target)) {
      for (const id of instances) ids.add(id);
    }
  }

  return [...ids];
}

function isTargetModelLoaded(state, targetId) {
  if (targetLoadedInstanceIds(state, targetId).length) return true;
  const target = String(targetId || "");
  const base = modelBaseId(target);
  return (state.available || []).some((model) => modelMatchesTarget(model, target) && (model.loaded_instances || []).length && (model.key === base || model.key === target));
}

async function unloadModelAndWait(body) {
  const baseUrl = body.baseUrl || "http://localhost:1234/v1";
  const apiKey = body.apiKey || process.env.LM_STUDIO_API_KEY || "lm-studio";
  const model = String(body.model || "").trim();
  const timeoutSeconds = Math.max(10, Number(body.timeoutSeconds || MODEL_UNLOAD_TIMEOUT_SECONDS));
  if (!model || model === "auto") throw new Error("Kein konkretes Modell zum Entladen angegeben.");

  const root = lmRoot(baseUrl);
  const started = Date.now();
  let state = await fetchLmLoadState(baseUrl, apiKey);
  if (!isTargetModelLoaded(state, model)) {
    return { ok: true, model, already_unloaded: true, unloaded_ids: [], waited_seconds: 0, status_errors: state.errors };
  }

  const unloadIds = targetLoadedInstanceIds(state, model);
  if (!unloadIds.length) unloadIds.push(model);

  const unloadErrors = [];
  for (const instanceId of [...new Set(unloadIds)]) {
    try {
      await postJson(
        `${root}/api/v1/models/unload`,
        { instance_id: instanceId },
        apiKey,
        MODEL_UNLOAD_REQUEST_TIMEOUT_SECONDS,
      );
    } catch (error) {
      unloadErrors.push(`${instanceId}: ${error.message}`);
    }
  }

  let lastError = null;
  while ((Date.now() - started) / 1000 < timeoutSeconds) {
    try {
      state = await fetchLmLoadState(baseUrl, apiKey);
      if (!isTargetModelLoaded(state, model)) {
        return {
          ok: true,
          model,
          unloaded_ids: [...new Set(unloadIds)],
          waited_seconds: round((Date.now() - started) / 1000),
          unload_errors: unloadErrors,
          status_errors: state.errors,
        };
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(MODEL_UNLOAD_POLL_MS);
  }

  const details = lastError ? ` Letzter Statusfehler: ${lastError.message}` : "";
  const unloadDetail = unloadErrors.length ? ` Entladefehler: ${unloadErrors.join("; ")}` : "";
  throw new Error(`LM Studio meldet ${model} nach ${timeoutSeconds}s weiterhin als geladen.${unloadDetail}${details}`);
}

async function loadCaseMetadata() {
  const cases = await loadCases(DEFAULT_CASES);
  const errors = validateCases(cases);
  const categories = [...new Set(cases.map((item) => item.category || "uncategorized"))].sort();
  return {
    count: cases.length,
    categories,
    errors,
    cases: cases.map((item) => publicCase(item, true)),
  };
}

async function loadCaseMap() {
  const cases = await loadCases(DEFAULT_CASES);
  return new Map(cases.map((testCase) => [testCase.id, publicCase(testCase, true)]));
}

async function listRuns() {
  if (!existsSync(RUNS_DIR)) return [];
  const entries = await readdir(RUNS_DIR, { withFileTypes: true });
  const runs = [];
  const catalog = await fetchAvailableModelCatalog();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summaryPath = path.join(RUNS_DIR, entry.name, "summary.json");
    if (!existsSync(summaryPath)) continue;
    try {
      const summary = JSON.parse(await readFile(summaryPath, "utf8"));
      hydrateSummaryModelDetails(summary, catalog);
      const needsDerivedReviewStats = summary.balanced_final_percent === undefined || summary.needs_review_count === undefined;
      if (needsDerivedReviewStats) {
        const resultsPath = path.join(RUNS_DIR, entry.name, "results.jsonl");
        if (existsSync(resultsPath)) {
          const results = (await readFile(resultsPath, "utf8"))
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => normalizeResultRecord(JSON.parse(line)));
          Object.assign(
            summary,
            summarize(results, summary.run_id || entry.name, summary.model, {
              baseUrl: summary.base_url,
              modelDetails: summary.model_details,
              temperature: summary.defaults?.temperature,
              topP: summary.defaults?.top_p,
              maxTokens: summary.defaults?.max_tokens,
              seed: summary.defaults?.seed,
              createdAt: summary.created_at,
              updatedAt: summary.updated_at,
            }),
          );
        }
      }
      hydrateBalancedScore(summary);
      hydrateFinalScores(summary);
      runs.push({
        id: entry.name,
        model: summary.model,
        model_details: summary.model_details || null,
        created_at: summary.created_at,
        updated_at: summary.updated_at || null,
        case_count: summary.case_count,
        auto_percent: summary.auto_percent,
        balanced_auto_percent: summary.balanced_auto_percent,
        final_percent: summary.final_percent,
        balanced_final_percent: summary.balanced_final_percent,
        reviewed_case_count: summary.reviewed_case_count || 0,
        needs_review_count: summary.needs_review_count || 0,
        status_counts: summary.status_counts || {},
        performance: summary.performance || {},
        categories: summary.categories || {},
      });
    } catch {
      // Skip incomplete runs.
    }
  }
  return runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function safeRunPath(runId, fileName = "") {
  const resolved = path.resolve(RUNS_DIR, runId, fileName);
  const root = path.resolve(RUNS_DIR);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid run id.");
  return resolved;
}

async function loadRun(runId) {
  const summary = JSON.parse(await readFile(safeRunPath(runId, "summary.json"), "utf8"));
  hydrateSummaryModelDetails(summary, await fetchAvailableModelCatalog());
  const caseById = await loadCaseMap();
  const resultLines = (await readFile(safeRunPath(runId, "results.jsonl"), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean);
  const results = resultLines.map((line) => attachCaseDetails(normalizeResultRecord(JSON.parse(line)), caseById));
  const derivedSummary = summarize(results, summary.run_id || runId, summary.model, {
    baseUrl: summary.base_url,
    modelDetails: summary.model_details,
    temperature: summary.defaults?.temperature,
    topP: summary.defaults?.top_p,
    maxTokens: summary.defaults?.max_tokens,
    seed: summary.defaults?.seed,
    createdAt: summary.created_at,
    updatedAt: summary.updated_at,
  });
  hydrateBalancedScore(derivedSummary);
  hydrateFinalScores(derivedSummary);
  return { summary: derivedSummary, results };
}

async function deleteRun(runId) {
  if (!runId || runId.includes("/") || runId.includes("\\") || runId.includes("..")) {
    throw new Error("Invalid run id.");
  }
  await rm(safeRunPath(runId), { recursive: true, force: false });
}

async function updateReview(runId, caseId, body, clear = false) {
  const loaded = await loadRun(runId);
  const results = loaded.results.map((record) => normalizeResultRecord(record));
  const index = results.findIndex((record) => record.id === caseId);
  if (index === -1) throw new Error(`Case not found in run: ${caseId}`);
  results[index] = clear ? clearReview(results[index]) : applyReview(results[index], body);
  const updatedAt = new Date().toISOString();
  const summary = summarize(results, loaded.summary.run_id || runId, loaded.summary.model, {
    baseUrl: loaded.summary.base_url,
    modelDetails: loaded.summary.model_details,
    temperature: loaded.summary.defaults?.temperature,
    topP: loaded.summary.defaults?.top_p,
    maxTokens: loaded.summary.defaults?.max_tokens,
    seed: loaded.summary.defaults?.seed,
    createdAt: loaded.summary.created_at,
    updatedAt,
  });
  await writeRunFiles(safeRunPath(runId).replaceAll("\\", "/"), results, summary);
  return { summary, record: results[index], results };
}

function hydrateBalancedScore(summary) {
  if (summary.balanced_auto_percent !== undefined && summary.balanced_auto_percent !== null) return summary;
  const values = Object.values(summary.categories || {})
    .map((data) => (data.auto_possible ? (data.auto_earned / data.auto_possible) * 100 : data.possible ? (data.earned / data.possible) * 100 : null))
    .filter((value) => value !== null);
  summary.balanced_auto_percent = values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
    : null;
  return summary;
}

function hydrateFinalScores(summary) {
  if (summary.final_percent === undefined || summary.final_percent === null) {
    summary.final_earned = summary.final_earned ?? summary.auto_earned ?? 0;
    summary.final_possible = summary.final_possible ?? summary.auto_possible ?? 0;
    summary.final_percent = summary.auto_percent ?? null;
  }
  for (const data of Object.values(summary.categories || {})) {
    data.auto_earned = data.auto_earned ?? data.earned ?? 0;
    data.auto_possible = data.auto_possible ?? data.possible ?? 0;
    data.final_earned = data.final_earned ?? data.earned ?? data.auto_earned ?? 0;
    data.final_possible = data.final_possible ?? data.possible ?? data.auto_possible ?? 0;
    data.earned = data.final_earned;
    data.possible = data.final_possible;
    data.reviewed_cases = data.reviewed_cases ?? 0;
    data.needs_review_cases = data.needs_review_cases ?? 0;
  }
  if (summary.balanced_final_percent === undefined || summary.balanced_final_percent === null) {
    const values = Object.values(summary.categories || {})
      .map((data) => (data.final_possible ? (data.final_earned / data.final_possible) * 100 : null))
      .filter((value) => value !== null);
    summary.balanced_final_percent = values.length
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
      : summary.balanced_auto_percent ?? null;
  }
  summary.reviewed_case_count = summary.reviewed_case_count ?? 0;
  summary.needs_review_count = summary.needs_review_count ?? 0;
  summary.status_counts = summary.status_counts ?? {};
  return summary;
}

async function fetchAvailableModelCatalog() {
  try {
    const data = await requestJson("http://localhost:1234/api/v1/models", "lm-studio", 3);
    return data.models || data.data || [];
  } catch {
    return [];
  }
}

function hydrateSummaryModelDetails(summary, catalog) {
  if (summary.model_details) return summary;
  const match = findAvailableModel(summary.model, catalog);
  summary.model_details = match ? normalizeModelDetails(match, summary.model) : inferModelDetails(summary.model);
  return summary;
}

function emit(run, type, payload = {}) {
  const event = {
    type,
    at: new Date().toISOString(),
    ...payload,
  };
  run.events.push(event);
  const encoded = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of run.clients) client.write(encoded);
}

function emitReasoningStatus(run) {
  emit(run, "reasoning_status", {
    runId: run.id,
    reasoning_status: publicReasoningState(run),
  });
}

function sendReplay(run, res) {
  for (const event of run.events) {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
}

function buildSettings(body) {
  return {
    baseUrl: body.baseUrl || "http://localhost:1234/v1",
    apiKey: body.apiKey || process.env.LM_STUDIO_API_KEY || "lm-studio",
    model: body.model || "auto",
    categories: Array.isArray(body.categories) ? body.categories : [],
    limit: body.limit ? Number(body.limit) : null,
    timeout: body.timeout ? Number(body.timeout) : 900,
    temperature: Number(body.temperature ?? 0),
    topP: Number(body.topP ?? 1),
    maxTokens: body.maxTokens === null || body.maxTokens === undefined || body.maxTokens === "" ? null : Number(body.maxTokens),
    contextLength: body.contextLength ? Number(body.contextLength) : null,
  };
}

async function startRun(body) {
  const settings = buildSettings(body);
  const model = await resolveModel(settings);
  const modelDetails = await fetchModelDetails(settings, model);
  const reasoningState = createReasoningState(modelDetails);
  settings.reasoning = reasoningState.requested;
  settings.reasoning_supported_options = reasoningState.supported_options;
  settings.reasoning_default = reasoningState.default;
  const runId = `${timestamp()}-${slugify(model)}`;
  const run = {
    id: runId,
    model,
    modelDetails,
    reasoningState,
    settings,
    status: "queued",
    clients: new Set(),
    events: [],
    results: [],
    currentAbort: null,
    currentCaseAbortRequested: false,
    currentCaseAbortReason: "",
    currentCaseAbortSource: "",
    stopRequested: false,
  };
  activeRuns.set(runId, run);
  runEval(run).catch((error) => {
    run.status = "failed";
    emit(run, "run_failed", { message: error.message });
  });
  return run;
}

async function runEval(run) {
  run.status = "running";
  await mkdir(RUNS_DIR, { recursive: true });
  const runDir = path.join(RUNS_DIR, run.id);
  await mkdir(runDir, { recursive: true });

  let cases = await loadCases(DEFAULT_CASES);
  const errors = validateCases(cases);
  if (errors.length) throw new Error(errors.join("\n"));
  if (run.settings.categories.length) {
    const allowed = new Set(run.settings.categories);
    cases = cases.filter((testCase) => allowed.has(testCase.category));
  }
  if (run.settings.limit) cases = cases.slice(0, run.settings.limit);

  emit(run, "run_started", {
    runId: run.id,
    model: run.model,
    model_details: run.modelDetails,
    reasoning_status: publicReasoningState(run),
    total: cases.length,
    settings: publicSettings(run.settings),
  });

  for (const [index, testCase] of cases.entries()) {
    if (run.stopRequested) break;
    const caseIndex = index + 1;
    run.currentCaseAbortRequested = false;
    run.currentCaseAbortReason = "";
    run.currentCaseAbortSource = "";
    if (run.reasoningState) {
      run.reasoningState.current_case_observed = false;
      run.reasoningState.last_case_tokens = 0;
      run.reasoningState.last_case_used = false;
      run.reasoningState.using = Boolean(run.reasoningState.requested);
      emitReasoningStatus(run);
    }
    emit(run, "case_started", {
      index: caseIndex,
      total: cases.length,
      case: publicCase(testCase),
    });
    const record = await executeCase(run, testCase, caseIndex, cases.length);
    run.results.push(record);
    const partialSummary = summarize(run.results, run.id, run.model, {
      ...run.settings,
      baseUrl: run.settings.baseUrl,
      modelDetails: run.modelDetails,
    });
    emit(run, "case_finished", {
      index: caseIndex,
      total: cases.length,
      record,
      summary: partialSummary,
    });
  }

  const summary = summarize(run.results, run.id, run.model, {
    ...run.settings,
    baseUrl: run.settings.baseUrl,
    modelDetails: run.modelDetails,
  });
  await writeRunFiles(runDir.replaceAll("\\", "/"), run.results, summary);
  run.status = run.stopRequested ? "stopped" : "finished";
  emit(run, "run_finished", {
    status: run.status,
    runId: run.id,
    summary,
    reportPath: path.join(runDir, "report.md"),
  });
}

function publicSettings(settings) {
  const { apiKey, ...safe } = settings;
  return safe;
}

function publicCase(testCase, includeDetails = false) {
  const nativePayload = includeDetails ? caseNativePayload(testCase) : null;
  const base = {
    id: testCase.id,
    title: testCase.title || "",
    category: testCase.category || "uncategorized",
    tags: testCase.tags || [],
    auto_points: (testCase.scoring?.auto || []).reduce((sum, check) => sum + Number(check.points || 1), 0),
    manual: Boolean(testCase.scoring?.manual_rubric?.length),
  };
  if (!includeDetails) return base;
  return {
    ...base,
    prompt: testCase.prompt || "",
    system: testCase.system || "",
    messages: caseMessages(testCase),
    input: nativePayload.input,
    system_prompt: nativePayload.system_prompt,
    scoring: {
      auto: (testCase.scoring?.auto || []).map((check) => ({ ...check })),
      manual_rubric: testCase.scoring?.manual_rubric || [],
    },
  };
}

function attachCaseDetails(record, caseById) {
  const test = record.test || caseById.get(record.id) || null;
  return test ? { ...record, test } : record;
}

async function executeCase(run, testCase, index, total) {
  const generation = {
    temperature: run.settings.temperature,
    top_p: run.settings.topP,
  };
  if (run.settings.maxTokens) generation.max_output_tokens = run.settings.maxTokens;
  const nativePayload = caseNativePayload(testCase);
  const payload = {
    model: run.model,
    input: nativePayload.input,
    system_prompt: nativePayload.system_prompt,
    stream: true,
    store: false,
    ...generation,
  };
  if (run.settings.contextLength) payload.context_length = run.settings.contextLength;
  if (run.settings.reasoning) payload.reasoning = run.settings.reasoning;

  const started = performance.now();
  let promptStart = null;
  let promptEnd = null;
  let firstTokenAt = null;
  let output = "";
  let reasoning = "";
  let reasoningObservedThisCase = false;
  let stats = {};
  let streamError = null;
  let caseAborted = false;
  let caseAbortSource = "";
  let watchdogTimer = null;
  let caseTimeoutTimer = null;
  let lastActivityAt = performance.now();
  let generationStartedAt = null;
  let lastAnswerTokenAt = null;
  let reasoningWindowStartedAt = performance.now();
  let reasoningWindowLength = 0;
  const abort = new AbortController();
  run.currentAbort = abort;

  function abortCurrentCase(source, message) {
    if (abort.signal.aborted || run.stopRequested) return;
    run.currentCaseAbortRequested = true;
    run.currentCaseAbortSource = source;
    run.currentCaseAbortReason = message;
    emit(run, "case_aborting", { runId: run.id, index, total, source, message });
    abort.abort(createAbortError(message));
  }

  function markActivity() {
    lastActivityAt = performance.now();
  }

  try {
    const timeoutSeconds = Math.max(1, Number(run.settings.timeout || 900));
    caseTimeoutTimer = setTimeout(() => {
      abortCurrentCase(
        "watchdog_timeout",
        `Watchdog: Einzeltest-Timeout nach ${timeoutSeconds}s erreicht. Einzeltest wird als nicht bestanden gewertet.`,
      );
    }, timeoutSeconds * 1000);
    caseTimeoutTimer.unref?.();

    watchdogTimer = setInterval(() => {
      if (abort.signal.aborted || run.stopRequested) return;
      const idleSeconds = (performance.now() - lastActivityAt) / 1000;
      if (idleSeconds >= WATCHDOG_IDLE_SECONDS) {
        abortCurrentCase(
          "watchdog_idle",
          `Watchdog: Seit ${Math.round(idleSeconds)}s keine Aktivität im Stream. Einzeltest wird als nicht bestanden gewertet.`,
        );
        return;
      }
      const outputLoop = detectOutputLoop(output);
      if (outputLoop) {
        abortCurrentCase(
          "watchdog_loop",
          `Watchdog: Ausgabe wirkt wie eine Schleife (${outputLoop.detail}). Einzeltest wird als nicht bestanden gewertet.`,
        );
        return;
      }
      if (generationStartedAt) {
        const now = performance.now();
        const reasoningReviewSeconds = (now - generationStartedAt) / 1000;
        const answerWaitStartedAt = lastAnswerTokenAt || generationStartedAt;
        const secondsWithoutAnswer = (now - answerWaitStartedAt) / 1000;
        const reasoningWindowSeconds = (now - reasoningWindowStartedAt) / 1000;
        if (
          reasoningReviewSeconds >= WATCHDOG_REASONING_REVIEW_SECONDS &&
          secondsWithoutAnswer >= WATCHDOG_REASONING_STALL_SECONDS
        ) {
          const reasoningLoop = detectOutputLoop(reasoning) || detectReasoningLoop(reasoning);
          if (reasoningLoop) {
            abortCurrentCase(
              "watchdog_reasoning_loop",
              `Watchdog: Reasoning wirkt wie eine Schleife (${reasoningLoop.detail}). Einzeltest wird als nicht bestanden gewertet.`,
            );
            return;
          }
        }
        if (reasoningWindowSeconds >= WATCHDOG_REASONING_STALL_SECONDS) {
          const reasoningLength = normalizedReasoningLength(reasoning);
          const newReasoningChars = reasoningLength - reasoningWindowLength;
          if (
            reasoningReviewSeconds >= WATCHDOG_REASONING_REVIEW_SECONDS &&
            secondsWithoutAnswer >= WATCHDOG_REASONING_STALL_SECONDS &&
            newReasoningChars < WATCHDOG_REASONING_MIN_NEW_CHARS
          ) {
            abortCurrentCase(
              "watchdog_reasoning_stalled",
              `Watchdog: Reasoning zeigt seit ${Math.round(reasoningWindowSeconds)}s kaum Fortschritt (${newReasoningChars} neue Zeichen) und es kommen keine finalen Antworttokens. Einzeltest wird als nicht bestanden gewertet.`,
            );
            return;
          }
          reasoningWindowStartedAt = now;
          reasoningWindowLength = reasoningLength;
        }
      }
    }, WATCHDOG_CHECK_INTERVAL_MS);

    const response = await fetch(`${lmRoot(run.settings.baseUrl)}/api/v1/chat`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${run.settings.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: abort.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LM Studio HTTP ${response.status}: ${detail}`);
    }
    await readSse(response, (eventName, data) => {
      markActivity();
      const type = data.type || eventName;
      if (type === "model_load.progress") {
        emit(run, "case_progress", { index, total, phase: "model_load", progress: data.progress ?? 0 });
      } else if (type === "prompt_processing.start") {
        promptStart = performance.now();
        emit(run, "case_progress", { index, total, phase: "prefill", progress: 0 });
      } else if (type === "prompt_processing.progress") {
        emit(run, "case_progress", { index, total, phase: "prefill", progress: data.progress ?? 0 });
      } else if (type === "prompt_processing.end") {
        promptEnd = performance.now();
        generationStartedAt = performance.now();
        reasoningWindowStartedAt = generationStartedAt;
        reasoningWindowLength = normalizedReasoningLength(reasoning);
        emit(run, "case_progress", { index, total, phase: "generate", progress: 0 });
      } else if (type === "reasoning.start") {
        reasoningObservedThisCase = true;
        if (run.reasoningState && !run.reasoningState.current_case_observed) {
          run.reasoningState.current_case_observed = true;
          run.reasoningState.observed = true;
          run.reasoningState.using = true;
          emitReasoningStatus(run);
        }
      } else if (type === "reasoning.delta") {
        const delta = data.content || "";
        reasoning += delta;
        if (delta) {
          reasoningObservedThisCase = true;
          if (run.reasoningState && !run.reasoningState.current_case_observed) {
            run.reasoningState.current_case_observed = true;
            run.reasoningState.observed = true;
            run.reasoningState.using = true;
            emitReasoningStatus(run);
          }
        }
      } else if (type === "message.delta") {
        if (firstTokenAt === null) firstTokenAt = performance.now();
        const delta = data.content || "";
        if (delta) lastAnswerTokenAt = performance.now();
        output += delta;
        emit(run, "case_delta", {
          index,
          total,
          delta,
          output_tail: output.slice(-1200),
          output_tokens_estimate: estimateTokens(output),
          elapsed_seconds: round((performance.now() - started) / 1000),
        });
      } else if (type === "error") {
        streamError = data.error?.message || JSON.stringify(data.error || data);
        emit(run, "case_warning", { index, total, message: streamError });
      } else if (type === "chat.end") {
        stats = data.result?.stats || {};
        const finalText = extractMessageOutput(data.result?.output || []);
        if (finalText && finalText.length >= output.length) output = finalText;
      }
    }, { signal: abort.signal });
  } catch (error) {
    caseAborted = error.name === "AbortError" && run.currentCaseAbortRequested && !run.stopRequested;
    if (error.name === "AbortError" && run.stopRequested) {
      streamError = "Run stopped by user.";
    } else if (caseAborted) {
      streamError = run.currentCaseAbortReason || "Einzeltest abgebrochen.";
      caseAbortSource = run.currentCaseAbortSource || "manual";
    } else {
      streamError = error.message;
    }
  } finally {
    if (watchdogTimer) clearInterval(watchdogTimer);
    if (caseTimeoutTimer) clearTimeout(caseTimeoutTimer);
    run.currentAbort = null;
    run.currentCaseAbortRequested = false;
    run.currentCaseAbortReason = "";
    run.currentCaseAbortSource = "";
  }

  const totalSeconds = round((performance.now() - started) / 1000);
  const promptProcessingSeconds =
    promptStart !== null && promptEnd !== null ? round((promptEnd - promptStart) / 1000) : 0;
  const measuredTtft = firstTokenAt !== null ? round((firstTokenAt - started) / 1000) : 0;
  const outputTokens = Number(stats.total_output_tokens || stats.output_tokens || estimateTokens(output));
  const inputTokens = Number(stats.input_tokens || estimateTokens(`${nativePayload.system_prompt}\n${nativePayload.input}`));
  const timeToFirst = Number(stats.time_to_first_token_seconds || measuredTtft || 0);
  const tokensPerSecond =
    Number(stats.tokens_per_second) ||
    round(outputTokens / Math.max(0.001, totalSeconds - Math.max(0, timeToFirst)));

  const metrics = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_output_tokens: outputTokens,
    reasoning_output_tokens: Number(stats.reasoning_output_tokens || 0),
    stop_reason: caseAborted ? caseAbortSource || "case_aborted" : stats.stop_reason || stats.stopReason || null,
    tokens_per_second: round(tokensPerSecond),
    time_to_first_token_seconds: round(timeToFirst),
    prompt_processing_seconds: promptProcessingSeconds,
    model_load_time_seconds: round(stats.model_load_time_seconds || 0),
    total_seconds: totalSeconds,
    measured: {
      ttft_seconds: measuredTtft,
      output_tokens_estimate: estimateTokens(output),
    },
  };
  if (run.reasoningState) {
    const reasoningTokens = Number(metrics.reasoning_output_tokens || 0);
    const caseUsedReasoning = reasoningObservedThisCase || reasoningTokens > 0 || Boolean(reasoning);
    run.reasoningState.completed_cases += 1;
    run.reasoningState.last_case_tokens = reasoningTokens;
    run.reasoningState.last_case_used = caseUsedReasoning;
    run.reasoningState.current_case_observed = caseUsedReasoning;
    run.reasoningState.observed = run.reasoningState.observed || caseUsedReasoning;
    run.reasoningState.tokens_total += reasoningTokens;
    if (caseUsedReasoning) run.reasoningState.cases_with_reasoning += 1;
    run.reasoningState.using = Boolean(run.reasoningState.requested && caseUsedReasoning);
    emitReasoningStatus(run);
  }
  const score = caseAborted
    ? failedScore(testCase, streamError, { status: "auto_failed", confidence: "high", needsReview: false })
    : streamError
      ? failedScore(testCase, streamError)
      : scoreOutput(testCase, output);
  return {
    id: testCase.id,
    title: testCase.title || "",
    category: testCase.category || "uncategorized",
    tags: testCase.tags || [],
    source: testCase._source,
    test: publicCase(testCase, true),
    generation,
    latency_seconds: totalSeconds,
    output,
    reasoning,
    aborted: caseAborted,
    abort_source: caseAbortSource || null,
    score,
    error: streamError,
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
    metrics,
  };
}

function extractMessageOutput(outputItems) {
  if (!Array.isArray(outputItems)) return "";
  return outputItems
    .filter((item) => item.type === "message")
    .map((item) => item.content || "")
    .join("\n");
}

function detectOutputLoop(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length < WATCHDOG_LOOP_MIN_CHARS) return null;
  const tail = normalized.slice(-2400);

  for (let size = 24; size <= 180; size += 12) {
    const chunk = tail.slice(-size);
    if (chunk.trim().length < 12) continue;
    let repeats = 1;
    for (let offset = size * 2; offset <= Math.min(tail.length, size * 10); offset += size) {
      const previous = tail.slice(-offset, -offset + size);
      if (previous !== chunk) break;
      repeats += 1;
    }
    if (repeats >= WATCHDOG_LOOP_MIN_REPEATS) {
      return { detail: `${repeats}x wiederholter Textblock` };
    }
  }

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 16)
    .slice(-12);
  if (lines.length >= WATCHDOG_LOOP_MIN_REPEATS) {
    const last = lines.at(-1);
    const repeated = lines.filter((line) => line === last).length;
    if (repeated >= WATCHDOG_LOOP_MIN_REPEATS) {
      return { detail: `${repeated}x wiederholte Zeile` };
    }
  }

  return null;
}

function normalizedReasoningLength(text) {
  return String(text || "").replace(/\s+/g, " ").trim().length;
}

function detectReasoningLoop(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("de-DE");
  if (normalized.length < WATCHDOG_LOOP_MIN_CHARS) return null;

  const words = normalized.match(/[\p{L}\p{N}_-]{3,}/gu) || [];
  if (words.length < 120) return null;
  const tailWords = words.slice(-700);

  const repeatedNgram = mostRepeatedNgram(tailWords, 5);
  if (repeatedNgram?.count >= 7) {
    return { detail: `${repeatedNgram.count}x wiederholtes Argumentmuster` };
  }

  const lastBlock = tailWords.slice(-80);
  const previousBlocks = [];
  for (let end = tailWords.length - 80; end >= 80 && previousBlocks.length < 5; end -= 80) {
    previousBlocks.push(tailWords.slice(end - 80, end));
  }
  const similarBlockCount = previousBlocks.filter((block) => jaccardSimilarity(lastBlock, block) >= 0.82).length;
  if (similarBlockCount >= 2) {
    return { detail: `${similarBlockCount + 1} sehr ähnliche Reasoning-Abschnitte` };
  }

  const meaningful = tailWords.filter((word) => !COMMON_REASONING_WORDS.has(word));
  if (meaningful.length >= 180) {
    const uniqueRatio = new Set(meaningful).size / meaningful.length;
    if (uniqueRatio < 0.18) {
      return { detail: `sehr geringe Wortvielfalt im Reasoning (${Math.round(uniqueRatio * 100)}%)` };
    }
  }

  return null;
}

function mostRepeatedNgram(words, size) {
  const counts = new Map();
  for (let index = 0; index <= words.length - size; index += 1) {
    const key = words.slice(index, index + size).join(" ");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  for (const [text, count] of counts.entries()) {
    if (!best || count > best.count) best = { text, count };
  }
  return best;
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  for (const item of leftSet) {
    if (rightSet.has(item)) intersection += 1;
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}

const COMMON_REASONING_WORDS = new Set([
  "and",
  "are",
  "but",
  "can",
  "das",
  "der",
  "die",
  "for",
  "ich",
  "mit",
  "not",
  "that",
  "the",
  "und",
  "was",
  "werden",
  "with",
]);

function createAbortError(message = "Operation aborted") {
  if (typeof DOMException === "function") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function abortErrorFromSignal(signal, fallback = "Operation aborted") {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return createAbortError(typeof reason === "string" ? reason : fallback);
}

async function readSse(response, onEvent, { signal } = {}) {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];
  const reader = response.body?.getReader?.();
  if (!reader) throw new Error("Response stream is not readable.");

  function flush() {
    if (!dataLines.length) {
      eventName = "message";
      return;
    }
    const raw = dataLines.join("\n");
    dataLines = [];
    try {
      onEvent(eventName, JSON.parse(raw));
    } catch {
      onEvent(eventName, { type: eventName, raw });
    }
    eventName = "message";
  }

  const abortReader = () => {
    reader.cancel(signal?.reason).catch(() => {});
  };
  if (signal?.aborted) throw abortErrorFromSignal(signal);
  signal?.addEventListener("abort", abortReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) throw abortErrorFromSignal(signal);
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let lineEnd;
      while ((lineEnd = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, lineEnd).replace(/\r$/, "");
        buffer = buffer.slice(lineEnd + (buffer[lineEnd] === "\r" && buffer[lineEnd + 1] === "\n" ? 2 : 1));
        if (line === "") {
          flush();
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
    if (signal?.aborted) throw abortErrorFromSignal(signal);
    buffer += decoder.decode();
    flush();
  } catch (error) {
    if (signal?.aborted) throw abortErrorFromSignal(signal);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortReader);
    try {
      reader.releaseLock();
    } catch {}
  }
}

async function serveStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(WEB_DIR, `.${decodeURIComponent(requestPath)}`);
  if (!resolved.startsWith(path.resolve(WEB_DIR))) {
    text(res, 403, "Forbidden");
    return;
  }
  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    text(res, 404, "Not found");
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      json(res, 200, {
        ok: true,
        app: "local-model-bench",
        version: "0.1.0",
        pid: process.pid,
        time: new Date().toISOString(),
      });
      return;
    }
    if (req.method === "GET" && pathname === "/api/models") {
      json(res, 200, await fetchModelStatus(url.searchParams));
      return;
    }
    if (req.method === "GET" && pathname === "/api/cases") {
      json(res, 200, await loadCaseMetadata());
      return;
    }
    if (req.method === "GET" && pathname === "/api/runs") {
      json(res, 200, await listRuns());
      return;
    }
    const reviewMatch = pathname.match(/^\/api\/runs\/([^/]+)\/results\/([^/]+)\/review$/);
    if (reviewMatch && req.method === "POST") {
      const runId = decodeURIComponent(reviewMatch[1]);
      const caseId = decodeURIComponent(reviewMatch[2]);
      json(res, 200, await updateReview(runId, caseId, await readRequestBody(req)));
      return;
    }
    if (reviewMatch && req.method === "DELETE") {
      const runId = decodeURIComponent(reviewMatch[1]);
      const caseId = decodeURIComponent(reviewMatch[2]);
      json(res, 200, await updateReview(runId, caseId, {}, true));
      return;
    }
    if (req.method === "GET" && pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(pathname.split("/").at(-1));
      json(res, 200, await loadRun(runId));
      return;
    }
    if (req.method === "DELETE" && pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(pathname.split("/").at(-1));
      await deleteRun(runId);
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && pathname === "/api/models/unload") {
      json(res, 200, await unloadModelAndWait(await readRequestBody(req)));
      return;
    }
    if (req.method === "POST" && pathname === "/api/evals/start") {
      const run = await startRun(await readRequestBody(req));
      json(res, 200, { runId: run.id, model: run.model });
      return;
    }
    if (req.method === "GET" && pathname.match(/^\/api\/evals\/[^/]+\/events$/)) {
      const runId = decodeURIComponent(pathname.split("/")[3]);
      const run = activeRuns.get(runId);
      if (!run) {
        json(res, 404, { error: "Run not found or already closed." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      run.clients.add(res);
      sendReplay(run, res);
      req.on("close", () => run.clients.delete(res));
      return;
    }
    if (req.method === "POST" && pathname.match(/^\/api\/evals\/[^/]+\/stop$/)) {
      const runId = decodeURIComponent(pathname.split("/")[3]);
      const run = activeRuns.get(runId);
      if (!run) {
        json(res, 404, { error: "Run not found." });
        return;
      }
      run.stopRequested = true;
      run.currentAbort?.abort();
      emit(run, "run_stopping", { runId });
      json(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && pathname.match(/^\/api\/evals\/[^/]+\/abort-case$/)) {
      const runId = decodeURIComponent(pathname.split("/")[3]);
      const run = activeRuns.get(runId);
      if (!run) {
        json(res, 404, { error: "Run not found or already closed." });
        return;
      }
      if (!run.currentAbort || run.status !== "running") {
        json(res, 409, { error: "No active test to abort." });
        return;
      }
      run.currentCaseAbortRequested = true;
      run.currentCaseAbortReason = "Einzeltest vom Nutzer abgebrochen.";
      run.currentCaseAbortSource = "manual";
      run.currentAbort.abort();
      emit(run, "case_aborting", { runId, source: "manual", message: run.currentCaseAbortReason });
      json(res, 200, { ok: true });
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

const args = parseArgs(process.argv.slice(2));
const server = createServer(route);
server.listen(args.port, args.host, () => {
  console.log(`Eval UI: http://${args.host}:${args.port}`);
});
