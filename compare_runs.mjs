#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = { runs: [], out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out") {
      index += 1;
      if (index >= argv.length) throw new Error("Missing value after --out");
      args.out = argv[index];
    } else if (item === "--help" || item === "-h") {
      console.log("Usage: node compare_runs.mjs <run-dir|summary.json> ... [--out vergleich.md]");
      process.exit(0);
    } else {
      args.runs.push(item);
    }
  }
  if (args.runs.length === 0) throw new Error("Provide at least one run directory or summary.json file.");
  return args;
}

async function loadSummary(inputPath) {
  let summaryPath = inputPath;
  if (statSync(inputPath).isDirectory()) summaryPath = path.join(inputPath, "summary.json");
  return JSON.parse(await readFile(summaryPath, "utf8"));
}

function percent(earned, possible) {
  if (!possible) return "n/a";
  return `${Math.round((earned / possible) * 10000) / 100}%`;
}

function buildComparison(summaries) {
  const categories = [...new Set(summaries.flatMap((summary) => Object.keys(summary.categories || {})))].sort();
  const lines = [];
  lines.push("# Eval Run Comparison");
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push("| Model | Run | Cases | Balanced Score | Auto Score | Failed | Errors | Avg TTFT | Avg tok/s | Avg Time |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const summary of summaries) {
    const perf = summary.performance || {};
    lines.push(
      `| ${summary.model} | ${summary.run_id} | ${summary.case_count} | ${summary.balanced_final_percent ?? summary.balanced_auto_percent ?? balancedFromCategories(summary)}% | ${summary.balanced_auto_percent ?? balancedFromCategories(summary)}% | ${summary.status_counts?.auto_failed ?? 0} | ${summary.status_counts?.error ?? 0} | ${seconds(perf.avg_time_to_first_token_seconds)} | ${number(perf.avg_tokens_per_second)} | ${seconds(perf.avg_total_seconds)} |`,
    );
  }
  lines.push("");
  lines.push("## Categories");
  lines.push("");
  lines.push(`| Category | ${summaries.map((summary) => summary.model).join(" | ")} |`);
  lines.push(`|---|${summaries.map(() => "---:").join("|")}|`);
  for (const category of categories) {
    const cells = summaries.map((summary) => {
      const data = summary.categories?.[category] || { earned: 0, possible: 0 };
      return percent(data.final_earned ?? data.earned, data.final_possible ?? data.possible);
    });
    lines.push(`| ${category} | ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function balancedFromCategories(summary) {
  const values = Object.values(summary.categories || {})
    .map((data) => {
      const earned = data.final_earned ?? data.earned;
      const possible = data.final_possible ?? data.possible;
      return possible ? (earned / possible) * 100 : null;
    })
    .filter((value) => value !== null);
  if (!values.length) return "n/a";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

function seconds(value) {
  if (!value) return "n/a";
  return `${Number(value).toFixed(2)}s`;
}

function number(value) {
  if (!value) return "n/a";
  return Number(value).toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summaries = [];
  for (const runPath of args.runs) summaries.push(await loadSummary(runPath));
  const output = buildComparison(summaries);
  if (args.out) {
    await writeFile(args.out, output, "utf8");
    console.log(`Wrote ${args.out}`);
  } else {
    console.log(output);
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
