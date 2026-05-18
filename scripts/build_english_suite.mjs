import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { translateCase } from "./english_suite_transform.mjs";

const INPUT = new URL("../testfaelle/praxis_de.json", import.meta.url);
const OUTPUT = new URL("../testfaelle/praxis_en.json", import.meta.url);

const germanCases = JSON.parse(await readFile(INPUT, "utf8"));
const existingEnglishCases = existsSync(OUTPUT)
  ? new Map(JSON.parse(await readFile(OUTPUT, "utf8")).map((testCase) => [testCase.id, testCase]))
  : new Map();

const englishCases = germanCases.map((germanCase) => {
  const generated = translateCase(germanCase);
  const explicit = existingEnglishCases.get(germanCase.id);
  if (!explicit) return generated;
  return {
    ...generated,
    title: explicit.title || generated.title,
    ...(explicit.messages
      ? { messages: explicit.messages }
      : {
          system: explicit.system || generated.system,
          prompt: explicit.prompt || generated.prompt,
        }),
  };
});

await mkdir(new URL("../testfaelle/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(englishCases, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: "testfaelle/praxis_en.json",
      cases: englishCases.length,
      explicit_text_cases: englishCases.filter((testCase) => existingEnglishCases.has(testCase.id)).length,
    },
    null,
    2,
  ),
);
