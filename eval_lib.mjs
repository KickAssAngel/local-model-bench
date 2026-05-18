import { readFile, writeFile } from "node:fs/promises";

export const KNOWN_CHECKS = new Set([
  "contains_any",
  "json_exact",
  "forbidden_regex",
  "json_fields",
  "json_valid",
  "line_count_equals",
  "max_chars",
  "must_contain",
  "must_not_contain",
  "regex",
  "word_count_at_most",
]);

export async function loadCases(filePath) {
  const raw = await readFile(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error(`${filePath}: expected a JSON array`);
    return data.map((item, index) => ({ ...item, _source: `${filePath}:${index + 1}` }));
  }
  return raw
    .split(/\r?\n/)
    .map((line, index) => [line.trim(), index + 1])
    .filter(([line]) => line && !line.startsWith("#"))
    .map(([line, lineNo]) => ({ ...JSON.parse(line), _source: `${filePath}:${lineNo}` }));
}

export function validateCases(cases) {
  const errors = [];
  const seen = new Set();
  for (const testCase of cases) {
    const source = testCase._source || "<unknown>";
    if (!testCase.id) errors.push(`${source}: missing id`);
    else if (seen.has(testCase.id)) errors.push(`${source}: duplicate id ${testCase.id}`);
    else seen.add(testCase.id);

    if (testCase.messages !== undefined) {
      if (!Array.isArray(testCase.messages) || testCase.messages.length === 0) {
        errors.push(`${source}: messages must be a non-empty list`);
      } else {
        testCase.messages.forEach((message, index) => {
          if (!["system", "user", "assistant"].includes(message.role)) {
            errors.push(`${source}: messages[${index}].role is invalid`);
          }
          if (typeof message.content !== "string" || message.content.length === 0) {
            errors.push(`${source}: messages[${index}].content must be a non-empty string`);
          }
        });
      }
    } else if (typeof testCase.prompt !== "string" || testCase.prompt.length === 0) {
      errors.push(`${source}: either messages or prompt must be provided`);
    }

    for (const check of testCase.scoring?.auto || []) {
      if (!KNOWN_CHECKS.has(check.type)) errors.push(`${source}: unknown check type ${check.type}`);
    }
  }
  return errors;
}

export function caseMessages(testCase) {
  if (testCase.messages) return testCase.messages;
  const system =
    testCase.system ||
    "Du bist ein pr\u00e4ziser Assistent. Befolge die Aufgabe exakt und erfinde keine Fakten.";
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: testCase.prompt });
  return messages;
}

export function caseNativePayload(testCase) {
  const messages = caseMessages(testCase);
  const systemPrompt = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const nonSystem = messages.filter((message) => message.role !== "system");
  if (nonSystem.length === 1 && nonSystem[0].role === "user") {
    return { system_prompt: systemPrompt, input: nonSystem[0].content };
  }
  const englishLabels = /\bYou are a precision parser\b/.test(systemPrompt);
  const input = nonSystem
    .map((message) => {
      const label = message.role === "assistant" ? (englishLabels ? "Assistant" : "Assistent") : englishLabels ? "User" : "Nutzer";
      return `${label}: ${message.content}`;
    })
    .join("\n\n");
  return { system_prompt: systemPrompt, input };
}

export function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export function extractBalancedJson(text) {
  const cleaned = stripCodeFence(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with balanced extraction.
  }

  for (const [opener, closer] of [
    ["{", "}"],
    ["[", "]"],
  ]) {
    let start = cleaned.indexOf(opener);
    while (start !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let index = start; index < cleaned.length; index += 1) {
        const char = cleaned[index];
        if (inString) {
          if (escape) escape = false;
          else if (char === "\\") escape = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === opener) depth += 1;
        else if (char === closer) {
          depth -= 1;
          if (depth === 0) {
            const candidate = cleaned.slice(start, index + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              break;
            }
          }
        }
      }
      start = cleaned.indexOf(opener, start + 1);
    }
  }
  throw new Error("No valid JSON object or array found in model output.");
}

export function parseStrictJsonOnly(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Empty output; expected only JSON.");
  if (trimmed.startsWith("```")) throw new Error("Markdown code fences are not allowed; expected raw JSON only.");
  return JSON.parse(trimmed);
}

export function jsonExactMismatches(actual, expected, path = "$") {
  const actualType = jsonType(actual);
  const expectedType = jsonType(expected);
  if (actualType !== expectedType) {
    return [`${path}: expected ${expectedType}, got ${actualType}`];
  }

  if (expectedType === "array") {
    const mismatches = [];
    if (actual.length !== expected.length) {
      mismatches.push(`${path}: expected ${expected.length} item(s), got ${actual.length}`);
    }
    const count = Math.min(actual.length, expected.length);
    for (let index = 0; index < count; index += 1) {
      mismatches.push(...jsonExactMismatches(actual[index], expected[index], `${path}[${index}]`));
    }
    return mismatches;
  }

  if (expectedType === "object") {
    const mismatches = [];
    const actualKeys = Object.keys(actual).sort((a, b) => a.localeCompare(b));
    const expectedKeys = Object.keys(expected).sort((a, b) => a.localeCompare(b));
    for (const key of expectedKeys) {
      if (!Object.hasOwn(actual, key)) mismatches.push(`${path}.${key}: missing`);
    }
    for (const key of actualKeys) {
      if (!Object.hasOwn(expected, key)) mismatches.push(`${path}.${key}: unexpected`);
    }
    for (const key of expectedKeys) {
      if (Object.hasOwn(actual, key)) mismatches.push(...jsonExactMismatches(actual[key], expected[key], `${path}.${key}`));
    }
    return mismatches;
  }

  return Object.is(actual, expected) ? [] : [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}

function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function getPath(value, dottedPath) {
  let current = value;
  for (const part of dottedPath.split(".")) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) throw new Error(`${dottedPath}: missing`);
      current = current[index];
    } else if (current && typeof current === "object" && Object.hasOwn(current, part)) {
      current = current[part];
    } else {
      throw new Error(`${dottedPath}: missing`);
    }
  }
  return current;
}

export function normalizeScalar(value) {
  if (typeof value === "string") {
    const stripped = value.trim();
    if (/^-?\d+(?:[.,]\d+)?$/.test(stripped)) return Number.parseFloat(stripped.replace(",", "."));
    return stripped.toLocaleLowerCase("de-DE");
  }
  return value;
}

export function scalarsEqual(actual, expected) {
  const left = normalizeScalar(actual);
  const right = normalizeScalar(expected);
  if (typeof left === "number" && typeof right === "number") return Math.abs(left - right) < 1e-9;
  return left === right;
}

export function textContains(text, needle, caseSensitive = false) {
  if (caseSensitive) return text.includes(needle);
  return text.toLocaleLowerCase("de-DE").includes(String(needle).toLocaleLowerCase("de-DE"));
}

export function scoreCheck(check, output) {
  if (check.type === "json_exact") {
    const parsed = parseStrictJsonOnly(output);
    const mismatches = jsonExactMismatches(parsed, check.expected);
    return mismatches.length === 0 ? [true, "exact JSON matched"] : [false, mismatches.join("; ")];
  }

  if (check.type === "json_valid") {
    extractBalancedJson(output);
    return [true, "valid JSON found"];
  }

  if (check.type === "json_fields") {
    const parsed = extractBalancedJson(output);
    const mismatches = [];
    for (const [fieldPath, expected] of Object.entries(check.expected || {})) {
      let actual;
      try {
        actual = getPath(parsed, fieldPath);
      } catch {
        mismatches.push(`${fieldPath}: missing`);
        continue;
      }
      if (!scalarsEqual(actual, expected)) {
        mismatches.push(`${fieldPath}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }
    return mismatches.length === 0
      ? [true, `${Object.keys(check.expected || {}).length} field(s) matched`]
      : [false, mismatches.join("; ")];
  }

  if (check.type === "must_contain") {
    const missing = (check.items || []).filter((item) => !textContains(output, item, check.case_sensitive));
    return missing.length === 0 ? [true, `all ${(check.items || []).length} item(s) found`] : [false, `missing: ${JSON.stringify(missing)}`];
  }

  if (check.type === "contains_any") {
    const found = (check.items || []).some((item) => textContains(output, item, check.case_sensitive));
    return found ? [true, "one allowed item found"] : [false, `none found: ${JSON.stringify(check.items || [])}`];
  }

  if (check.type === "must_not_contain") {
    const present = (check.items || []).filter((item) => textContains(output, item, check.case_sensitive));
    return present.length === 0
      ? [true, `none of ${(check.items || []).length} forbidden item(s) found`]
      : [false, `forbidden text present: ${JSON.stringify(present)}`];
  }

  if (check.type === "regex") {
    const missing = (check.patterns || []).filter((pattern) => !new RegExp(pattern, "is").test(output));
    return missing.length === 0 ? [true, `all ${(check.patterns || []).length} regex pattern(s) matched`] : [false, `missing regex match: ${JSON.stringify(missing)}`];
  }

  if (check.type === "forbidden_regex") {
    const present = (check.patterns || []).filter((pattern) => new RegExp(pattern, "is").test(output));
    return present.length === 0
      ? [true, `none of ${(check.patterns || []).length} forbidden regex pattern(s) matched`]
      : [false, `forbidden regex matched: ${JSON.stringify(present)}`];
  }

  if (check.type === "word_count_at_most") {
    const count = [...output.matchAll(/\b[\p{L}\p{N}_-]+\b/gu)].length;
    const limit = Number(check.max);
    return count <= limit ? [true, `${count} words <= ${limit}`] : [false, `${count} words > ${limit}`];
  }

  if (check.type === "line_count_equals") {
    const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const expected = Number(check.count);
    return lines.length === expected ? [true, `${lines.length} non-empty lines`] : [false, `${lines.length} non-empty lines, expected ${expected}`];
  }

  if (check.type === "max_chars") {
    const limit = Number(check.max);
    return output.length <= limit ? [true, `${output.length} chars <= ${limit}`] : [false, `${output.length} chars > ${limit}`];
  }

  throw new Error(`Unsupported check type: ${check.type}`);
}

export function scoreOutput(testCase, output) {
  const checks = testCase.scoring?.auto || [];
  const results = [];
  let autoEarned = 0;
  let autoPossible = 0;
  for (const check of checks) {
    const maxPoints = Number(check.points || 1);
    autoPossible += maxPoints;
    let passed = false;
    let detail = "";
    try {
      [passed, detail] = scoreCheck(check, output);
    } catch (error) {
      detail = `${error.name}: ${error.message}`;
    }
    if (passed) autoEarned += maxPoints;
    results.push({
      type: check.type,
      label: check.label || "",
      passed,
      points: passed ? maxPoints : 0,
      max_points: maxPoints,
      detail,
    });
  }
  return normalizeScore({
    auto_earned: autoEarned,
    auto_possible: autoPossible,
    auto_percent: percent(autoEarned, autoPossible),
    checks: results,
    manual_rubric: testCase.scoring?.manual_rubric || [],
  });
}

export function failedScore(testCase, message, options = {}) {
  const autoPossible = (testCase.scoring?.auto || []).reduce((sum, check) => sum + Number(check.points || 1), 0);
  const status = options.status || "error";
  return normalizeScore({
    auto_earned: 0,
    auto_possible: autoPossible,
    auto_percent: autoPossible ? 0 : null,
    checks: [{ type: "request", passed: false, points: 0, max_points: 0, detail: message }],
    manual_rubric: testCase.scoring?.manual_rubric || [],
    status,
    confidence: options.confidence || (status === "auto_failed" ? "high" : "low"),
    needs_review: options.needsReview ?? false,
    reason: message,
  });
}

export function normalizeScore(score = {}) {
  const autoEarned = numberOr(score.auto_earned, score.earned, 0);
  const autoPossible = numberOr(score.auto_possible, score.possible, 0);
  const autoPercent = score.auto_percent ?? score.raw_percent ?? percent(autoEarned, autoPossible);
  const review = normalizeReview(score.review, score);
  const assessment = assessScore({
    autoPercent,
    autoPossible,
    checks: score.checks || [],
    manualRubric: score.manual_rubric || [],
    status: score.status,
    confidence: score.confidence,
    needsReview: score.needs_review,
    reason: score.reason,
  });
  const reviewApplied = Boolean(review);
  const finalPossible = reviewApplied ? autoPossible || 100 : autoPossible;
  const finalPercent = reviewApplied ? review.percent : autoPercent;
  const finalEarned =
    finalPercent === null || finalPercent === undefined ? autoEarned : round((finalPossible * Number(finalPercent)) / 100, 3);
  const status = reviewApplied ? "reviewed" : assessment.status;
  const confidence = reviewApplied ? "reviewed" : assessment.confidence;
  const needsReview = reviewApplied ? false : assessment.needs_review;
  const reason = reviewApplied ? review.note || "Human review applied." : assessment.reason;

  return {
    ...score,
    auto_earned: autoEarned,
    auto_possible: autoPossible,
    auto_percent: autoPercent,
    final_earned: finalEarned,
    final_possible: finalPossible,
    final_percent: finalPercent,
    earned: finalEarned,
    possible: finalPossible,
    percent: finalPercent,
    checks: score.checks || [],
    manual_rubric: score.manual_rubric || [],
    review,
    reviewed: reviewApplied,
    review_percent: review?.percent ?? null,
    review_note: review?.note ?? "",
    status,
    confidence,
    needs_review: needsReview,
    reason,
  };
}

export function applyReview(record, review) {
  const reviewPercent = clampPercent(review?.review_percent ?? review?.percent);
  const normalized = normalizeScore(record.score);
  return {
    ...record,
    score: normalizeScore({
      ...normalized,
      review: {
        percent: reviewPercent,
        note: String(review?.note ?? review?.review_note ?? "").trim(),
        reviewed_at: review?.reviewed_at || new Date().toISOString(),
      },
    }),
  };
}

export function clearReview(record) {
  const normalized = normalizeScore(record.score);
  const {
    review,
    review_percent: reviewPercent,
    review_note: reviewNote,
    reviewed,
    status,
    confidence,
    needs_review: needsReview,
    reason,
    ...withoutReview
  } = normalized;
  return {
    ...record,
    score: normalizeScore({
      ...withoutReview,
      review: null,
      review_percent: null,
      review_note: "",
      reviewed: false,
    }),
  };
}

export function normalizeResultRecord(record) {
  return { ...record, score: normalizeScore(record.score || {}) };
}

function assessScore({ autoPercent, autoPossible, checks, manualRubric, status, confidence, needsReview, reason }) {
  if (status && confidence && needsReview !== undefined) {
    return { status, confidence, needs_review: Boolean(needsReview), reason: reason || "" };
  }
  if (status === "error") {
    return { status: "error", confidence: "low", needs_review: true, reason: reason || "The request failed." };
  }
  if (manualRubric.length) {
    return {
      status: "needs_review",
      confidence: "low",
      needs_review: true,
      reason: "Manual rubric configured.",
    };
  }
  if (!autoPossible) {
    return {
      status: "needs_review",
      confidence: "low",
      needs_review: true,
      reason: "No automatic checks configured.",
    };
  }
  if (Number(autoPercent) >= 100) {
    return {
      status: "auto_passed",
      confidence: "high",
      needs_review: false,
      reason: "All automatic checks passed.",
    };
  }
  const failed = checks.filter((check) => !check.passed).length;
  return {
    status: "auto_failed",
    confidence: "high",
    needs_review: false,
    reason: `${failed} automatic check(s) failed.`,
  };
}

function normalizeReview(review, score) {
  const rawPercent = review?.percent ?? score.review_percent;
  if (rawPercent === null || rawPercent === undefined || rawPercent === "") return null;
  return {
    percent: clampPercent(rawPercent),
    note: String(review?.note ?? score.review_note ?? "").trim(),
    reviewed_at: review?.reviewed_at || score.reviewed_at || null,
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Review score must be a number between 0 and 100.");
  return Math.max(0, Math.min(100, round(number, 2)));
}

function numberOr(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

export function estimateTokens(text) {
  if (!text) return 0;
  const words = [...String(text).matchAll(/\b[\p{L}\p{N}_-]+\b/gu)].length;
  const punctuation = [...String(text).matchAll(/[^\s\p{L}\p{N}_-]/gu)].length;
  return Math.max(1, Math.round(words * 1.25 + punctuation * 0.35));
}

export function slugify(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "model";
}

export function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function summarize(results, runId, model, args = {}) {
  const suiteLanguage = args.suiteLanguage || args.suite_language || "de";
  const categories = {};
  let autoEarned = 0;
  let autoPossible = 0;
  let finalEarned = 0;
  let finalPossible = 0;
  let manualCaseCount = 0;
  let reviewedCaseCount = 0;
  let needsReviewCount = 0;
  const statusCounts = {};
  const metrics = {
    cases_with_metrics: 0,
    total_seconds: 0,
    ttft_seconds: 0,
    prompt_processing_seconds: 0,
    input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    tokens_per_second: 0,
  };

  for (const rawItem of results) {
    const item = normalizeResultRecord(rawItem);
    const category = item.category;
    categories[category] ||= {
      cases: 0,
      earned: 0,
      possible: 0,
      auto_earned: 0,
      auto_possible: 0,
      final_earned: 0,
      final_possible: 0,
      reviewed_cases: 0,
      needs_review_cases: 0,
      passed_cases: 0,
      failed_cases: 0,
      error_cases: 0,
    };
    const autoScoreEarned = Number(item.score.auto_earned || 0);
    const autoScorePossible = Number(item.score.auto_possible || 0);
    const finalScoreEarned = Number(item.score.final_earned ?? item.score.earned ?? 0);
    const finalScorePossible = Number(item.score.final_possible ?? item.score.possible ?? 0);
    categories[category].cases += 1;
    categories[category].auto_earned += autoScoreEarned;
    categories[category].auto_possible += autoScorePossible;
    categories[category].final_earned += finalScoreEarned;
    categories[category].final_possible += finalScorePossible;
    categories[category].earned += finalScoreEarned;
    categories[category].possible += finalScorePossible;
    if (item.score.reviewed) categories[category].reviewed_cases += 1;
    if (item.score.needs_review) categories[category].needs_review_cases += 1;
    if (item.score.status === "auto_passed" || item.score.status === "reviewed") categories[category].passed_cases += 1;
    if (item.score.status === "auto_failed") categories[category].failed_cases += 1;
    if (item.score.status === "error") categories[category].error_cases += 1;
    autoEarned += autoScoreEarned;
    autoPossible += autoScorePossible;
    finalEarned += finalScoreEarned;
    finalPossible += finalScorePossible;
    if (item.score.manual_rubric?.length) manualCaseCount += 1;
    if (item.score.reviewed) reviewedCaseCount += 1;
    if (item.score.needs_review) needsReviewCount += 1;
    statusCounts[item.score.status || "unknown"] = (statusCounts[item.score.status || "unknown"] || 0) + 1;

    if (item.metrics) {
      metrics.cases_with_metrics += 1;
      metrics.total_seconds += Number(item.metrics.total_seconds || item.latency_seconds || 0);
      metrics.ttft_seconds += Number(item.metrics.time_to_first_token_seconds || 0);
      metrics.prompt_processing_seconds += Number(item.metrics.prompt_processing_seconds || 0);
      metrics.input_tokens += Number(item.metrics.input_tokens || 0);
      metrics.output_tokens += Number(item.metrics.output_tokens || item.metrics.total_output_tokens || 0);
      metrics.reasoning_output_tokens += Number(item.metrics.reasoning_output_tokens || 0);
      metrics.tokens_per_second += Number(item.metrics.tokens_per_second || 0);
    }
  }

  const count = metrics.cases_with_metrics || 1;
  const categoryEntries = Object.entries(categories);
  const balancedAutoPercent = balancedPercent(categoryEntries.map(([, data]) => percent(data.auto_earned, data.auto_possible)));
  const balancedFinalPercent = balancedPercent(categoryEntries.map(([, data]) => percent(data.final_earned, data.final_possible)));
  return {
    run_id: runId,
    created_at: args.createdAt || args.created_at || new Date().toISOString(),
    updated_at: args.updatedAt || args.updated_at || null,
    model,
    base_url: args.baseUrl,
    suite_language: suiteLanguage,
    suite_id: args.suiteId || args.suite_id || `praxis_${suiteLanguage}`,
    suite_file: args.suiteFile || args.suite_file || null,
    case_count: results.length,
    auto_earned: autoEarned,
    auto_possible: autoPossible,
    auto_percent: autoPossible ? Math.round((autoEarned / autoPossible) * 10000) / 100 : null,
    final_earned: finalEarned,
    final_possible: finalPossible,
    final_percent: finalPossible ? Math.round((finalEarned / finalPossible) * 10000) / 100 : null,
    balanced_auto_percent: balancedAutoPercent,
    balanced_final_percent: balancedFinalPercent,
    manual_case_count: manualCaseCount,
    reviewed_case_count: reviewedCaseCount,
    needs_review_count: needsReviewCount,
    status_counts: statusCounts,
    categories: Object.fromEntries(categoryEntries),
    model_details: args.modelDetails || args.model_details || null,
    performance: {
      avg_total_seconds: round(metrics.total_seconds / count),
      avg_time_to_first_token_seconds: round(metrics.ttft_seconds / count),
      avg_prompt_processing_seconds: round(metrics.prompt_processing_seconds / count),
      avg_tokens_per_second: round(metrics.tokens_per_second / count),
      total_input_tokens: metrics.input_tokens,
      total_output_tokens: metrics.output_tokens,
      total_reasoning_output_tokens: metrics.reasoning_output_tokens,
    },
    defaults: {
      temperature: args.temperature,
      top_p: args.topP,
      max_tokens: args.maxTokens,
      reasoning: args.reasoning,
      reasoning_supported_options: args.reasoning_supported_options,
      reasoning_default: args.reasoning_default,
      seed: args.seed,
    },
  };
}

export function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function percent(earned, possible) {
  return possible ? Math.round((earned / possible) * 10000) / 100 : null;
}

export function balancedPercent(values) {
  const numeric = values.filter((value) => value !== null && value !== undefined && !Number.isNaN(Number(value)));
  if (!numeric.length) return null;
  return Math.round((numeric.reduce((sum, value) => sum + Number(value), 0) / numeric.length) * 100) / 100;
}

export function buildReport(results, summary) {
  const lines = [];
  lines.push(`# LM Studio Eval Report: ${summary.model}`);
  lines.push("");
  lines.push(`- Run: ${summary.run_id}`);
  lines.push(`- Cases: ${summary.case_count}`);
  lines.push(`- Balanced score: ${summary.balanced_final_percent ?? summary.balanced_auto_percent ?? "n/a"}%`);
  lines.push(`- Raw score: ${summary.final_earned?.toFixed?.(1) ?? "n/a"} / ${summary.final_possible?.toFixed?.(1) ?? "n/a"} (${summary.final_percent ?? "n/a"}%)`);
  lines.push(`- Auto score: ${summary.auto_earned.toFixed(1)} / ${summary.auto_possible.toFixed(1)} (${summary.auto_percent}%)`);
  lines.push(`- Failed: ${summary.status_counts?.auto_failed ?? 0}`);
  lines.push(`- Errors: ${summary.status_counts?.error ?? 0}`);
  lines.push(`- Avg total: ${summary.performance?.avg_total_seconds ?? "n/a"}s`);
  lines.push(`- Avg TTFT: ${summary.performance?.avg_time_to_first_token_seconds ?? "n/a"}s`);
  lines.push(`- Avg tok/s: ${summary.performance?.avg_tokens_per_second ?? "n/a"}`);
  lines.push(`- Manual rubric cases: ${summary.manual_case_count}`);
  lines.push("");
  lines.push("## Category Scores");
  lines.push("");
  lines.push("| Category | Cases | Score | Passed | Failed | Errors |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const [category, data] of Object.entries(summary.categories)) {
    const finalScore = data.final_possible === 0 ? "n/a" : `${Math.round((data.final_earned / data.final_possible) * 10000) / 100}%`;
    lines.push(`| ${category} | ${data.cases} | ${finalScore} | ${data.passed_cases ?? 0} | ${data.failed_cases ?? 0} | ${data.error_cases ?? 0} |`);
  }
  lines.push("");
  lines.push("## Failed Cases");
  lines.push("");
  const normalizedResults = results.map((item) => normalizeResultRecord(item));
  const misses = normalizedResults.filter((item) => item.score.status === "auto_failed" || item.score.status === "error");
  if (misses.length === 0) {
    lines.push("No failed cases.");
  } else {
    for (const item of misses) {
      lines.push(`### ${item.id} - ${item.title}`);
      lines.push(`Final score: ${item.score.final_earned.toFixed(1)} / ${item.score.final_possible.toFixed(1)} (${item.score.final_percent ?? "n/a"}%)`);
      lines.push(`Auto score: ${item.score.auto_earned.toFixed(1)} / ${item.score.auto_possible.toFixed(1)} (${item.score.auto_percent ?? "n/a"}%)`);
      lines.push(`Status: ${item.score.status}; confidence: ${item.score.confidence}; reason: ${item.score.reason}`);
      for (const check of item.score.checks.filter((entry) => !entry.passed)) {
        const label = check.label ? ` (${check.label})` : "";
        lines.push(`- ${check.type}${label}: ${check.detail}`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function writeRunFiles(runDir, results, summary) {
  const normalizedResults = results.map((item) => normalizeResultRecord(item));
  await writeFile(`${runDir}/results.jsonl`, `${normalizedResults.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
  await writeFile(`${runDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(`${runDir}/report.md`, buildReport(normalizedResults, summary), "utf8");
}
