function initialLanguage() {
  const saved = localStorage.getItem("lmb:language");
  if (saved === "de" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
}

const state = {
  language: initialLanguage(),
  suite: null,
  cases: [],
  categories: [],
  runs: [],
  runDetails: new Map(),
  modelStatus: { loaded: [], available: [] },
  modelStatusKnown: false,
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
  runStartInFlight: false,
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
const TEXT = {
  de: {
    "topbar.status": "Status",
    "language.aria": "Sprache",
    "language.locked": "Sprache kann während eines laufenden Tests nicht gewechselt werden",
    "controls.run": "Run",
    "actions.refresh": "Aktualisieren",
    "actions.abortTest": "Test abbrechen",
    "actions.aborting": "Breche ab...",
    "actions.deleteRun": "Run löschen",
    "fields.model": "Modell",
    "reasoning.aria": "Reasoning-Status",
    "reasoning.max": "Maximale Reasoning-Stufe",
    "reasoning.inTest": "Reasoning im Test",
    "placeholders.unlimited": "unbegrenzt",
    "common.all": "alle",
    "common.unknown": "unbekannt",
    "common.na": "n/a",
    "sections.categories": "Kategorien",
    "sections.category": "Kategorie",
    "sections.result": "Ergebnis",
    "sections.results": "Ergebnisse",
    "sections.compare": "Vergleich",
    "run.none": "Kein Lauf aktiv",
    "server.offline": "Offline",
    "server.noModel": "Kein Modell",
    "server.loaded": "{count} geladen",
    "phase.ready": "bereit",
    "phase.start": "start",
    "phase.modelLoad": "Modell laden",
    "phase.prefill": "prefill",
    "phase.generate": "Generierung",
    "phase.unload": "Modell entladen",
    "phase.stopping": "Stoppe",
    "phase.caseAborting": "Test wird abgebrochen",
    "current.test": "Aktueller Test",
    "current.points": "{count} Punkte",
    "metrics.time": "Zeit",
    "metrics.total": "total",
    "status.auto_passed": "Richtig",
    "status.auto_failed": "Falsch",
    "status.needs_review": "Review",
    "status.reviewed": "Geprüft",
    "status.error": "Fehler",
    "model.noMetadata": "keine Metadaten",
    "model.kindDense": "Dense",
    "model.kindUnknown": "Unbekannt",
    "batch.allTested": "Alle Modelle aus der Liste sind bereits getestet.",
    "batch.stopped": "Batch gestoppt",
    "batch.done": "Batch fertig",
    "batch.unloading": "Entlade {model} aus LM Studio.",
    "batch.unloadedNext": "Modell entladen. Starte nächstes Modell.",
    "batch.models": "{count} Modelle",
    "empty.noScores": "Noch keine Scores.",
    "empty.noRuns": "Noch keine gespeicherten Runs.",
    "empty.loadingRuns": "Runs werden geladen.",
    "empty.noFilterRuns": "Keine Runs passen zu diesen Filtern.",
    "empty.noData": "Keine Daten.",
    "empty.notRun": "nicht gelaufen",
    "empty.notExecuted": "Dieser Test wurde in diesem Run nicht ausgeführt.",
    "delete.confirm": "Run wirklich löschen?\n\n{label}",
    "cards.failed": "Falsch",
    "cards.variant": "Variante",
    "cards.architecture": "Architektur",
    "cards.context": "Kontext",
    "category.heading": "Kategorien",
    "category.meta": "auto {auto} | richtig {passed}/{cases} | falsch {failed}",
    "tests.heading": "Einzeltests",
    "task.heading": "Aufgabe",
    "task.system": "System-Kontext",
    "task.user": "Nutzeraufgabe",
    "task.unavailable": "Die Aufgabenstellung ist für diesen alten Run nicht verfügbar.",
    "checks.auto": "Auto-Checks",
    "checks.legacyRubric": "Legacy-Rubrik",
    "checks.points": "{count} Pkt.",
    "checks.none": "Keine automatischen Checks.",
    "checks.allPassed": "Alle automatischen Checks bestanden.",
    "checks.jsonValid": "Antwort muss valides JSON enthalten.",
    "checks.mustContain": "Muss enthalten: {items}",
    "checks.containsAny": "Mindestens eins davon: {items}",
    "checks.mustNotContain": "Darf nicht enthalten: {items}",
    "checks.regex": "Regex muss passen: {patterns}",
    "checks.forbiddenRegex": "Regex darf nicht passen: {patterns}",
    "checks.maxWords": "Maximal {count} Wörter.",
    "checks.lineCount": "Genau {count} nicht-leere Zeilen.",
    "checks.maxChars": "Maximal {count} Zeichen.",
    "filters.search": "Suchen",
    "filters.searchPlaceholder": "Modell, Familie, Run",
    "filters.sort": "Sortieren",
    "filters.quantization": "Quantisierung",
    "filters.modelKind": "ART",
    "filters.size": "Größe",
    "filters.category": "Kategorie",
    "filters.test": "Einzeltest",
    "filters.scoreMin": "Score min.",
    "filters.tpsMin": "tok/s min.",
    "filters.reset": "Filter zurücksetzen",
    "sort.scoreDesc": "Score absteigend",
    "sort.scoreAsc": "Score aufsteigend",
    "sort.tpsDesc": "tok/s absteigend",
    "sort.tpsAsc": "tok/s aufsteigend",
    "sort.sizeDesc": "Größe absteigend",
    "sort.sizeAsc": "Größe aufsteigend",
    "sort.errorsAsc": "Wenigste Fehler",
    "sort.nameAsc": "Name A-Z",
    "sort.dateDesc": "Neueste zuerst",
    "overview.total": "{count} gesamt",
    "overview.filtered": "nach Filter",
    "overview.top": "Spitze",
    "overview.noMatch": "kein Treffer",
    "ranking.overall": "Allgemeines Ranking",
    "ranking.misses": "falsch",
    "ranking.category": "Kategorie-Rankings",
    "ranking.categoryCount": "{count} Kategorien",
    "ranking.testComparison": "Einzeltest-Vergleich",
    "ranking.discriminatingTests": "{count} trennschärfste Tests",
    "ranking.tests": "{count} Tests",
    "ranking.passFail": "{passed} richtig · {failed} falsch",
    "scope.test": "Einzeltest: {id}",
    "scope.category": "Kategorie: {category}",
    "scope.total": "Gesamt-Score",
  },
  en: {
    "topbar.status": "Status",
    "language.aria": "Language",
    "language.locked": "Language cannot be changed while a test is running",
    "controls.run": "Run",
    "actions.refresh": "Refresh",
    "actions.abortTest": "Abort test",
    "actions.aborting": "Aborting...",
    "actions.deleteRun": "Delete run",
    "fields.model": "Model",
    "reasoning.aria": "Reasoning status",
    "reasoning.max": "Maximum reasoning level",
    "reasoning.inTest": "Reasoning during test",
    "placeholders.unlimited": "unlimited",
    "common.all": "all",
    "common.unknown": "unknown",
    "common.na": "n/a",
    "sections.categories": "Categories",
    "sections.category": "Category",
    "sections.result": "Result",
    "sections.results": "Results",
    "sections.compare": "Compare",
    "run.none": "No active run",
    "server.offline": "Offline",
    "server.noModel": "No model",
    "server.loaded": "{count} loaded",
    "phase.ready": "ready",
    "phase.start": "start",
    "phase.modelLoad": "Loading model",
    "phase.prefill": "prefill",
    "phase.generate": "Generating",
    "phase.unload": "Unloading model",
    "phase.stopping": "Stopping",
    "phase.caseAborting": "Aborting test",
    "current.test": "Current test",
    "current.points": "{count} pts",
    "metrics.time": "Time",
    "metrics.total": "total",
    "status.auto_passed": "Correct",
    "status.auto_failed": "Wrong",
    "status.needs_review": "Review",
    "status.reviewed": "Reviewed",
    "status.error": "Error",
    "model.noMetadata": "no metadata",
    "model.kindDense": "Dense",
    "model.kindUnknown": "Unknown",
    "batch.allTested": "All models in the list have already been tested.",
    "batch.stopped": "Batch stopped",
    "batch.done": "Batch complete",
    "batch.unloading": "Unloading {model} from LM Studio.",
    "batch.unloadedNext": "Model unloaded. Starting next model.",
    "batch.models": "{count} models",
    "empty.noScores": "No scores yet.",
    "empty.noRuns": "No saved runs yet.",
    "empty.loadingRuns": "Loading runs.",
    "empty.noFilterRuns": "No runs match these filters.",
    "empty.noData": "No data.",
    "empty.notRun": "not run",
    "empty.notExecuted": "This test was not run in this run.",
    "delete.confirm": "Delete this run?\n\n{label}",
    "cards.failed": "Wrong",
    "cards.variant": "Variant",
    "cards.architecture": "Architecture",
    "cards.context": "Context",
    "category.heading": "Categories",
    "category.meta": "auto {auto} | correct {passed}/{cases} | wrong {failed}",
    "tests.heading": "Individual tests",
    "task.heading": "Task",
    "task.system": "System context",
    "task.user": "User task",
    "task.unavailable": "The task text is not available for this old run.",
    "checks.auto": "Auto checks",
    "checks.legacyRubric": "Legacy rubric",
    "checks.points": "{count} pts.",
    "checks.none": "No automatic checks.",
    "checks.allPassed": "All automatic checks passed.",
    "checks.jsonValid": "Response must contain valid JSON.",
    "checks.mustContain": "Must contain: {items}",
    "checks.containsAny": "At least one of: {items}",
    "checks.mustNotContain": "Must not contain: {items}",
    "checks.regex": "Regex must match: {patterns}",
    "checks.forbiddenRegex": "Regex must not match: {patterns}",
    "checks.maxWords": "At most {count} words.",
    "checks.lineCount": "Exactly {count} non-empty lines.",
    "checks.maxChars": "At most {count} characters.",
    "filters.search": "Search",
    "filters.searchPlaceholder": "Model, family, run",
    "filters.sort": "Sort",
    "filters.quantization": "Quantization",
    "filters.modelKind": "TYPE",
    "filters.size": "Size",
    "filters.category": "Category",
    "filters.test": "Individual test",
    "filters.scoreMin": "Score min.",
    "filters.tpsMin": "tok/s min.",
    "filters.reset": "Reset filters",
    "sort.scoreDesc": "Score descending",
    "sort.scoreAsc": "Score ascending",
    "sort.tpsDesc": "tok/s descending",
    "sort.tpsAsc": "tok/s ascending",
    "sort.sizeDesc": "Size descending",
    "sort.sizeAsc": "Size ascending",
    "sort.errorsAsc": "Fewest errors",
    "sort.nameAsc": "Name A-Z",
    "sort.dateDesc": "Newest first",
    "overview.total": "{count} total",
    "overview.filtered": "after filters",
    "overview.top": "Top",
    "overview.noMatch": "no match",
    "ranking.overall": "Overall ranking",
    "ranking.misses": "wrong",
    "ranking.category": "Category rankings",
    "ranking.categoryCount": "{count} categories",
    "ranking.testComparison": "Individual test comparison",
    "ranking.discriminatingTests": "{count} most discriminating tests",
    "ranking.tests": "{count} tests",
    "ranking.passFail": "{passed} correct · {failed} wrong",
    "scope.test": "Individual test: {id}",
    "scope.category": "Category: {category}",
    "scope.total": "Overall score",
  },
};

function t(key, values = {}) {
  const dictionary = TEXT[state.language] || TEXT.de;
  const template = dictionary[key] ?? TEXT.de[key] ?? key;
  return template.replaceAll(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

function locale() {
  return state.language === "de" ? "de-DE" : "en-US";
}

function translateStaticUi() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    if (element.id === "runLabel" && (state.activeRunId || state.batch)) return;
    if (element.id === "abortCaseBtn" && state.caseAbortInFlight) return;
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  renderLanguageSwitch();
}

function languageSwitchLocked() {
  return Boolean(state.runStartInFlight || state.activeRunId || state.activeSource || state.batch);
}

function renderLanguageSwitch() {
  const locked = languageSwitchLocked();
  document.querySelectorAll(".language-option").forEach((button) => {
    const isActive = button.dataset.lang === state.language;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    button.disabled = locked;
    button.title = locked ? t("language.locked") : "";
  });
}

function setLanguage(language) {
  if (languageSwitchLocked()) {
    renderLanguageSwitch();
    return;
  }
  if (!["de", "en"].includes(language) || language === state.language) return;
  state.language = language;
  localStorage.setItem("lmb:language", language);
  translateStaticUi();
  state.compareFilters = defaultCompareFilters();
  renderModelStatus();
  renderReasoningStatus();
  renderLive();
  renderResults();
  loadCases().catch((error) => alert(error.message));
}

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
  de: {
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
  },
  en: {
    instruktion_format: "Instruction & Format",
    dokumente_kontext: "Documents & Context",
    daten_tabellen: "Data & Tables",
    finanz_business: "Finance & Business",
    reasoning_planung: "Reasoning & Planning",
    coding_bugfix: "Coding: Bugfixing",
    coding_review_architektur: "Coding: Review & Architecture",
    tool_os: "Tool Use & OS",
    agent_sicherheit: "Agentic Behavior & Safety",
    multiturn_kontext: "Multi-Turn & Context",
  },
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS.de);
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
  const labels = CATEGORY_LABELS[state.language] || CATEGORY_LABELS.de;
  if (labels[category]) return labels[category];
  return String(category)
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase(locale())}${part.slice(1)}`)
    .join(" ");
}

function categoryRank(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function orderedCategories(categories) {
  return [...categories].sort((left, right) => categoryRank(left) - categoryRank(right) || left.localeCompare(right, locale()));
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
  const key = `status.${score.status}`;
  if (score.status && ((TEXT[state.language] || {})[key] || TEXT.de[key])) return t(key);
  return score.status || "Auto";
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
  const url = new URL("/api/cases", location.origin);
  url.searchParams.set("lang", state.language);
  const data = await api(url.pathname + url.search);
  state.suite = {
    language: data.suite_language || state.language,
    id: data.suite_id || `praxis_${state.language}`,
    file: data.suite_file || `testfaelle/praxis_${state.language}.json`,
  };
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
  state.modelStatusKnown = true;
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
  renderModelStatus();
  renderReasoningStatus();
}

function renderModelStatus() {
  const serverState = $("serverState");
  if (!serverState) return;
  const data = state.modelStatus || { loaded: [], errors: [] };
  const loaded = data.loaded || [];
  serverState.className = "server-pill";
  if (loaded.length) {
    serverState.textContent = t("server.loaded", { count: loaded.length });
    serverState.classList.add("online");
  } else if (data.errors?.length) {
    serverState.textContent = t("server.offline");
    serverState.classList.add("warn");
  } else {
    serverState.textContent = state.modelStatusKnown ? t("server.noModel") : t("server.offline");
    serverState.classList.add("warn");
  }
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
    suiteLanguage: state.language,
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
  return parts.length ? parts.join(" · ") : t("model.noMetadata");
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

function runSuiteLanguage(run) {
  return run?.summary?.suite_language || run?.suite_language || "de";
}

function runsForCurrentLanguage() {
  return state.runs.filter((run) => runSuiteLanguage(run) === state.language);
}

function runCoversCurrentSelection(run) {
  if (runSuiteLanguage(run) !== state.language) return false;
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
  state.runStartInFlight = true;
  renderLanguageSwitch();
  try {
    if (($("modelSelect").value || "auto") === "auto") {
      await startBatchRun();
      return;
    }
    state.batch = null;
    await startSingleRun($("modelSelect").value || "auto");
  } finally {
    state.runStartInFlight = false;
    renderLanguageSwitch();
  }
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
  renderLanguageSwitch();
  connectEvents(response.runId);
}

async function startBatchRun() {
  if (state.activeSource) state.activeSource.close();
  resetLive();
  await Promise.allSettled([loadModels(), loadRuns()]);
  const models = untestedDropdownModelIds();
  if (!models.length) {
    $("runLabel").textContent = t("batch.allTested");
    renderLive();
    return;
  }
  state.batch = { models, index: 0, stopRequested: false };
  $("startBtn").disabled = true;
  $("stopBtn").disabled = false;
  renderLanguageSwitch();
  await startNextBatchRun();
}

async function startNextBatchRun() {
  if (!state.batch || state.batch.stopRequested) {
    finishBatch(t("batch.stopped"));
    return;
  }
  if (state.batch.index >= state.batch.models.length) {
    finishBatch(t("batch.done"));
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
  $("runLabel").textContent = `${batchPrefix()}${t("batch.unloading", { model: label })}`;
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
    if (state.batch) finishBatch(t("batch.stopped"));
    return;
  }

  if (continueAfterUnload) {
    $("runLabel").textContent = `${batchPrefix()}${t("batch.unloadedNext")}`;
    await startNextBatchRun();
  } else {
    finishBatch(t("batch.done"));
  }
}

function finishBatch(label) {
  clearBatchDelay();
  const completed = state.batch ? state.batch.index : 0;
  const total = state.batch ? state.batch.models.length : 0;
  state.batch = null;
  $("startBtn").disabled = false;
  $("stopBtn").disabled = true;
  $("runLabel").textContent = total ? `${label} · ${completed}/${t("batch.models", { count: total })}` : label;
  renderLanguageSwitch();
}

async function stopRun() {
  if (state.batch) state.batch.stopRequested = true;
  clearBatchDelay();
  if (!state.activeRunId) {
    if (state.batch) finishBatch(t("batch.stopped"));
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
  $("abortCaseBtn").textContent = t("actions.aborting");
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
    $("abortCaseBtn").textContent = t("actions.abortTest");
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
    $("abortCaseBtn").textContent = t("actions.aborting");
    renderLive(false);
  }

  if (event.type === "case_finished") {
    state.activeResults.push(event.record);
    state.activeSummary = event.summary;
    state.currentOutput = event.record.output || state.currentOutput;
    $("abortCaseBtn").disabled = true;
    $("abortCaseBtn").textContent = t("actions.abortTest");
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
      finishBatch(state.batch?.stopRequested ? t("batch.stopped") : t("batch.done"));
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
  $("abortCaseBtn").textContent = t("actions.abortTest");
  $("phaseText").textContent = status;
  clearInterval(state.elapsedTimer);
  state.elapsedTimer = null;
  renderReasoningStatus();
  renderLive();
  renderLanguageSwitch();
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
  $("runLabel").textContent = t("run.none");
  $("streamOutput").textContent = "";
  $("resultsBody").innerHTML = "";
  $("categoryChart").innerHTML = "";
  $("abortCaseBtn").disabled = true;
  $("abortCaseBtn").textContent = t("actions.abortTest");
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
    ? `${state.currentCase.id} · ${categoryLabel(state.currentCase.category)} · ${t("current.points", { count: state.currentCase.auto_points })}`
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
    bereit: t("phase.ready"),
    start: t("phase.start"),
    model_load: t("phase.modelLoad"),
    prefill: t("phase.prefill"),
    generate: t("phase.generate"),
    unload: t("phase.unload"),
    stopping: t("phase.stopping"),
    case_aborting: t("phase.caseAborting"),
  };
  return labels[phase] || phase;
}

function lastMetric(key) {
  const last = state.activeResults.at(-1);
  return last?.metrics?.[key] || state.activeSummary?.performance?.[`avg_${key}`] || null;
}

function renderResults() {
  $("resultCount").textContent = t("ranking.tests", { count: state.activeResults.length });
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
    : `<p class="empty">${escapeHtml(t("empty.noScores"))}</p>`;
}

async function deleteRun(runId) {
  const run = state.runs.find((item) => item.id === runId);
  const label = run ? `${friendlyModelName(run)} (${run.id})` : runId;
  if (!confirm(t("delete.confirm", { label }))) return;
  await api(`/api/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
  state.runDetails.delete(runId);
  await loadRuns();
}

async function renderComparison({ updateFilters = true } = {}) {
  const renderId = ++state.comparisonRenderId;
  const visibleRuns = runsForCurrentLanguage();

  if (!visibleRuns.length) {
    if (updateFilters) renderComparisonFilters([]);
    $("comparison").innerHTML = `<p class="empty">${escapeHtml(t("empty.noRuns"))}</p>`;
    return;
  }

  $("comparison").innerHTML = `<p class="empty">${escapeHtml(t("empty.loadingRuns"))}</p>`;
  const loaded = await loadComparisonData(visibleRuns);
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
        <div><span>${escapeHtml(t("cards.failed"))}</span><strong>${failedCount(summary)}</strong></div>
        <div><span>TTFT</span><strong>${fmtSeconds(summary.performance?.avg_time_to_first_token_seconds)}</strong></div>
        <div><span>Prefill</span><strong>${fmtSeconds(summary.performance?.avg_prompt_processing_seconds)}</strong></div>
        <div><span>tok/s</span><strong>${fmtNumber(summary.performance?.avg_tokens_per_second)}</strong></div>
        <div><span>${escapeHtml(t("metrics.time"))}</span><strong>${fmtSeconds(summary.performance?.avg_total_seconds)}</strong></div>
      </div>
      <dl class="model-facts">
        <div><dt>${escapeHtml(t("cards.variant"))}</dt><dd>${escapeHtml(details.selected_variant || details.key || t("common.na"))}</dd></div>
        <div><dt>${escapeHtml(t("cards.architecture"))}</dt><dd>${escapeHtml(details.architecture || t("common.na"))}</dd></div>
        <div><dt>${escapeHtml(t("cards.context"))}</dt><dd>${escapeHtml(details.loaded_config?.context_length || details.max_context_length || t("common.na"))}</dd></div>
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
      <h3>${escapeHtml(t("category.heading"))}</h3>
      <div class="compare-bars">
        ${categories
          .map((category) => {
            const bars = loaded.map(({ summary }, index) => {
              const data = summary.categories?.[category];
              const percent = categoryFinalPercent(data);
              const autoPercent = categoryAutoPercent(data);
              return renderCompareBar(shortModelName(summary), percent, {
                color: modelColor(index),
                meta: data
                  ? t("category.meta", {
                      auto: fmtPercent(autoPercent),
                      passed: data.passed_cases || 0,
                      cases: data.cases || 0,
                      failed: data.failed_cases || 0,
                    })
                  : t("empty.notRun"),
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
      <h3>${escapeHtml(t("tests.heading"))}</h3>
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
        <span class="result-pill">${escapeHtml(t("empty.notRun"))}</span>
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
          <strong>${escapeHtml(t("task.heading"))}</strong>
          <small>${escapeHtml(testCase.id || "")}</small>
        </div>
        <span title="${escapeHtml(testCase.category || "")}">${escapeHtml(categoryLabel(testCase.category))}</span>
      </div>
      ${systemPrompt ? renderTaskBlock(t("task.system"), systemPrompt) : ""}
      ${input ? renderTaskBlock(t("task.user"), input) : `<p class="empty">${escapeHtml(t("task.unavailable"))}</p>`}
      <div class="expectation-grid ${manualRubric.length ? "" : "single"}">
        <div class="expectation-block">
          <strong>${escapeHtml(t("checks.auto"))}</strong>
          ${
            autoChecks.length
              ? autoChecks.map((check) => renderExpectedCheck(check)).join("")
              : `<p class="empty">${escapeHtml(t("checks.none"))}</p>`
          }
        </div>
        ${
          manualRubric.length
            ? `<div class="expectation-block">
                <strong>${escapeHtml(t("checks.legacyRubric"))}</strong>
                ${manualRubric
                  .map((rubric) => `<p>${escapeHtml(rubric.criterion || JSON.stringify(rubric))} <small>${escapeHtml(t("checks.points", { count: rubric.points ?? "" }))}</small></p>`)
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
      <small>${escapeHtml(check.type)} | ${escapeHtml(t("checks.points", { count: check.points ?? 1 }))}</small>
      <code>${escapeHtml(describeExpectedCheck(check))}</code>
    </p>
  `;
}

function describeExpectedCheck(check) {
  if (check.type === "json_exact") return JSON.stringify(check.expected || {});
  if (check.type === "json_fields") return JSON.stringify(check.expected || {});
  if (check.type === "json_valid") return t("checks.jsonValid");
  if (check.type === "must_contain") return t("checks.mustContain", { items: (check.items || []).join(", ") });
  if (check.type === "contains_any") return t("checks.containsAny", { items: (check.items || []).join(", ") });
  if (check.type === "must_not_contain") return t("checks.mustNotContain", { items: (check.items || []).join(", ") });
  if (check.type === "regex") return t("checks.regex", { patterns: (check.patterns || []).join(" | ") });
  if (check.type === "forbidden_regex") return t("checks.forbiddenRegex", { patterns: (check.patterns || []).join(" | ") });
  if (check.type === "word_count_at_most") return t("checks.maxWords", { count: check.max });
  if (check.type === "line_count_equals") return t("checks.lineCount", { count: check.count });
  if (check.type === "max_chars") return t("checks.maxChars", { count: check.max });
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
    return `<article class="result-detail" style="--model-color:${modelColor(index)}"><h4>${escapeHtml(shortModelName(summary))}</h4><p class="empty">${escapeHtml(t("empty.notExecuted"))}</p></article>`;
  }
  const failed = (record.score.checks || []).filter((check) => !check.passed);
  return `
    <article class="result-detail" style="--model-color:${modelColor(index)}">
      <h4>${escapeHtml(shortModelName(summary))}</h4>
      <div class="detail-metrics">
        <span class="${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
        <span>${fmtSeconds(record.metrics?.time_to_first_token_seconds)} TTFT</span>
        <span>${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
        <span>${fmtSeconds(record.metrics?.total_seconds)} ${escapeHtml(t("metrics.total"))}</span>
      </div>
      <p class="review-reason">${escapeHtml(record.score.reason || "")}</p>
      <div class="checks">
        ${
          failed.length
            ? failed.map((check) => `<p class="status-fail">${escapeHtml(check.label || check.type)}: ${escapeHtml(check.detail)}</p>`).join("")
            : `<p class="status-pass">${escapeHtml(t("checks.allPassed"))}</p>`
        }
      </div>
      <pre>${escapeHtml((record.output || "").slice(0, 1800))}</pre>
    </article>
  `;
}

function shortModelName(summary) {
  return friendlyModelName(summary);
}

async function loadComparisonData(runs = runsForCurrentLanguage()) {
  return Promise.all(
    runs.map(async (run) => {
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
        <span>${escapeHtml(t("filters.search"))}</span>
        <input id="compareSearch" value="${escapeHtml(filters.search)}" placeholder="${escapeHtml(t("filters.searchPlaceholder"))}" />
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.sort"))}</span>
        <select id="compareSort">
          ${selectOption("score_desc", t("sort.scoreDesc"), filters.sort)}
          ${selectOption("score_asc", t("sort.scoreAsc"), filters.sort)}
          ${selectOption("tps_desc", t("sort.tpsDesc"), filters.sort)}
          ${selectOption("tps_asc", t("sort.tpsAsc"), filters.sort)}
          ${selectOption("size_desc", t("sort.sizeDesc"), filters.sort)}
          ${selectOption("size_asc", t("sort.sizeAsc"), filters.sort)}
          ${selectOption("errors_asc", t("sort.errorsAsc"), filters.sort)}
          ${selectOption("name_asc", t("sort.nameAsc"), filters.sort)}
          ${selectOption("date_desc", t("sort.dateDesc"), filters.sort)}
        </select>
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.quantization"))}</span>
        <select id="compareQuantization">
          ${selectOption("all", t("common.all"), filters.quantization)}
          ${quantizations.map((value) => selectOption(value, value, filters.quantization)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.modelKind"))}</span>
        <select id="compareModelKind">
          ${selectOption("all", t("common.all"), filters.modelKind)}
          ${kinds.map((value) => selectOption(value, value, filters.modelKind)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.size"))}</span>
        <select id="compareSize">
          ${selectOption("all", t("common.all"), filters.size)}
          ${sizes.map((value) => selectOption(value, value, filters.size)).join("")}
        </select>
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.category"))}</span>
        <select id="compareCategory">
          ${selectOption("all", t("common.all"), filters.category)}
          ${orderedCategories(state.categories).map((category) => selectOption(category, categoryLabel(category), filters.category)).join("")}
        </select>
      </label>
      <label class="field compact-field wide-field">
        <span>${escapeHtml(t("filters.test"))}</span>
        <select id="compareTest">
          ${renderTestOptions(filters.category, filters.test)}
        </select>
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.scoreMin"))}</span>
        <input id="compareScoreMin" type="number" min="0" max="100" step="1" value="${escapeHtml(filters.scoreMin)}" placeholder="0" />
      </label>
      <label class="field compact-field">
        <span>${escapeHtml(t("filters.tpsMin"))}</span>
        <input id="compareTpsMin" type="number" min="0" step="1" value="${escapeHtml(filters.tpsMin)}" placeholder="0" />
      </label>
      <button id="compareResetBtn" class="ghost filter-reset" type="button">${escapeHtml(t("filters.reset"))}</button>
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
    const quantization = normalizedValue(details.quantization || inferQuantizationFromText(summary.model), t("common.unknown"));
    const format = normalizedValue(details.format || inferFormatFromText(summary.model), t("common.unknown"));
    const modelKind = inferModelKind(summary, paramInfo);
    const sizeKey = paramInfo.label || t("common.unknown");

    return {
      id: summary.run_id || summary.id || state.runs[index]?.id,
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
        .toLocaleLowerCase(locale()),
    };
  });
}

function renderComparisonSummary(rows, filteredRows) {
  const top = filteredRows[0];
  const avgScore = average(filteredRows.map((row) => rowEffectiveScore(row, state.compareFilters)).filter((value) => value !== null));
  const avgTps = average(filteredRows.map((row) => row.tps).filter((value) => value !== null));
  return `
    <section class="compare-overview">
      ${renderOverviewStat("Runs", filteredRows.length, t("overview.total", { count: rows.length }))}
      ${renderOverviewStat("Ø Score", fmtPercent(avgScore), t("overview.filtered"))}
      ${renderOverviewStat("Ø tok/s", fmtNumber(avgTps), t("overview.filtered"))}
      ${renderOverviewStat(t("overview.top"), top ? escapeHtml(top.displayName) : "--", top ? fmtPercent(rowEffectiveScore(top, state.compareFilters)) : t("overview.noMatch"))}
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
          <h3>${escapeHtml(t("ranking.overall"))}</h3>
        </div>
        <p class="empty">${escapeHtml(t("empty.noFilterRuns"))}</p>
      </section>
    `;
  }
  return `
    <section class="compare-block">
      <div class="compare-title-row">
        <h3>${escapeHtml(t("ranking.overall"))}</h3>
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
  const detailsLine = [row.format, row.quantization].filter((part) => part && !isUnknownValue(part)).join(" · ");
  const failed = failedCount(row.summary) + (row.summary.status_counts?.error || 0);
  return `
    <article class="rank-row" style="--model-color:${row.color}; --score-width:${Math.max(0, Math.min(100, Number(score || 0)))}%">
      <div class="rank-number">${index + 1}</div>
      <div class="rank-model">
        <strong>${escapeHtml(row.displayName)}</strong>
        <small>${escapeHtml(detailsLine || t("model.noMetadata"))}</small>
      </div>
      ${renderRankMetric("Score", fmtPercent(score), true)}
      ${renderRankMetric("tok/s", fmtNumber(row.tps))}
      ${renderRankMetric(t("filters.size"), row.sizeKey)}
      ${renderRankMetric(t("filters.modelKind"), row.modelKind)}
      <div class="rank-misses"><span>${failed}</span><small>${escapeHtml(t("ranking.misses"))}</small></div>
      <button class="delete-run compact-delete" type="button" data-run-id="${escapeHtml(row.id)}" title="${escapeHtml(t("actions.deleteRun"))}">×</button>
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
        <h3>${escapeHtml(t("ranking.category"))}</h3>
        <span>${escapeHtml(t("ranking.categoryCount", { count: categories.length }))}</span>
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
            : `<p class="empty">${escapeHtml(t("empty.noData"))}</p>`
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
        <h3>${escapeHtml(t("ranking.testComparison"))}</h3>
        <span>${escapeHtml(limited ? t("ranking.discriminatingTests", { count: tests.length }) : t("ranking.tests", { count: tests.length }))}</span>
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
        <small title="${escapeHtml(testCase.category || "")}">${escapeHtml(categoryLabel(testCase.category))} · ${escapeHtml(t("ranking.passFail", { passed, failed }))}</small>
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
        <span class="result-pill">${escapeHtml(t("empty.notRun"))}</span>
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
    return `<article class="result-detail" style="--model-color:${row.color}"><h4>${escapeHtml(row.displayName)}</h4><p class="empty">${escapeHtml(t("empty.notExecuted"))}</p></article>`;
  }
  const failed = (record.score.checks || []).filter((check) => !check.passed);
  return `
    <article class="result-detail" style="--model-color:${row.color}">
      <h4>${escapeHtml(row.displayName)}</h4>
      <div class="detail-metrics">
        <span class="${statusClass(record.score)}">${escapeHtml(statusLabel(record.score))}</span>
        <span>${fmtSeconds(record.metrics?.time_to_first_token_seconds)} TTFT</span>
        <span>${fmtNumber(record.metrics?.tokens_per_second)} tok/s</span>
        <span>${fmtSeconds(record.metrics?.total_seconds)} ${escapeHtml(t("metrics.total"))}</span>
      </div>
      <p class="review-reason">${escapeHtml(record.score.reason || "")}</p>
      <div class="checks">
        ${
          failed.length
            ? failed.map((check) => `<p class="status-fail">${escapeHtml(check.label || check.type)}: ${escapeHtml(check.detail)}</p>`).join("")
            : `<p class="status-pass">${escapeHtml(t("checks.allPassed"))}</p>`
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
  const search = filters.search.trim().toLocaleLowerCase(locale());
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
    if (filters.sort === "score_asc") return compareNullableAsc(rowEffectiveScore(left, filters), rowEffectiveScore(right, filters)) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "tps_desc") return compareNumbers(right.tps, left.tps) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "tps_asc") return compareNumbers(left.tps, right.tps) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "size_desc") return compareNumbers(right.totalParamsB, left.totalParamsB) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "size_asc") return compareNumbers(left.totalParamsB, right.totalParamsB) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "errors_asc") return compareNumbers(failedCount(left.summary), failedCount(right.summary)) || left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "name_asc") return left.displayName.localeCompare(right.displayName, locale());
    if (filters.sort === "date_desc") return String(right.summary.created_at || "").localeCompare(String(left.summary.created_at || ""));
    return compareNullableDesc(rowEffectiveScore(left, filters), rowEffectiveScore(right, filters)) || compareNumbers(right.tps, left.tps) || left.displayName.localeCompare(right.displayName, locale());
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
    selectOption("all", t("common.all"), selectedTest),
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
    return t("scope.test", { id: testCase ? testCase.id : filters.test });
  }
  if (filters.category !== "all") return t("scope.category", { category: categoryLabel(filters.category) });
  return t("scope.total");
}

function modelNameWithQuantization(row) {
  const quantization = row.quantization && !isUnknownValue(row.quantization) ? row.quantization : "";
  return [row.displayName, quantization].filter(Boolean).join(" ");
}

function friendlyModelName(summary) {
  const details = summary.model_details || {};
  const raw = details.display_name || details.key || summary.model || t("model.kindUnknown");
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
  const text = [details.architecture, details.params, details.display_name, details.key, details.selected_variant, summary.model].filter(Boolean).join(" ").toLocaleLowerCase(locale());
  if (paramInfo.activeB || /\bmoe\b|mixture|mixtral|a\d+(?:\.\d+)?b/.test(text)) return "MoE";
  if (paramInfo.totalB || text) return t("model.kindDense");
  return t("model.kindUnknown");
}

function inferQuantizationFromText(value) {
  const match = String(value || "").match(/(?:@|[-_.])((?:i?q|q)\d(?:_[a-z0-9]+){0,3}|f16|bf16|fp16|fp32)(?:$|[-_.])/i);
  return match ? match[1].toUpperCase() : null;
}

function inferFormatFromText(value) {
  const lower = String(value || "").toLocaleLowerCase(locale());
  if (lower.includes("gguf")) return "gguf";
  if (lower.includes("mlx")) return "mlx";
  if (lower.includes("safetensors")) return "safetensors";
  return null;
}

function normalizedValue(value, fallback) {
  return value ? String(value) : fallback;
}

function isUnknownValue(value) {
  const normalized = String(value || "").toLocaleLowerCase(locale());
  return normalized === "unbekannt" || normalized === "unknown";
}

function selectOption(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function uniqueSorted(values, compare = undefined) {
  return [...new Set(values)].sort(compare || ((left, right) => String(left).localeCompare(String(right), locale())));
}

function compareSizeKeys(left, right) {
  const leftNumber = Number(String(left).match(/\d+(?:\.\d+)?/)?.[0] || -1);
  const rightNumber = Number(String(right).match(/\d+(?:\.\d+)?/)?.[0] || -1);
  return rightNumber - leftNumber || String(left).localeCompare(String(right), locale());
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
  $("abortCaseBtn").textContent = t("actions.abortTest");
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
document.querySelectorAll(".language-option").forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

translateStaticUi();
refreshAll();
resetLive();
startModelStatusPolling();
