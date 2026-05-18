#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  caseMessages,
  estimateTokens,
  failedScore,
  loadCases,
  round,
  scoreOutput,
  slugify,
  summarize,
  timestamp,
  validateCases,
  writeRunFiles,
} from "./eval_lib.mjs";

const CASE_FILES = {
  de: "testfaelle/praxis_de.json",
  en: "testfaelle/praxis_en.json",
};

function normalizeSuiteLanguage(value) {
  return value === "en" ? "en" : "de";
}

function languageFromCases(filePath, fallback = "de") {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  if (normalized.endsWith("/praxis_en.json") || normalized === "testfaelle/praxis_en.json") return "en";
  if (normalized.endsWith("/praxis_de.json") || normalized === "testfaelle/praxis_de.json") return "de";
  return normalizeSuiteLanguage(fallback);
}

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:1234/v1",
    apiKey: process.env.LM_STUDIO_API_KEY || "lm-studio",
    model: "auto",
    language: "de",
    cases: null,
    outputDir: "runs",
    categories: [],
    limit: null,
    timeout: 900,
    temperature: 0,
    topP: 1,
    maxTokens: null,
    seed: 42,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`Missing value after ${item}`);
      return argv[index];
    };
    if (item === "--base-url") args.baseUrl = next();
    else if (item === "--api-key") args.apiKey = next();
    else if (item === "--model") args.model = next();
    else if (item === "--lang" || item === "--language") args.language = normalizeSuiteLanguage(next());
    else if (item === "--cases") args.cases = next();
    else if (item === "--output-dir") args.outputDir = next();
    else if (item === "--category") args.categories.push(next());
    else if (item === "--limit") args.limit = Number.parseInt(next(), 10);
    else if (item === "--timeout") args.timeout = Number.parseFloat(next());
    else if (item === "--temperature") args.temperature = Number.parseFloat(next());
    else if (item === "--top-p") args.topP = Number.parseFloat(next());
    else if (item === "--max-tokens") args.maxTokens = Number.parseInt(next(), 10);
    else if (item === "--seed") args.seed = Number.parseInt(next(), 10);
    else if (item === "--dry-run") args.dryRun = true;
    else if (item === "--help" || item === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }
  args.cases ||= CASE_FILES[normalizeSuiteLanguage(args.language)];
  args.suiteLanguage = languageFromCases(args.cases, args.language);
  args.suiteId = `praxis_${args.suiteLanguage}`;
  args.suiteFile = args.cases;
  return args;
}

function printHelp() {
  console.log(`Run practical quality evals against LM Studio.

Usage:
  node run_eval.mjs [options]

Options:
  --base-url <url>       LM Studio OpenAI-compatible base URL
  --model <id|auto>      Model id, or auto for first loaded model
  --lang <de|en>         Suite language when --cases is omitted. Default: de
  --cases <file>         JSON or JSONL test case file
  --category <name>      Run only one category; can be repeated
  --limit <n>            Run first N matching cases
  --temperature <n>      Default: 0
  --top-p <n>            Default: 1
  --timeout <seconds>    Default: 900
  --max-tokens <n>       Optional. Omit for no eval-suite output cap.
  --seed <n>             Default: 42
  --dry-run              Validate cases without calling LM Studio
`);
}

async function requestJson(method, url, payload, apiKey, timeoutSeconds) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(timeoutSeconds * 1000),
  };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error(`Could not reach ${url}: ${error.message}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function resolveModel(args) {
  if (args.model !== "auto") return args.model;
  const data = await requestJson("GET", `${args.baseUrl.replace(/\/$/, "")}/models`, undefined, args.apiKey, args.timeout);
  const models = data.data || [];
  if (models.length === 0) throw new Error("LM Studio returned no loaded models from /v1/models.");
  if (!models[0].id) throw new Error(`Unexpected /v1/models response: ${JSON.stringify(data)}`);
  return models[0].id;
}

async function callChatCompletion(args, model, messages, generation) {
  const payload = {
    model,
    messages,
    stream: false,
  };
  for (const [key, value] of Object.entries(generation)) {
    if (value !== null && value !== undefined && value !== "") payload[key] = value;
  }
  const data = await requestJson(
    "POST",
    `${args.baseUrl.replace(/\/$/, "")}/chat/completions`,
    payload,
    args.apiKey,
    args.timeout,
  );
  const content = data?.choices?.[0]?.message?.content;
  if (content === undefined || content === null) {
    throw new Error(`Unexpected chat completion response: ${JSON.stringify(data)}`);
  }
  return [String(content), data];
}

function filterCases(cases, args) {
  let selected = cases;
  if (args.categories.length) {
    const allowed = new Set(args.categories);
    selected = selected.filter((testCase) => allowed.has(testCase.category));
  }
  if (args.limit !== null) selected = selected.slice(0, args.limit);
  return selected;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.cases)) throw new Error(`Cases file not found: ${args.cases}`);
  const cases = filterCases(await loadCases(args.cases), args);
  const errors = validateCases(cases);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 2;
    return;
  }

  if (args.dryRun) {
    const autoPoints = cases.reduce(
      (sum, testCase) => sum + (testCase.scoring?.auto || []).reduce((inner, check) => inner + Number(check.points || 1), 0),
      0,
    );
    const manualCases = cases.filter((testCase) => testCase.scoring?.manual_rubric?.length).length;
    console.log(`Validated ${cases.length} case(s), ${autoPoints.toFixed(1)} automatic points, ${manualCases} manual rubric case(s).`);
    return;
  }

  const model = await resolveModel(args);
  const runId = `${timestamp()}-${slugify(model)}`;
  const runDir = path.join(args.outputDir, runId);
  await mkdir(runDir, { recursive: true });

  const defaultGeneration = {
    temperature: args.temperature,
    top_p: args.topP,
    seed: args.seed,
  };
  if (args.maxTokens) defaultGeneration.max_tokens = args.maxTokens;

  const results = [];
  console.log(`Running ${cases.length} case(s) against ${model} via ${args.baseUrl}`);
  for (const [index, testCase] of cases.entries()) {
    const generation = { ...defaultGeneration, ...(testCase.generation || {}) };
    const started = performance.now();
    let output = "";
    let rawResponse = null;
    let error = null;
    try {
      [output, rawResponse] = await callChatCompletion(args, model, caseMessages(testCase), generation);
    } catch (caught) {
      error = `${caught.name}: ${caught.message}`;
    }
    const latency = round((performance.now() - started) / 1000);
    const usage = rawResponse?.usage || {};
    const outputTokens = Number(usage.completion_tokens || estimateTokens(output));
    const score = error ? failedScore(testCase, error) : scoreOutput(testCase, output);
    const record = {
      id: testCase.id,
      title: testCase.title || "",
      category: testCase.category || "uncategorized",
      tags: testCase.tags || [],
      source: testCase._source,
      generation,
      latency_seconds: latency,
      output,
      score,
      error,
      usage,
      metrics: {
        input_tokens: Number(usage.prompt_tokens || 0),
        output_tokens: outputTokens,
        total_output_tokens: outputTokens,
        reasoning_output_tokens: 0,
        tokens_per_second: round(outputTokens / Math.max(0.001, latency)),
        time_to_first_token_seconds: 0,
        prompt_processing_seconds: 0,
        model_load_time_seconds: 0,
        total_seconds: latency,
        measured: {
          ttft_seconds: 0,
          output_tokens_estimate: estimateTokens(output),
        },
      },
    };
    results.push(record);
    const scoreLabel = score.final_percent === null ? "n/a" : `${score.final_percent}%`;
    const reviewLabel = score.needs_review ? ", review" : "";
    console.log(
      `[${String(index + 1).padStart(2, "0")}/${String(cases.length).padStart(2, "0")}] ${testCase.id}: ${scoreLabel}${reviewLabel} (${latency}s)`,
    );
  }

  const summary = summarize(results, runId, model, args);
  await writeRunFiles(runDir.replaceAll("\\", "/"), results, summary);
  console.log("");
  console.log(`Done. Report: ${path.join(runDir, "report.md")}`);
  console.log(`Results: ${path.join(runDir, "results.jsonl")}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
