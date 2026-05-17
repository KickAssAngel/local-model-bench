const state = {
  cases: [],
  categories: [],
  runs: [],
  runDetails: new Map(),
  modelStatus: { loaded: [], available: [] },
  comparisonRenderId: 0,
  compareFilters: {
    search: "",
    quantization: "all",
    modelKind: "all",
    size: "all",
    category: "all",
    test: "all",
    scoreMin: "",
    tpsMin: "",
    sort: "score_desc",
  },
  activeRunId: null,
  activeSource: null,
  batch: null,
  activeResults: [],
  activeSummary: null,
  currentCase: null,
  currentOutput: "",
  total: 0,
  currentIndex: 0,
  phaseProgress: 0,
  phase: "bereit",
  elapsedTimer: null,
  batchDelayTimer: null,
  caseStartedAt: null,
  liveMetrics: {},
  reasoningStatus: null,
  modelRefreshInFlight: false,
  caseAbortInFlight: false,
};

const $ = (id) => document.getElementById(id);
const modelColors = ["#67d391", "#7fc7d9", "#e3b75c", "#ef746f", "#b39df3", "#f59ec4", "#9bd36a", "#ff9f69"];
const REASONING_LABELS = {
  off: "Off",
  none: "Off",
  low: "Low",
  medium: "Medium",
  med: "Medium",
  on: "On",
  high: "High",
  xhigh: "XHigh",
  x_high: "XHigh",
  extra_high: "XHigh",
  max: "Max",
};
const REASONING_RANK = {
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
const CATEGORY_LABELS = {
  instruktion_format: "Instruktion & Format",
  dokumente_kontext: "Dokumente & Kontext",
  daten_tabellen: "Daten & Tabellen",
  finanz_business: "Finanz & Business",
  reasoning_planung: "Reasoning & Planung",
  coding_bugfix: "Coding: Bugfixing",
  coding_review_architektur: "Coding: Review & Architektur",
  tool_os: "Tool-Use & OS",
  agent_sicherheit: "Agentik & Sicherheit",
  multiturn_kontext: "Multi-Turn & Kontext",
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
const BATCH_UNLOAD_TIMEOUT_SECONDS = 300;

function fmtPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--%";
  return `${Number(value).toFixed(1)}%`;
}

function fmtSeconds(value) {
  if (!value) return "--";
  return `${Number(value).toFixed(2)}s`;
}

function fmtNumber(value) {
  if (!value) return "--";
  return Number(value).toFixed(1);
}

function categoryLabel(category) {
  if (!category) return "";
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return String(category)
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase("de-DE")}${part.slice(1)}`)
    .join(" ");
}

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function orderedCategories(categories) {
  return [...categories].sort((left, right) => categoryRank(left) - categoryRank(right) || left.localeCompare(right));
}

function normalizeReasoningOption(option) {
  return String(option || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function reasoningRank(option) {
  return REASONING_RANK[normalizeReasoningOption(option)] ?? 1;
}

function reasoningLabel(option) {
  const normalized = normalizeReasoningOption(option);
  return REASONING_LABELS[normalized] || String(option || "").trim() || "Off";
}

function reasoningOptions(details = {}) {
  const options = details.capabilities?.reasoning?.allowed_options;
  return Array.isArray(options) ? options.map(String).filter(Boolean) : [];
}

function maxReasoningOption(details = {}) {
  const usable = reasoningOptions(details).filter((option) => reasoningRank(option) > 0);
  if (!usable.length) return null;
  return usable.reduce((best, option) => (reasoningRank(option) > reasoningRank(best) ? option : best), usable[0]);
}

function reasoningLevelsText(details = {}) {
  return reasoningLabel(maxReasoningOption(details));
}

function currentModelDetails() {
  const selected = $("modelSelect")?.value || "auto";
  const loaded = state.modelStatus.loaded || [];
  const available = state.modelStatus.available || [];
  const model = selected === "auto" ? loaded[0] : loaded.find((item) => item.id === selected) || findModelDetails(selected, available);
  return model?.model_details || model || null;
}

function categoryFinalPercent(data) {
  if (!data) return null;
  const earned = data.final_earned ?? data.earned;
  const possible = data.final_possible ?? data.possible;
  return possible ? (earned / possible) * 100 : null;
}

function categoryAutoPercent(data) {
  if (!data) return null;
  const earned = data.auto_earned ?? data.earned;
  const possible = data.auto_possible ?? data.possible;
  return possible ? (earned / possible) * 100 : null;
}

function failedCount(summaryOrRun = {}) {
  return summaryOrRun.status_counts?.auto_failed ?? 0;
}

function statusLabel(score = {}) {
  const labels = {
    auto_passed: "Richtig",
    auto_failed: "Falsch",
    needs_review: "Review",
    reviewed: "Geprüft",
    error: "Fehler",
  };
  return labels[score.status] || score.status || "Auto";
}

function displayTitle(value) {
  return String(value ?? "");
}

function statusClass(score = {}) {
  if (score.status === "auto_passed" || score.status === "reviewed") return "status-pass";
  if (score.status === "auto_failed" || score.status === "error") return "status-fail";
  return "";
}

function liveScoreText() {
  return fmtPercent(
    state.activeSummary?.balanced_final_percent ??
      state.activeSummary?.final_percent ??
      state.activeSummary?.balanced_auto_percent ??
      state.activeSummary?.auto_percent,
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.error || response.statusText);
  return data;
}

async function refreshAll() {
  await Promise.allSettled([loadCases(), loadModels(), loadRuns()]);
}

async function loadCases() {
  const data = await api("/api/cases");
  state.cases = data.cases;
  state.categories = data.categories;
  renderCategories();
  if (state.runs.length) renderComparison();
}

async function loadModels() {
  const url = new URL("/api/models", location.origin);
  url.searchParams.set("baseUrl", $("baseUrl").value);
  const data = await api(url.pathname + url.search);
  state.modelStatus = data;
  const select = $("modelSelect");
  const selected = select.value || "auto";
  select.innerHTML = `<option value="auto">auto</option>`;
  const loaded = data.loaded || [];
  const available = data.available || [];
  for (const model of loaded) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = modelLabel(model.id, available, model);
    select.append(option);
  }
  select.value = [...select.options].some((option) => option.value === selected) ? selected : "auto";
  const serverState = $("serverState");
  serverState.className = "server-pill";
  if (loaded.length) {
    serverState.textContent = `${loaded.length} geladen`;
    serverState.classList.add("online");
  } else if (data.errors?.length) {
    serverState.textContent = "Offline";
    serverState.classList.add("warn");
  } else {
    serverState.textContent = "Kein Modell";
    serverState.classList.add("warn");
  }
  renderReasoningStatus();
}

async function refreshModelsQuietly() {
  if (document.hidden || state.modelRefreshInFlight) return;
  if (document.activeElement === $("baseUrl") || document.activeElement === $("modelSelect")) return;
  state.modelRefreshInFlight = true;
  try {
    await loadModels();
  } catch {
    // loadModels already renders the current known state on successful polls.
  } finally {
    state.modelRefreshInFlight = false;
  }
}

function startModelStatusPolling() {
  setInterval(refreshModelsQuietly, 5000);
  window.addEventListener("focus", refreshModelsQuietly);
  document.addEventListener("visibilitychange", refreshModelsQuietly);
}

async function loadRuns() {
  state.runs = await api("/api/runs");
  const knownRunIds = new Set(state.runs.map((run) => run.id));
  for (const id of state.runDetails.keys()) {
    if (!knownRunIds.has(id)) state.runDetails.delete(id);
  }
  await renderComparison();
}

function renderCategories() {
  const counts = new Map();
  for (const testCase of state.cases) counts.set(testCase.category, (counts.get(testCase.category) || 0) + 1);
  $("categories").innerHTML = orderedCategories(state.categories)
    .map(
      (category) => `
        <label class="category-check">
          <input type="checkbox" value="${escapeHtml(category)}" checked />
          <span title="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</span>
          <span>${counts.get(category) || 0}</span>
        </label>
      `,
    )
    .join("");
}

function selectedCategories() {
  return [...document.querySelectorAll("#categories input:checked")].map((input) => input.value);
}

function currentSettings(modelOverride = null) {
  return {
    baseUrl: $("baseUrl").value.trim() || "http://localhost:1234/v1",
    model: modelOverride || $("modelSelect").value || "auto",
    temperature: Number($("temperature").value || 0),
    topP: Number($("topP").value || 1),
    maxTokens: $("maxTokens").value ? Number($("maxTokens").value) : null,
    limit: $("limit").value ? Number($("limit").value) : null,
    categories: selectedCategories(),
  };
}

function modelLabel(modelId, availableModels = [], loadedModel = null) {
  const details = loadedModel?.model_details || loadedModel || findModelDetails(modelId, availableModels);
  if (!details) return modelId;
  const bits = details.quantization?.name || details.quantization || "";
  const suffix = [bits].filter(Boolean).join(" · ");
  return suffix ? `${details.display_name || details.key || modelId} (${suffix})` : details.display_name || modelId;
}

function findModelDetails(modelId, availableModels = []) {
  return (
    availableModels.find((model) => model.key === modelId) ||
    availableModels.find((model) => model.selected_variant === modelId) ||
    availableModels.find((model) => (model.variants || []).includes(modelId)) ||
    availableModels.find((model) => (model.loaded_instances || []).some((instance) => instance.id === modelId)) ||
    null
  );
}

function runModelLine(summaryOrRun) {
  const details = summaryOrRun.model_details || {};
  const parts = [
    details.quantization,
    details.params,
    details.capabilities?.trained_for_tool_use ? "tool-use" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "keine Metadaten";
}

function dropdownModelIds() {
  return [...$("modelSelect").options].map((option) => option.value).filter((value) => value && value !== "auto");
}

function selectedCaseCoverage() {
  const selected = new Set(selectedCategories());
  const filtered = state.cases.filter((testCase) => !selected.size || selected.has(testCase.category));
  const limit = $("limit").value ? Number($("limit").value) : null;
  const expectedTotal = limit ? Math.min(limit, filtered.length) : filtered.length;
  const categoryCounts = new Map();
  for (const testCase of filtered) categoryCounts.set(testCase.category, (categoryCounts.get(testCase.category) || 0) + 1);
  return { expectedTotal, categoryCounts, limited: Boolean(limit) };
}

function runCoversCurrentSelection(run) {
  const { expectedTotal, categoryCounts, limited } = selectedCaseCoverage();
  if (!expectedTotal || Number(run.case_count || 0) < expectedTotal) return false;
  if (limited) return true;
  for (const [category, count] of categoryCounts) {
    if (Number(run.categories?.[category]?.cases || 0) < count) return false;
  }
  return true;
}

function testedModelIdsForCurrentSelection() {
  return new Set(state.runs.filter(runCoversCurrentSelection).map((run) => run.model).filter(Boolean));
}

function untestedDropdownModelIds() {
  const tested = testedModelIdsForCurrentSelection();
  return dropdownModelIds().filter((modelId) => !tested.has(modelId));
}

function batchPrefix() {
  return state.batch ? `Batch ${state.batch.index}/${state.batch.models.length} · ` : "";
}

function clearBatchDelay() {
  if (state.batchDelayTimer) clearTimeout(state.batchDelayTimer);
  state.batchDelayTimer = null;
}

function renderReasoningStatus() {
  const details = currentModelDetails();
  const maxOption = details ? maxReasoningOption(details) : null;
  const levelsText = details ? reasoningLevelsText(details) : "Off";
  const capabilityOn = Boolean(maxOption);
  const runStatus = state.reasoningStatus;
  const hasRunSignal = Boolean(runStatus && state.activeRunId);
  const requested = runStatus?.requested || maxOption;
  const completed = Number(runStatus?.completed_cases || 0);
  const usingReasoning = hasRunSignal
    ? Boolean(requested && (runStatus.using || completed === 0))
    : capabilityOn;

  const levels = $("reasoningLevelsValue");
  const usage = $("reasoningUsageValue");
  if (!levels || !usage) return;

  levels.textContent = levelsText;
  levels.className = `reasoning-value ${capabilityOn ? "ok" : "bad"}`;
  usage.textContent = usingReasoning ? "On" : "Off";
  usage.className = `reasoning-value ${usingReasoning ? "ok" : "bad"}`;
}

async function startRun() {
  clearBatchDelay();
  if (($("modelSelect").value || "auto") === "auto") {
    await startBatchRun();
    return;
  }
  state.batch = null;
  await startSingleRun($("modelSelect").value || "auto");
}

async function startSingleRun(modelId, { fromBatch = false } = {}) {
  if (state.activeSource) state.activeSource.close();
  resetLive();
  if (fromBatch) {
    $("runLabel").textContent = `${batchPrefix()}${modelLabel(modelId, state.modelStatus.available || [])}`;
  }
  const response = await api("/api/evals/start", {
    method: "POST",
    body: JSON.stringify(currentSettings(modelId)),
  });
  state.activeRunId = response.runId;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  $("abortCaseBtn").disabled = true;
  $("runLabel").textContent = fromBatch ? `${batchPrefix()}${response.model}` : response.model;
  connectEvents(response.runId);
}

async function startBatchRun() {
  if (state.activeSource) state.activeSource.close();
  resetLive();
  await Promise.allSettled([loadModels(), loadRuns()]);
  const models = untestedDropdownModelIds();
  if (!models.length) {
    $("runLabel").textContent = "Alle Modelle aus der Liste sind bereits getestet.";
    renderLive();
    return;
  }
  state.batch = { models, index: 0, stopRequested: false };
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  await startNextBatchRun();
}

async function startNextBatchRun() {
  if (!state.batch || state.batch.stopRequested) {
    finishBatch("Batch gestoppt");
    return;
  }
  if (state.batch.index >= state.batch.models.length) {
    finishBatch("Batch fertig");
    return;
  }
  const modelId = state.batch.models[state.batch.index];
  state.batch.index += 1;
  $("modelSelect").value = modelId;
  renderReasoningStatus();
  await startSingleRun(modelId, { fromBatch: true });
}

async function unloadBatchModelThenContinue(modelId, continueAfterUnload) {
  if (!state.batch) return;
  const label = modelLabel(modelId, state.modelStatus.available || []);
  state.phase = "unload";
  state.phaseProgress = 0;
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  $("runLabel").textContent = `${batchPrefix()}Entlade ${label} aus LM Studio.`;
  renderLive(false);

  await api("/api/models/unload", {
    method: "POST",
    body: JSON.stringify({
      baseUrl: $("baseUrl").value.trim() || "http://localhost:1234/v1",
      model: modelId,
      timeoutSeconds: BATCH_UNLOAD_TIMEOUT_SECONDS,
    }),
  });

  await loadModels().catch(() => {});
  if (!state.batch || state.batch.stopRequested) {
    if (state.batch) finishBatch("Batch gestoppt");
    return;
  }

  if (continueAfterUnload) {
    $("runLabel").textContent = `${batchPrefix()}Modell entladen. Starte nächstes Modell.`;
    await startNextBatchRun();
  } else {
    finishBatch("Batch fertig");
  }
}

function finishBatch(label) {
  clearBatchDelay();
  const completed = state.batch ? state.batch.index : 0;
  const total = state.batch ? state.batch.models.length : 0;
  state.batch = null;
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("runLabel").textContent = total ? `${label} · ${completed}/${total} Modelle` : label;
}

async function stopRun() {
  if (state.batch) state.batch.stopRequested = true;
  clearBatchDelay();
  if (!state.activeRunId) {
    if (state.batch) finishBatch("Batch gestoppt");
    return;
  }
  await api(`/api/evals/${encodeURIComponent(state.activeRunId)}/stop`, { method: "POST", body: "{}" });
  $("stopBtn").disabled = true;
  $("abortCaseBtn").disabled = true;
}

async function abortCurrentCase() {
  if (!state.activeRunId || state.caseAbortInFlight) return;
  state.caseAbortInFlight = true;
  $("abortCaseBtn").disabled = true;
  $("abortCaseBtn").textContent = "Breche ab...";
  await api(`/api/evals/${encodeURIComponent(state.activeRunId)}/abort-case`, { method: "POST", body: "{}" });
}

function connectEvents(runId) {
  const source = new EventSource(`/api/evals/${encodeURIComponent(runId)}/events`);
  state.activeSource = source;
  const events = [
    "run_started",
    "case_started",
    "case_progress",
    "case_delta",
    "case_warning",
    "case_aborting",
    "case_finished",
    "reasoning_status",
    "run_stopping",
    "run_finished",
    "run_failed",
  ];
  for (const eventName of events) {
    source.addEventListener(eventName, (event) => handleEvent(JSON.parse(event.data)));
  }
}

function handleEvent(event) {
  if (state.batchDelayTimer && event.type !== "run_finished" && event.type !== "run_failed") clearBatchDelay();

  if (event.type === "run_started") {
    state.total = event.total;
    state.currentIndex = 0;
    state.activeResults = [];
    state.activeSummary = null;
    state.reasoningStatus = event.reasoning_status || null;
    $("runLabel").textContent = `${batchPrefix()}${event.model} · ${runModelLine({ model_details: event.model_details })} · ${event.runId}`;
    renderReasoningStatus();
    renderLive();
  }

  if (event.type === "case_started") {
    state.currentIndex = event.index;
    state.currentCase = event.case;
    state.currentOutput = "";
    state.phase = "start";
    state.phaseProgress = 0;
    state.liveMetrics = {};
    state.caseAbortInFlight = false;
    state.caseStartedAt = performance.now();
    $("abortCaseBtn").disabled = false;
    $("abortCaseBtn").textContent = "Test abbrechen";
    ensureElapsedTimer();
    renderLive();
  }

  if (event.type === "case_progress") {
    state.phase = event.phase;
    state.phaseProgress = Math.max(0, Math.min(1, Number(event.progress || 0)));
    renderLive();
  }

  if (event.type === "case_delta") {
    state.phase = "generate";
    state.currentOutput = event.output_tail || state.currentOutput + (event.delta || "");
    state.liveMetrics = {
      elapsed_seconds: event.elapsed_seconds,
      output_tokens_estimate: event.output_tokens_estimate,
      tokens_per_second: event.output_tokens_estimate
        ? event.output_tokens_estimate / Math.max(0.001, event.elapsed_seconds || 0)
        : null,
    };
    $("metricElapsed").textContent = fmtSeconds(event.elapsed_seconds);
    renderLive(false);
  }

  if (event.type === "case_warning") {
    state.currentOutput += `\n[${event.message}]\n`;
    renderLive(false);
  }

  if (event.type === "case_aborting") {
    state.phase = "case_aborting";
    state.caseAbortInFlight = true;
    if (event.message) state.currentOutput += `\n[${event.message}]\n`;
    $("abortCaseBtn").disabled = true;
    $("abortCaseBtn").textContent = "Breche ab...";
    renderLive(false);
  }

  if (event.type === "case_finished") {
    state.activeResults.push(event.record);
    state.activeSummary = event.summary;
    state.currentOutput = event.record.output || state.currentOutput;
    $("abortCaseBtn").disabled = true;
    $("abortCaseBtn").textContent = "Test abbrechen";
    renderLive();
    renderResults();
  }

  if (event.type === "reasoning_status") {
    state.reasoningStatus = event.reasoning_status || null;
    renderReasoningStatus();
  }

  if (event.type === "run_stopping") {
    state.phase = "stopping";
    renderLive();
  }

  if (event.type === "run_finished") {
    state.activeSummary = event.summary;
    const batchWasActive = Boolean(state.batch);
    const continueBatch = state.batch && !state.batch.stopRequested && state.batch.index < state.batch.models.length;
    const finishBatchAfterRun = state.batch && !continueBatch;
    finishRun(event.status);
    loadRuns();
    if (batchWasActive) {
      const completedModel = event.summary?.model || event.model || state.activeSummary?.model;
      unloadBatchModelThenContinue(completedModel, Boolean(continueBatch)).catch(handleBatchError);
    } else if (finishBatchAfterRun) {
      finishBatch(state.batch?.stopRequested ? "Batch gestoppt" : "Batch fertig");
    }
  }

  if (event.type === "run_failed") {
    state.currentOutput += `\n${event.message}\n`;
    state.batch = null;
    finishRun("failed");
  }
}

function finishRun(status) {
  const batchContinues = Boolean(state.batch && !state.batch.stopRequested && state.batch.index < state.batch.models.length);
  if (state.activeSource) state.activeSource.close();
  state.activeSource = null;
  state.activeRunId = null;
  $("startBtn").disabled = batchContinues;
  $("stopBtn").disabled = !batchContinues;
  $("abortCaseBtn").disabled = true;
  $("abortCaseBtn").textContent = "Test abbrechen";
  $("phaseText").textContent = status;
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = null;
  renderReasoningStatus();
  renderLive();
}

function handleBatchError(error) {
  state.currentOutput += `\n${error.message}\n`;
  state.batch = null;
  finishRun("failed");
  alert(error.message);
}

function ensureElapsedTimer() {
  if (state.elapsedTimer) return;
  state.elapsedTimer = setInterval(() => {
    if (!state.caseStartedAt) return;
    $("metricElapsed").textContent = fmtSeconds((performance.now() - state.caseStartedAt) / 1000);
  }, 250);
}

function resetLive() {
  clearBatchDelay();
  state.activeResults = [];
  state.activeSummary = null;
  state.currentCase = null;
  state.currentOutput = "";
  state.total = 0;
  state.currentIndex = 0;
  state.phaseProgress = 0;
  state.phase = "bereit";
  state.liveMetrics = {};
  state.reasoningStatus = null;
  state.caseAbortInFlight = false;
  $("streamOutput").textContent = "";
  $("resultsBody").innerHTML = "";
  $("categoryChart").innerHTML = "";
  $("abortCaseBtn").disabled = true;
  $("abortCaseBtn").textContent = "Test abbrechen";
  renderReasoningStatus();
  renderLive();
}

function renderLive(updateStream = true) {
  const partial =
    state.phase === "prefill" ? 0.25 + state.phaseProgress * 0.35 : state.phase === "generate" ? 0.75 : state.currentCase ? 0.1 : 0;
  const overall = state.total ? ((state.activeResults.length + partial) / state.total) * 100 : 0;
  $("overallBar").style.width = `${Math.max(0, Math.min(100, overall))}%`;
  $("phaseBar").style.width = `${Math.round((state.phaseProgress || 0) * 100)}%`;
  $("overallText").textContent = `${state.currentIndex || 0} / ${state.total || 0}`;
  $("phaseText").textContent = phaseLabel(state.phase);
  $("currentTitle").textContent = state.currentCase ? displayTitle(state.currentCase.title) : "--";
  $("currentMeta").textContent = state.currentCase
    ? `${state.currentCase.id} · ${categoryLabel(state.currentCase.category)} · ${state.currentCase.auto_points} Punkte`
    : "--";
  $("liveScore").textContent = liveScoreText();
  $("metricTtft").textContent = fmtSeconds(lastMetric("time_to_first_token_seconds"));
  $("metricPrefill").textContent =
    state.phase === "prefill" ? `${Math.round(state.phaseProgress * 100)}%` : fmtSeconds(lastMetric("prompt_processing_seconds"));
  $("metricTps").textContent = fmtNumber(state.liveMetrics.tokens_per_second || lastMetric("tokens_per_second"));
  if (updateStream) $("streamOutput").textContent = state.currentOutput || "";
  else $("streamOutput").textContent = state.currentOutput || "";
  $("streamOutput").scrollTop = $("streamOutput").scrollHeight;
}

function phaseLabel(phase) {
  const labels = {
    bereit: "bereit",
    start: "start",
    model_load: "Modell laden",
    prefill: "prefill",
    generate: "Generierung",
    unload: "Modell entladen",
    stopping: "Stoppe",
    case_aborting: "Test wird abgebrochen",
  };
  return labels[phase] || phase;
}

function lastMetric(key) {
  const last = state.activeResults.at(-1);
  return last?.metrics?.[key] || state.activeSummary?.performance?.[`avg_${key}`] || null;
}

function renderResults() {
  $("resultCount").textContent = `${state.activeResults.length} Tests`;
  $("resultsBody").innerHTML = state.activeResults
    .map((record) => {
      return `
        <tr>
          <td>${escapeHtml(displayTitle(record.title || record.id))}</td>
          <td>${escapeHtml(categoryLabel(record.category))}</td>
          <td>
            <span class="result-pill ${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
          </td>
          <td>${fmtSeconds(record.metrics?.time_to_first_token_seconds)}</td>
          <td>${fmtNumber(record.metrics?.tokens_per_second)}</td>
          <td>${fmtSeconds(record.metrics?.total_seconds)}</td>
        </tr>
      `;
    })
    .join("");
  renderCategoryChart(state.activeSummary?.categories || {});
}

function renderCategoryChart(categories) {
  const entries = orderedCategories(Object.keys(categories)).map((category) => [category, categories[category]]);
  $("categoryChart").innerHTML = entries.length
    ? entries
        .map(([category, data]) => {
          const percent = categoryFinalPercent(data) ?? 0;
          return `
            <div class="bar-row">
              <div class="bar-name" title="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
              <div class="bar-value">${percent.toFixed(0)}%</div>
            </div>
          `;
        })
        .join("")
    : `<p class="empty">Noch keine Scores.</p>`;
}

async function deleteRun(runId) {
  const run = state.runs.find((item) => item.id === runId);
  const label = run ? `${friendlyModelName(run)} (${run.id})` : runId;
  if (!confirm(`Run wirklich löschen?\n\n${label}`)) return;
  await api(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
  state.runDetails.delete(runId);
  await loadRuns();
}

async function renderComparison({ updateFilters = true } = {}) {
  const renderId = ++state.comparisonRenderId;

  if (!state.runs.length) {
    if (updateFilters) renderComparisonFilters([]);
    $("comparison").innerHTML = `<p class="empty">Noch keine gespeicherten Runs.</p>`;
    return;
  }

  $("comparison").innerHTML = `<p class="empty">Runs werden geladen.</p>`;
  const loaded = await loadComparisonData();
  if (renderId !== state.comparisonRenderId) return;

  const rows = buildComparisonRows(loaded);
  if (updateFilters) renderComparisonFilters(rows);
  const filteredRows = sortComparisonRows(rows.filter((row) => rowMatchesFilters(row, state.compareFilters)), state.compareFilters);

  $("comparison").innerHTML = `
    ${renderComparisonSummary(rows, filteredRows)}
    ${renderOverallRanking(filteredRows, state.compareFilters)}
    ${renderCategoryRankings(rows, state.compareFilters)}
    ${renderTestComparison(rows, state.compareFilters)}
  `;
  bindComparisonActions();
}

function renderLegend(loaded) {
  return `
    <div class="model-legend">
      ${loaded
        .map(
          ({ summary }, index) => `
            <div class="legend-item">
              <span class="legend-dot" style="background:${modelColor(index)}"></span>
              <span>${escapeHtml(shortModelName(summary))}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCompareCard({ summary }, index) {
  const details = summary.model_details || {};
  return `
    <article class="compare-card" style="--model-color:${modelColor(index)}">
      <h3>${escapeHtml(summary.model)}</h3>
      <p class="model-meta">${escapeHtml(runModelLine(summary))}</p>
      <div class="compare-grid">
        <div><span>Score</span><strong>${fmtPercent(summary.balanced_final_percent ?? summary.final_percent ?? balancedFromCategories(summary))}</strong></div>
        <div><span>Auto</span><strong>${fmtPercent(summary.balanced_auto_percent ?? summary.auto_percent)}</strong></div>
        <div><span>Tests</span><strong>${summary.case_count}</strong></div>
        <div><span>Falsch</span><strong>${failedCount(summary)}</strong></div>
        <div><span>TTFT</span><strong>${fmtSeconds(summary.performance?.avg_time_to_first_token_seconds)}</strong></div>
        <div><span>Prefill</span><strong>${fmtSeconds(summary.performance?.avg_prompt_processing_seconds)}</strong></div>
        <div><span>tok/s</span><strong>${fmtNumber(summary.performance?.avg_tokens_per_second)}</strong></div>
        <div><span>Zeit</span><strong>${fmtSeconds(summary.performance?.avg_total_seconds)}</strong></div>
      </div>
      <dl class="model-facts">
        <div><dt>Variante</dt><dd>${escapeHtml(details.selected_variant || details.key || "n/a")}</dd></div>
        <div><dt>Architektur</dt><dd>${escapeHtml(details.architecture || "n/a")}</dd></div>
        <div><dt>Kontext</dt><dd>${escapeHtml(details.loaded_config?.context_length || details.max_context_length || "n/a")}</dd></div>
      </dl>
    </article>
  `;
}

function balancedFromCategories(summary) {
  const values = Object.values(summary.categories || {})
    .map((data) => categoryFinalPercent(data))
    .filter((value) => value !== null);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderCategoryMatrix(loaded) {
  const categories = orderedCategories([...new Set(loaded.flatMap(({ summary }) => Object.keys(summary.categories || {})))]);
  if (!categories.length) return "";
  return `
    <section class="compare-block">
      <h3>Kategorien</h3>
      <div class="compare-bars">
        ${categories
          .map((category) => {
            const bars = loaded.map(({ summary }, index) => {
              const data = summary.categories?.[category];
              const percent = categoryFinalPercent(data);
              const autoPercent = categoryAutoPercent(data);
              return renderCompareBar(shortModelName(summary), percent, {
                color: modelColor(index),
                meta: data ? `auto ${fmtPercent(autoPercent)} | richtig ${data.passed_cases || 0}/${data.cases || 0} | falsch ${data.failed_cases || 0}` : "nicht gelaufen",
              });
            });
            return `
              <article class="bar-compare-card">
                <div class="bar-compare-title">
                  <strong title="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</strong>
                </div>
                <div class="bar-stack">${bars.join("")}</div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderTestMatrix(loaded) {
  const orderedCases = state.cases.length ? state.cases : [];
  const ids = new Set(orderedCases.map((testCase) => testCase.id));
  for (const { results } of loaded) for (const record of results) ids.add(record.id);
  const orderedIds = [...orderedCases.map((testCase) => testCase.id), ...[...ids].filter((id) => !orderedCases.some((testCase) => testCase.id === id))];
  const caseById = new Map(orderedCases.map((testCase) => [testCase.id, testCase]));
  const resultMaps = loaded.map(({ results }) => new Map(results.map((record) => [record.id, record])));
  return `
    <section class="compare-block">
      <h3>Einzeltests</h3>
      <div class="test-compare-list">
        ${orderedIds
          .map((id) => {
            const meta = caseById.get(id) || { id, title: id, category: "unknown" };
            const rows = resultMaps.map((map, index) => {
              const record = map.get(id);
              return renderTestStatusRow(shortModelName(loaded[index].summary), record, {
                color: modelColor(index),
              });
            });
            return `
              <article class="test-compare-card" data-test-id="${escapeHtml(id)}">
                <div class="bar-compare-title">
                  <strong>${escapeHtml(displayTitle(meta.title || id))}</strong>
                  <small title="${escapeHtml(meta.category || "")}">${escapeHtml(categoryLabel(meta.category))}</small>
                </div>
                <div class="test-status-list">${rows.join("")}</div>
              </article>
              <div class="test-detail-panel" data-detail-for="${escapeHtml(id)}" hidden>
                ${renderTestBrief(meta)}
                <div class="test-detail-grid">
                  ${loaded.map((run, index) => renderResultDetail(run.summary, resultMaps[index].get(id), index)).join("")}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderTestStatusRow(label, record, { color }) {
  if (!record) {
    return `
      <div class="test-status-row missing" style="--model-color:${color}">
        <span class="legend-dot"></span>
        <span class="test-status-model">${escapeHtml(label)}</span>
        <span class="result-pill">nicht gelaufen</span>
        <span class="test-status-meta">--</span>
      </div>
    `;
  }
  return `
    <div class="test-status-row" style="--model-color:${color}">
      <span class="legend-dot"></span>
      <span class="test-status-model">${escapeHtml(label)}</span>
      <span class="result-pill ${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
      <span class="test-status-meta">${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
    </div>
  `;
}

function renderTestBrief(testCase) {
  const systemPrompt = testCase.system_prompt || testCase.system || "";
  const input = testCase.input || testCase.prompt || "";
  const autoChecks = testCase.scoring?.auto || [];
  const manualRubric = testCase.scoring?.manual_rubric || [];
  return `
    <section class="task-brief">
      <div class="task-brief-head">
        <div>
          <strong>Aufgabe</strong>
          <small>${escapeHtml(testCase.id || "")}</small>
        </div>
        <span title="${escapeHtml(testCase.category || "")}">${escapeHtml(categoryLabel(testCase.category))}</span>
      </div>
      ${systemPrompt ? renderTaskBlock("System-Kontext", systemPrompt) : ""}
      ${input ? renderTaskBlock("Nutzeraufgabe", input) : `<p class="empty">Die Aufgabenstellung ist für diesen alten Run nicht verfügbar.</p>`}
      <div class="expectation-grid ${manualRubric.length ? "" : "single"}">
        <div class="expectation-block">
          <strong>Auto-Checks</strong>
          ${
            autoChecks.length
              ? autoChecks.map((check) => renderExpectedCheck(check)).join("")
              : `<p class="empty">Keine automatischen Checks.</p>`
          }
        </div>
        ${
          manualRubric.length
            ? `<div class="expectation-block">
                <strong>Legacy-Rubrik</strong>
                ${manualRubric
                  .map((rubric) => `<p>${escapeHtml(rubric.criterion || JSON.stringify(rubric))} <small>${escapeHtml(rubric.points ?? "")} Pkt.</small></p>`)
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderTaskBlock(label, text) {
  return `
    <div class="task-block">
      <strong>${escapeHtml(label)}</strong>
      <pre>${escapeHtml(text)}</pre>
    </div>
  `;
}

function renderExpectedCheck(check) {
  return `
    <p>
      <span>${escapeHtml(check.label || check.type)}</span>
      <small>${escapeHtml(check.type)} | ${escapeHtml(check.points ?? 1)} Pkt.</small>
      <code>${escapeHtml(describeExpectedCheck(check))}</code>
    </p>
  `;
}

function describeExpectedCheck(check) {
  if (check.type === "json_exact") return JSON.stringify(check.expected || {});
  if (check.type === "json_fields") return JSON.stringify(check.expected || {});
  if (check.type === "json_valid") return "Antwort muss valides JSON enthalten.";
  if (check.type === "must_contain") return `Muss enthalten: ${(check.items || []).join(", ")}`;
  if (check.type === "contains_any") return `Mindestens eins davon: ${(check.items || []).join(", ")}`;
  if (check.type === "must_not_contain") return `Darf nicht enthalten: ${(check.items || []).join(", ")}`;
  if (check.type === "regex") return `Regex muss passen: ${(check.patterns || []).join(" | ")}`;
  if (check.type === "forbidden_regex") return `Regex darf nicht passen: ${(check.patterns || []).join(" | ")}`;
  if (check.type === "word_count_at_most") return `Maximal ${check.max} Wörter.`;
  if (check.type === "line_count_equals") return `Genau ${check.count} nicht-leere Zeilen.`;
  if (check.type === "max_chars") return `Maximal ${check.max} Zeichen.`;
  return JSON.stringify(check);
}

function renderCompareBar(label, value, { color, meta }) {
  const width = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, Number(value)));
  const valueLabel = value === null || value === undefined ? "--%" : fmtPercent(value);
  return `
    <div class="compare-bar-row" style="--model-color:${color}">
      <div class="compare-bar-label">${escapeHtml(label)}</div>
      <div class="compare-bar-track">
        <div class="compare-bar-fill" style="width:${width}%"></div>
      </div>
      <div class="compare-bar-value">${valueLabel}</div>
      <div class="compare-bar-meta">${escapeHtml(meta || "")}</div>
    </div>
  `;
}

function renderResultDetail(summary, record, index = 0) {
  if (!record) {
    return `<article class="result-detail" style="--model-color:${modelColor(index)}"><h4>${escapeHtml(shortModelName(summary))}</h4><p class="empty">Dieser Test wurde in diesem Run nicht ausgeführt.</p></article>`;
  }
  const failed = (record.score.checks || []).filter((check) => !check.passed);
  return `
    <article class="result-detail" style="--model-color:${modelColor(index)}">
      <h4>${escapeHtml(shortModelName(summary))}</h4>
      <div class="detail-metrics">
        <span class="${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
        <span>${fmtSeconds(record.metrics?.time_to_first_token_seconds)} TTFT</span>
        <span>${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
        <span>${fmtSeconds(record.metrics?.total_seconds)} total</span>
      </div>
      <p class="review-reason">${escapeHtml(record.score.reason || "")}</p>
      <div class="checks">
        ${
          failed.length
            ? failed.map((check) => `<p class="status-fail">${escapeHtml(check.label || check.type)}: ${escapeHtml(check.detail)}</p>`).join("")
            : `<p class="status-pass">Alle automatischen Checks bestanden.</p>`
        }
      </div>
      <pre>${escapeHtml((record.output || "").slice(0, 1800))}</pre>
    </article>
  `;
}

function shortModelName(summary) {
  return friendlyModelName(summary);
}

async function loadComparisonData() {
  return Promise.all(
    state.runs.map(async (run) => {
      if (state.runDetails.has(run.id)) return state.runDetails.get(run.id);
      try {
        const loaded = await api(`/api/runs/${encodeURIComponent(run.id)}`);
        state.runDetails.set(run.id, loaded);
        return loaded;
      } catch (error) {
        const fallback = { summary: run, results: [], loadError: error.message };
        state.runDetails.set(run.id, fallback);
        return fallback;
      }
    }),
  );
}

function defaultCompareFilters() {
  return {
    search: "",
    quantization: "all",
    modelKind: "all",
    size: "all",
    category: "all",
    test: "all",
    scoreMin: "",
    tpsMin: "",
    sort: "score_desc",
  };
}

function renderComparisonFilters(rows) {
  const filters = state.compareFilters;
  const quantizations = uniqueSorted(rows.map((row) => row.quantization).filter(Boolean));
  const kinds = uniqueSorted(rows.map((row) => row.modelKind).filter(Boolean));
  const sizes = uniqueSorted(rows.map((row) => row.sizeKey).filter(Boolean), compareSizeKeys);

  if (filters.quantization !== "all" && !quantizations.includes(filters.quantization)) filters.quantization = "all";
  if (filters.modelKind !== "all" && !kinds.includes(filters.modelKind)) filters.modelKind = "all";
  if (filters.size !== "all" && !sizes.includes(filters.size)) filters.size = "all";
  if (filters.category !== "all" && !state.categories.includes(filters.category)) filters.category = "all";
  if (filters.test !== "all" && !testBelongsToCategory(filters.test, filters.category)) filters.test = "all";

  $("comparisonFilters").innerHTML = `
    <div class="filter-grid">
      <label class="field compact-field">
        <span>Suchen</span>
        <input id="compareSearch" value="${escapeHtml(filters.search)}" placeholder="Modell, Familie, Run" />
      </label>
      <label class="field compact-field">
        <span>Sortieren</span>
        <select id="compareSort">
          ${selectOption("score_desc", "Score absteigend", filters.sort)}
          ${selectOption("score_asc", "Score aufsteigend", filters.sort)}
          ${selectOption("tps_desc", "tok/s absteigend", filters.sort)}
          ${selectOption("tps_asc", "tok/s aufsteigend", filters.sort)}
          ${selectOption("size_desc", "Größe absteigend", filters.sort)}
          ${selectOption("size_asc", "Größe aufsteigend", filters.sort)}
          ${selectOption("errors_asc", "Wenigste Fehler", filters.sort)}
          ${selectOption("name_asc", "Name A-Z", filters.sort)}
          ${selectOption("date_desc", "Neueste zuerst", filters.sort)}
        </select>
      </label>
      <label class="field compact-field">
        <span>Quantisierung</span>
        <select id="compareQuantization">
          ${selectOption("all", "alle", filters.quantization)}
          ${quantizations.map((value) => selectOption(value, value, filters.quantization)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>Modell-Art</span>
        <select id="compareModelKind">
          ${selectOption("all", "alle", filters.modelKind)}
          ${kinds.map((value) => selectOption(value, value, filters.modelKind)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>Größe</span>
        <select id="compareSize">
          ${selectOption("all", "alle", filters.size)}
          ${sizes.map((value) => selectOption(value, value, filters.size)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>Kategorie</span>
        <select id="compareCategory">
          ${selectOption("all", "alle", filters.category)}
          ${orderedCategories(state.categories).map((category) => selectOption(category, categoryLabel(category), filters.category)).join("")}
        </select>
      </label>
      <label class="field compact-field wide-field">
        <span>Einzeltest</span>
        <select id="compareTest">
          ${renderTestOptions(filters.category, filters.test)}
        </select>
      </label>
      <label class="field compact-field">
        <span>Score min.</span>
        <input id="compareScoreMin" type="number" min="0" max="100" step="1" value="${escapeHtml(filters.scoreMin)}" placeholder="0" />
      </label>
      <label class="field compact-field">
        <span>tok/s min.</span>
        <input id="compareTpsMin" type="number" min="0" step="1" value="${escapeHtml(filters.tpsMin)}" placeholder="0" />
      </label>
      <button id="compareResetBtn" class="ghost filter-reset" type="button">Filter zurücksetzen</button>
    </div>
  `;
  bindComparisonFilters();
}

function bindComparisonFilters() {
  const bindValue = (id, key, event = "change", options = {}) => {
    const element = $(id);
    if (!element) return;
    element.addEventListener(event, () => {
      state.compareFilters[key] = element.value;
      if (key === "category") state.compareFilters.test = "all";
      renderComparison({ updateFilters: options.updateFilters ?? true });
    });
  };

  bindValue("compareSearch", "search", "input", { updateFilters: false });
  bindValue("compareSort", "sort");
  bindValue("compareQuantization", "quantization");
  bindValue("compareModelKind", "modelKind");
  bindValue("compareSize", "size");
  bindValue("compareCategory", "category");
  bindValue("compareTest", "test");
  bindValue("compareScoreMin", "scoreMin", "input", { updateFilters: false });
  bindValue("compareTpsMin", "tpsMin", "input", { updateFilters: false });
  $("compareResetBtn")?.addEventListener("click", () => {
    state.compareFilters = defaultCompareFilters();
    renderComparison();
  });
}

function bindComparisonActions() {
  document.querySelectorAll(".delete-run").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteRun(button.dataset.runId);
    });
  });
  document.querySelectorAll(".test-compare-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("pre") || event.target.closest("button")) return;
      const detail = document.querySelector(`[data-detail-for="${CSS.escape(card.dataset.testId)}"]`);
      if (detail) detail.hidden = !detail.hidden;
    });
  });
}

function buildComparisonRows(loaded) {
  return loaded.map((run, index) => {
    const summary = run.summary;
    const details = summary.model_details || {};
    const paramInfo = parseModelSize(summary);
    const results = run.results || [];
    const resultMap = new Map(results.map((record) => [record.id, record]));
    const displayName = friendlyModelName(summary);
    const quantization = normalizedValue(details.quantization || inferQuantizationFromText(summary.model), "unbekannt");
    const format = normalizedValue(details.format || inferFormatFromText(summary.model), "unbekannt");
    const modelKind = inferModelKind(summary, paramInfo);
    const sizeKey = paramInfo.label || "unbekannt";

    return {
      id: summary.run_id || state.runs[index]?.id,
      summary,
      results,
      resultMap,
      displayName,
      quantization,
      format,
      modelKind,
      sizeKey,
      totalParamsB: paramInfo.totalB,
      activeParamsB: paramInfo.activeB,
      score: summary.balanced_final_percent ?? summary.final_percent ?? balancedFromCategories(summary),
      autoScore: summary.balanced_auto_percent ?? summary.auto_percent,
      tps: numberOrNull(summary.performance?.avg_tokens_per_second),
      ttft: numberOrNull(summary.performance?.avg_time_to_first_token_seconds),
      prefill: numberOrNull(summary.performance?.avg_prompt_processing_seconds),
      totalSeconds: numberOrNull(summary.performance?.avg_total_seconds),
      color: modelColor(index),
      searchText: [
        displayName,
        summary.model,
        details.display_name,
        details.key,
        details.selected_variant,
        details.publisher,
        details.architecture,
        details.params,
        quantization,
        format,
        modelKind,
        sizeKey,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE"),
    };
  });
}

function renderComparisonSummary(rows, filteredRows) {
  const top = filteredRows[0];
  const avgScore = average(filteredRows.map((row) => rowEffectiveScore(row, state.compareFilters)).filter((value) => value !== null));
  const avgTps = average(filteredRows.map((row) => row.tps).filter((value) => value !== null));
  return `
    <section class="compare-overview">
      ${renderOverviewStat("Runs", filteredRows.length, `${rows.length} gesamt`)}
      ${renderOverviewStat("Ø Score", fmtPercent(avgScore), "nach Filter")}
      ${renderOverviewStat("Ø tok/s", fmtNumber(avgTps), "nach Filter")}
      ${renderOverviewStat("Spitze", top ? escapeHtml(top.displayName) : "--", top ? fmtPercent(rowEffectiveScore(top, state.compareFilters)) : "kein Treffer")}
    </section>
  `;
}

function renderOverviewStat(label, value, meta) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <small>${escapeHtml(meta)}</small>
    </article>
  `;
}

function renderOverallRanking(rows, filters) {
  if (!rows.length) {
    return `
      <section class="compare-block">
        <div class="compare-title-row">
          <h3>Allgemeines Ranking</h3>
        </div>
        <p class="empty">Keine Runs passen zu diesen Filtern.</p>
      </section>
    `;
  }
  return `
    <section class="compare-block">
      <div class="compare-title-row">
        <h3>Allgemeines Ranking</h3>
        <span>${escapeHtml(scoreScopeLabel(filters))}</span>
      </div>
      <div class="ranking-list">
        ${rows.map((row, index) => renderRankingRow(row, index, filters)).join("")}
      </div>
    </section>
  `;
}

function renderRankingRow(row, index, filters) {
  const score = rowEffectiveScore(row, filters);
  const detailsLine = [row.format, row.quantization].filter((part) => part && part !== "unbekannt").join(" · ");
  const failed = failedCount(row.summary) + (row.summary.status_counts?.error || 0);
  return `
    <article class="rank-row" style="--model-color:${row.color}; --score-width:${Math.max(0, Math.min(100, Number(score || 0)))}%">
      <div class="rank-number">${index + 1}</div>
      <div class="rank-model">
        <strong>${escapeHtml(row.displayName)}</strong>
        <small>${escapeHtml(detailsLine || "keine Metadaten")}</small>
      </div>
      ${renderRankMetric("Score", fmtPercent(score), true)}
      ${renderRankMetric("tok/s", fmtNumber(row.tps))}
      ${renderRankMetric("Größe", row.sizeKey)}
      ${renderRankMetric("Art", row.modelKind)}
      <div class="rank-misses"><span>${failed}</span><small>falsch</small></div>
      <button class="delete-run compact-delete" type="button" data-run-id="${escapeHtml(row.id)}" title="Run löschen">×</button>
    </article>
  `;
}

function renderRankMetric(label, value, withBar = false) {
  return `
    <div class="rank-metric ${withBar ? "score-metric" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function renderCategoryRankings(rows, filters) {
  const baseRows = rows.filter((row) => rowMatchesStaticFilters(row, filters));
  const categories = filters.category === "all" ? orderedCategories(state.categories) : [filters.category];
  if (!categories.length) return "";
  return `
    <section class="compare-block">
      <div class="compare-title-row">
        <h3>Kategorie-Rankings</h3>
        <span>${categories.length} Kategorien</span>
      </div>
      <div class="category-rank-grid">
        ${categories.map((category) => renderCategoryRankCard(category, baseRows)).join("")}
      </div>
    </section>
  `;
}

function renderCategoryRankCard(category, rows) {
  const ranked = rows
    .map((row) => ({ row, score: rowCategoryScore(row, category) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score || compareNumbers(b.row.tps, a.row.tps))
    .slice(0, 8);
  return `
    <article class="category-rank-card">
      <header>
        <strong title="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</strong>
        <span>${ranked.length ? fmtPercent(average(ranked.map((item) => item.score))) : "--%"}</span>
      </header>
      <div class="mini-rank-list">
        ${
          ranked.length
            ? ranked.map(({ row, score }, index) => renderMiniRankRow(row, index, score, row.summary.categories?.[category])).join("")
            : `<p class="empty">Keine Daten.</p>`
        }
      </div>
    </article>
  `;
}

function renderMiniRankRow(row, index, score, categoryData) {
  return `
    <div class="mini-rank-row" style="--model-color:${row.color}; --score-width:${Math.max(0, Math.min(100, Number(score || 0)))}%">
      <span>${index + 1}</span>
      <strong>${escapeHtml(modelNameWithQuantization(row))}</strong>
      <small>${fmtPercent(score)} · ${categoryData?.passed_cases || 0}/${categoryData?.cases || 0}</small>
    </div>
  `;
}

function renderTestComparison(rows, filters) {
  const baseRows = rows.filter((row) => rowMatchesStaticFilters(row, filters));
  const tests = visibleComparisonTests(baseRows, filters);
  if (!tests.length) return "";
  const limited = filters.test === "all" && filters.category === "all";
  return `
    <section class="compare-block">
      <div class="compare-title-row">
        <h3>Einzeltest-Vergleich</h3>
        <span>${limited ? `${tests.length} trennschärfste Tests` : `${tests.length} Tests`}</span>
      </div>
      <div class="test-compare-list">
        ${tests.map((testCase) => renderTestCompareCard(testCase, baseRows)).join("")}
      </div>
    </section>
  `;
}

function renderTestCompareCard(testCase, rows) {
  const testRows = rows
    .map((row) => ({ row, record: row.resultMap.get(testCase.id), score: recordScorePercent(row.resultMap.get(testCase.id)) }))
    .sort((a, b) => compareNullableDesc(a.score, b.score) || compareNumbers(b.row.tps, a.row.tps));
  const passed = testRows.filter((item) => item.score === 100).length;
  const failed = testRows.filter((item) => item.score === 0).length;
  return `
    <article class="test-compare-card" data-test-id="${escapeHtml(testCase.id)}">
      <div class="bar-compare-title">
        <strong>${escapeHtml(displayTitle(testCase.title || testCase.id))}</strong>
        <small title="${escapeHtml(testCase.category || "")}">${escapeHtml(categoryLabel(testCase.category))} · ${passed} richtig · ${failed} falsch</small>
      </div>
      <div class="test-status-list">
        ${testRows.map(({ row, record }) => renderDashboardTestStatusRow(row, record)).join("")}
      </div>
    </article>
    <div class="test-detail-panel" data-detail-for="${escapeHtml(testCase.id)}" hidden>
      ${renderTestBrief(testCase)}
      <div class="test-detail-grid">
        ${testRows.map(({ row, record }) => renderDashboardResultDetail(row, record)).join("")}
      </div>
    </div>
  `;
}

function renderDashboardTestStatusRow(row, record) {
  if (!record) {
    return `
      <div class="test-status-row missing" style="--model-color:${row.color}">
        <span class="legend-dot"></span>
        <span class="test-status-model">${escapeHtml(modelNameWithQuantization(row))}</span>
        <span class="result-pill">nicht gelaufen</span>
        <span class="test-status-meta">--</span>
      </div>
    `;
  }
  return `
    <div class="test-status-row" style="--model-color:${row.color}">
      <span class="legend-dot"></span>
      <span class="test-status-model">${escapeHtml(modelNameWithQuantization(row))}</span>
      <span class="result-pill ${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
      <span class="test-status-meta">${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
    </div>
  `;
}

function renderDashboardResultDetail(row, record) {
  if (!record) {
    return `<article class="result-detail" style="--model-color:${row.color}"><h4>${escapeHtml(row.displayName)}</h4><p class="empty">Dieser Test wurde in diesem Run nicht ausgeführt.</p></article>`;
  }
  const failed = (record.score.checks || []).filter((check) => !check.passed);
  return `
    <article class="result-detail" style="--model-color:${row.color}">
      <h4>${escapeHtml(row.displayName)}</h4>
      <div class="detail-metrics">
        <span class="${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
        <span>${fmtSeconds(record.metrics?.time_to_first_token_seconds)} TTFT</span>
        <span>${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
        <span>${fmtSeconds(record.metrics?.total_seconds)} total</span>
      </div>
      <p class="review-reason">${escapeHtml(record.score.reason || "")}</p>
      <div class="checks">
        ${
          failed.length
            ? failed.map((check) => `<p class="status-fail">${escapeHtml(check.label || check.type)}: ${escapeHtml(check.detail)}</p>`).join("")
            : `<p class="status-pass">Alle automatischen Checks bestanden.</p>`
        }
      </div>
      <pre>${escapeHtml((record.output || "").slice(0, 1800))}</pre>
    </article>
  `;
}

function rowMatchesFilters(row, filters) {
  if (!rowMatchesStaticFilters(row, filters)) return false;
  if (filters.category !== "all" && rowCategoryScore(row, filters.category) === null) return false;
  if (filters.test !== "all" && !row.resultMap.has(filters.test)) return false;

  const score = rowEffectiveScore(row, filters);
  const minScore = numberOrNull(filters.scoreMin);
  const minTps = numberOrNull(filters.tpsMin);
  if (minScore !== null && (score === null || score < minScore)) return false;
  if (minTps !== null && (row.tps === null || row.tps < minTps)) return false;
  return true;
}

function rowMatchesStaticFilters(row, filters) {
  const search = filters.search.trim().toLocaleLowerCase("de-DE");
  if (search && !row.searchText.includes(search)) return false;
  if (filters.quantization !== "all" && row.quantization !== filters.quantization) return false;
  if (filters.modelKind !== "all" && row.modelKind !== filters.modelKind) return false;
  if (filters.size !== "all" && row.sizeKey !== filters.size) return false;
  const minTps = numberOrNull(filters.tpsMin);
  if (minTps !== null && (row.tps === null || row.tps < minTps)) return false;
  return true;
}

function rowEffectiveScore(row, filters) {
  if (filters.test !== "all") return recordScorePercent(row.resultMap.get(filters.test));
  if (filters.category !== "all") return rowCategoryScore(row, filters.category);
  return row.score ?? null;
}

function rowCategoryScore(row, category) {
  return categoryFinalPercent(row.summary.categories?.[category]);
}

function recordScorePercent(record) {
  if (!record) return null;
  if (record.score?.final_percent !== undefined && record.score?.final_percent !== null) return Number(record.score.final_percent);
  if (record.score?.percent !== undefined && record.score?.percent !== null) return Number(record.score.percent);
  if (record.score?.status === "auto_passed" || record.score?.status === "reviewed") return 100;
  if (record.score?.status === "auto_failed" || record.score?.status === "error") return 0;
  return null;
}

function sortComparisonRows(rows, filters) {
  return [...rows].sort((left, right) => {
    if (filters.sort === "score_asc") return compareNullableAsc(rowEffectiveScore(left, filters), rowEffectiveScore(right, filters)) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "tps_desc") return compareNumbers(right.tps, left.tps) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "tps_asc") return compareNumbers(left.tps, right.tps) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "size_desc") return compareNumbers(right.totalParamsB, left.totalParamsB) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "size_asc") return compareNumbers(left.totalParamsB, right.totalParamsB) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "errors_asc") return compareNumbers(failedCount(left.summary), failedCount(right.summary)) || left.displayName.localeCompare(right.displayName);
    if (filters.sort === "name_asc") return left.displayName.localeCompare(right.displayName);
    if (filters.sort === "date_desc") return String(right.summary.created_at || "").localeCompare(String(left.summary.created_at || ""));
    return compareNullableDesc(rowEffectiveScore(left, filters), rowEffectiveScore(right, filters)) || compareNumbers(right.tps, left.tps) || left.displayName.localeCompare(right.displayName);
  });
}

function visibleComparisonTests(rows, filters) {
  const tests = comparisonTestCatalog(rows).filter((testCase) => {
    if (filters.category !== "all" && testCase.category !== filters.category) return false;
    if (filters.test !== "all" && testCase.id !== filters.test) return false;
    return true;
  });
  if (filters.test !== "all" || filters.category !== "all") return tests;
  return tests
    .map((testCase, index) => ({ testCase, index, spread: testDiscrimination(testCase.id, rows) }))
    .sort((left, right) => right.spread - left.spread || left.index - right.index)
    .slice(0, 30)
    .map((item) => item.testCase);
}

function testDiscrimination(testId, rows) {
  const scores = rows.map((row) => recordScorePercent(row.resultMap.get(testId))).filter((value) => value !== null);
  if (scores.length < 2) return 0;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const passCount = scores.filter((score) => score === 100).length;
  const failCount = scores.filter((score) => score === 0).length;
  return max - min + Math.min(passCount, failCount);
}

function comparisonTestCatalog(rows) {
  const map = new Map(state.cases.map((testCase) => [testCase.id, testCase]));
  for (const row of rows) {
    for (const record of row.results) {
      if (!map.has(record.id)) {
        map.set(record.id, { id: record.id, title: record.title || record.id, category: record.category || "unknown" });
      }
    }
  }
  const orderedIds = [
    ...state.cases.map((testCase) => testCase.id),
    ...[...map.keys()].filter((id) => !state.cases.some((testCase) => testCase.id === id)),
  ];
  return orderedIds.map((id) => map.get(id)).filter(Boolean);
}

function renderTestOptions(selectedCategory, selectedTest) {
  const tests = comparisonTestCatalog([]).filter((testCase) => selectedCategory === "all" || testCase.category === selectedCategory);
  const byCategory = new Map();
  for (const testCase of tests) {
    const category = testCase.category || "unknown";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(testCase);
  }
  return [
    selectOption("all", "alle", selectedTest),
    ...orderedCategories([...byCategory.keys()]).map(
      (category) => `
        <optgroup label="${escapeHtml(categoryLabel(category))}">
          ${byCategory
            .get(category)
            .map((testCase) => selectOption(testCase.id, `${testCase.id} · ${displayTitle(testCase.title || "")}`, selectedTest))
            .join("")}
        </optgroup>
      `,
    ),
  ].join("");
}

function testBelongsToCategory(testId, selectedCategory) {
  if (selectedCategory === "all" || testId === "all") return true;
  const match = state.cases.find((testCase) => testCase.id === testId);
  return !match || match.category === selectedCategory;
}

function scoreScopeLabel(filters) {
  if (filters.test !== "all") {
    const testCase = state.cases.find((item) => item.id === filters.test);
    return testCase ? `Einzeltest: ${testCase.id}` : `Einzeltest: ${filters.test}`;
  }
  if (filters.category !== "all") return `Kategorie: ${categoryLabel(filters.category)}`;
  return "Gesamt-Score";
}

function modelNameWithQuantization(row) {
  const quantization = row.quantization && row.quantization !== "unbekannt" ? row.quantization : "";
  return [row.displayName, quantization].filter(Boolean).join(" ");
}

function friendlyModelName(summary) {
  const details = summary.model_details || {};
  const raw = details.display_name || details.key || summary.model || "Unbekannt";
  let name = String(raw).split(/[\\/]/).pop() || String(raw);
  name = name
    .replace(/@.*$/, "")
    .replace(/\.(gguf|safetensors|bin)$/i, "")
    .replace(/[-_.](?:i?q|q)\d(?:_[a-z0-9]+){0,3}$/i, "")
    .replace(/[-_.](?:f16|bf16|fp16|fp32)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  name = name
    .replace(/^qwen(\d)/i, "Qwen $1")
    .replace(/^gemma\s*/i, "Gemma ")
    .replace(/^llama\s*/i, "Llama ")
    .replace(/^mistral\s*/i, "Mistral ")
    .replace(/^mixtral\s*/i, "Mixtral ")
    .replace(/^deepseek\s*/i, "DeepSeek ")
    .replace(/^phi\s*/i, "Phi ")
    .replace(/\b(\d+(?:\.\d+)?)(b|m)\b/gi, (_, number, unit) => `${number}${unit.toUpperCase()}`)
    .replace(/\ba(\d+(?:\.\d+)?)b\b/gi, (_, number) => `A${number}B`);
  return name || raw;
}

function parseModelSize(summary) {
  const details = summary.model_details || {};
  const text = [details.params, details.display_name, details.key, details.selected_variant, summary.model].filter(Boolean).join(" ");
  const match = text.match(/(\d+(?:\.\d+)?)\s*B(?:[-_\s]*A(\d+(?:\.\d+)?)\s*B)?/i);
  if (!match) return { label: null, totalB: null, activeB: null };
  const totalB = Number(match[1]);
  const activeB = match[2] ? Number(match[2]) : null;
  return {
    label: activeB ? `${formatParamNumber(totalB)}B-A${formatParamNumber(activeB)}B` : `${formatParamNumber(totalB)}B`,
    totalB,
    activeB,
  };
}

function formatParamNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");
}

function inferModelKind(summary, paramInfo) {
  const details = summary.model_details || {};
  const text = [details.architecture, details.params, details.display_name, details.key, details.selected_variant, summary.model].filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
  if (paramInfo.activeB || /\bmoe\b|mixture|mixtral|a\d+(?:\.\d+)?b/.test(text)) return "MoE";
  if (paramInfo.totalB || text) return "Dense";
  return "Unbekannt";
}

function inferQuantizationFromText(value) {
  const match = String(value || "").match(/(?:@|[-_.])((?:i?q|q)\d(?:_[a-z0-9]+){0,3}|f16|bf16|fp16|fp32)(?:$|[-_.])/i);
  return match ? match[1].toUpperCase() : null;
}

function inferFormatFromText(value) {
  const lower = String(value || "").toLocaleLowerCase("de-DE");
  if (lower.includes("gguf")) return "gguf";
  if (lower.includes("mlx")) return "mlx";
  if (lower.includes("safetensors")) return "safetensors";
  return null;
}

function normalizedValue(value, fallback) {
  return value ? String(value) : fallback;
}

function selectOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function uniqueSorted(values, compare = undefined) {
  return [...new Set(values)].sort(compare || ((left, right) => String(left).localeCompare(String(right), "de-DE")));
}

function compareSizeKeys(left, right) {
  const leftNumber = Number(String(left).match(/\d+(?:\.\d+)?/)?.[0] || -1);
  const rightNumber = Number(String(right).match(/\d+(?:\.\d+)?/)?.[0] || -1);
  return rightNumber - leftNumber || String(left).localeCompare(String(right), "de-DE");
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  const clean = values.filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function compareNumbers(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNullableDesc(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function compareNullableAsc(left, right) {
  const a = numberOrNull(left);
  const b = numberOrNull(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function modelColor(index) {
  return modelColors[index % modelColors.length];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("refreshBtn").addEventListener("click", refreshAll);
$("reloadRunsBtn").addEventListener("click", loadRuns);
$("startBtn").addEventListener("click", () => startRun().catch((error) => alert(error.message)));
$("stopBtn").addEventListener("click", () => stopRun().catch((error) => alert(error.message)));
$("abortCaseBtn").addEventListener("click", () => abortCurrentCase().catch((error) => {
  state.caseAbortInFlight = false;
  $("abortCaseBtn").disabled = false;
  $("abortCaseBtn").textContent = "Test abbrechen";
  alert(error.message);
}));
$("allCategoriesBtn").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll("#categories input")];
  const allChecked = boxes.every((box) => box.checked);
  boxes.forEach((box) => {
    box.checked = !allChecked;
  });
});
$("baseUrl").addEventListener("change", () => loadModels().catch(() => {}));
$("modelSelect").addEventListener("change", renderReasoningStatus);

refreshAll();
resetLive();
startModelStatusPolling();
