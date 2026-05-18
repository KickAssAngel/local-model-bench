import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ENGLISH_SYSTEM, GERMAN_SUITE_SHA256, translateCase } from "./english_suite_transform.mjs";
import { validateCases } from "../eval_lib.mjs";

const DE_PATH = "testfaelle/praxis_de.json";
const EN_PATH = "testfaelle/praxis_en.json";

const deRaw = await readFile(DE_PATH, "utf8");
const enRaw = await readFile(EN_PATH, "utf8");
const deHash = createHash("sha256").update(deRaw).digest("hex");
if (deHash !== GERMAN_SUITE_SHA256) {
  throw new Error(`${DE_PATH} changed. Expected frozen SHA256 ${GERMAN_SUITE_SHA256}, got ${deHash}.`);
}

const deCases = JSON.parse(deRaw);
const enCases = JSON.parse(enRaw);
const errors = [
  ...validateCases(deCases).map((error) => `de: ${error}`),
  ...validateCases(enCases).map((error) => `en: ${error}`),
];

if (deCases.length !== enCases.length) errors.push(`case count mismatch: de=${deCases.length}, en=${enCases.length}`);
if (deCases.length !== 200) errors.push(`expected 200 German cases, got ${deCases.length}`);
if (enCases.length !== 200) errors.push(`expected 200 English cases, got ${enCases.length}`);

for (let index = 0; index < Math.min(deCases.length, enCases.length); index += 1) {
  const deCase = deCases[index];
  const enCase = enCases[index];
  const expectedEnCase = translateCase(deCase);
  const label = deCase.id || `index ${index}`;
  for (const field of ["id", "category"]) {
    if (enCase[field] !== deCase[field]) errors.push(`${label}: ${field} mismatch`);
  }
  if ((enCase.difficulty || null) !== (deCase.difficulty || null)) errors.push(`${label}: difficulty mismatch`);
  if (JSON.stringify(enCase.tags || []) !== JSON.stringify(deCase.tags || [])) errors.push(`${label}: tags changed`);
  if (!enCase.title) errors.push(`${label}: missing explicit English title`);
  const deChecks = deCase.scoring?.auto || [];
  const enChecks = enCase.scoring?.auto || [];
  if (enChecks.length !== deChecks.length) errors.push(`${label}: auto check count mismatch`);
  for (let checkIndex = 0; checkIndex < Math.min(deChecks.length, enChecks.length); checkIndex += 1) {
    const deCheck = deChecks[checkIndex];
    const enCheck = enChecks[checkIndex];
    const expectedCheck = expectedEnCase.scoring.auto[checkIndex];
    if (enCheck.type !== deCheck.type) errors.push(`${label}: check ${checkIndex} type mismatch`);
    if (Number(enCheck.points || 1) !== Number(deCheck.points || 1)) errors.push(`${label}: check ${checkIndex} points mismatch`);
    if (JSON.stringify(enCheck.expected) !== JSON.stringify(expectedCheck.expected)) {
      errors.push(`${label}: English expected JSON drifted from transform`);
    }
  }
  if (deCase.scoring?.manual_rubric?.length || enCase.scoring?.manual_rubric?.length) {
    errors.push(`${label}: manual rubric is not allowed in paired suites`);
  }
  if (deCase.messages) {
    if (!Array.isArray(enCase.messages)) {
      errors.push(`${label}: English messages missing`);
    } else {
      if (enCase.messages.length !== deCase.messages.length) errors.push(`${label}: message count mismatch`);
      for (let messageIndex = 0; messageIndex < Math.min(deCase.messages.length, enCase.messages.length); messageIndex += 1) {
        if (enCase.messages[messageIndex].role !== deCase.messages[messageIndex].role) {
          errors.push(`${label}: message ${messageIndex} role mismatch`);
        }
        if (!enCase.messages[messageIndex].content) errors.push(`${label}: message ${messageIndex} content missing`);
      }
      const systemMessage = enCase.messages.find((message) => message.role === "system");
      if (systemMessage?.content !== ENGLISH_SYSTEM) errors.push(`${label}: English system message must use the English JSON parser instruction`);
    }
  } else {
    if (enCase.system !== ENGLISH_SYSTEM) errors.push(`${label}: English system prompt must use the English JSON parser instruction`);
    if (!enCase.prompt) errors.push(`${label}: missing explicit English prompt`);
  }
}

const categories = new Map();
for (const testCase of enCases) categories.set(testCase.category, (categories.get(testCase.category) || 0) + 1);
if (categories.size !== 10) errors.push(`expected 10 English categories, got ${categories.size}`);
for (const [category, count] of categories) {
  if (count !== 20) errors.push(`English category ${category} has ${count} cases, expected 20`);
}

const manualRubricCases = enCases.filter((testCase) => testCase.scoring?.manual_rubric?.length);
if (manualRubricCases.length) errors.push(`English suite contains manual rubrics: ${manualRubricCases.map((item) => item.id).join(", ")}`);

if (errors.length) throw new Error(errors.join("\n"));

console.log(JSON.stringify({ ok: true, deHash, cases: enCases.length, categories: Object.fromEntries([...categories].sort()) }, null, 2));
