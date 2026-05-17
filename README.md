# Local Model Bench

Local Model Bench is a local benchmark UI for comparing language models served through LM Studio.

It focuses on practical, objective model quality checks: every default test expects one canonical JSON answer and is scored automatically. The UI shows live progress, per-category results, per-test comparisons, speed metrics, quantization metadata, and ranking views.

## What It Does

- Runs a balanced 200-case benchmark suite against LM Studio models.
- Scores model outputs with exact, objective JSON checks.
- Shows live test progress, streaming output, TTFT, prefill timing, tokens per second, and total time.
- Compares models by overall score, category score, individual tests, speed, size, quantization, and model type.
- Detects reported reasoning support and requests the strongest available reasoning mode.
- Supports batch testing of not-yet-tested model variants.
- Explicitly unloads the previous LM Studio model before starting the next batch model.
- Stores all benchmark results locally.

## Requirements

- Node.js 18 or newer.
- LM Studio with the local server enabled.
- One or more local chat models available in LM Studio.

No npm install step is required for the current app.

## Quick Start

1. Start LM Studio.
2. Enable the local LM Studio server, usually at `http://localhost:1234/v1`.
3. Start Local Model Bench.

On Windows:

```powershell
.\start-local-model-bench.cmd
```

On Ubuntu/Linux:

```bash
chmod +x ./start-local-model-bench.sh
./start-local-model-bench.sh
```

The starter chooses a free port starting at `8787`, starts the UI server, and opens the browser automatically.

Without opening the browser automatically:

```bash
node start_ui.mjs --no-open
```

## Using the UI

1. Load one or more models in LM Studio.
2. Open Local Model Bench.
3. Check that the top-right status shows loaded models.
4. Select a specific model variant, or choose `auto` to batch-test all not-yet-tested loaded variants.
5. Keep `temperature` at `0` and `top_p` at `1` for deterministic comparisons.
6. Start the run.

Results are written to the local `runs` folder. That folder is ignored by Git because it can contain private prompts, model outputs, timings, and model names.

## Batch Mode

When `auto` is selected, the app tests loaded model variants that do not already have a complete run for the current test selection.

Between two batch runs, Local Model Bench:

1. sends an unload request to LM Studio for the completed model,
2. checks LM Studio's `loaded_instances`,
3. waits until the model is fully unloaded,
4. starts the next model only after that confirmation.

This avoids loading a large second model while the previous one still occupies GPU or unified memory.

## Benchmark Design

The default suite contains 10 equally weighted categories with 20 tests each:

- Instruction & Format
- Documents & Context
- Data & Tables
- Finance & Business
- Reasoning & Planning
- Coding: Bugfixing
- Coding: Review & Architecture
- Tool Use & OS
- Agentic Behavior & Safety
- Multi-Turn & Context

Every default test has exactly one expected canonical JSON result. A semantically similar but structurally different answer is scored as wrong. This keeps model comparisons objective and reproducible.

## Metrics

Local Model Bench stores quality and speed metrics per test and per run:

- final score,
- category scores,
- pass/fail status per individual test,
- time to first token,
- prompt processing or prefill time,
- tokens per second,
- total runtime,
- input and output tokens,
- model format,
- quantization,
- model size,
- model type when inferable.

## CLI

Validate the benchmark cases:

```bash
node run_eval.mjs --dry-run
```

Run a CLI benchmark against the currently loaded model:

```bash
node run_eval.mjs
```

Compare two saved runs:

```bash
node compare_runs.mjs runs/<run-a> runs/<run-b> --out runs/comparison.md
```

The graphical UI is the recommended path for most users.

## Privacy

Local Model Bench runs locally and talks to your configured LM Studio server. It does not upload benchmark results anywhere.

Be careful when sharing the `runs` folder or screenshots. They may include model names, model outputs, timings, prompts, and local configuration details.

## Development

Check the project:

```bash
npm run check
```

Rebuild the default benchmark suite from the generator:

```bash
npm run build:cases
```

Start the UI without opening a browser:

```bash
npm start -- --no-open
```

Maintainer publishing steps are documented in `docs/PUBLISHING.md`.

## Support The Project

If you find Local Model Bench useful, you can support the maintainer through the repository's GitHub Sponsor button once funding links are configured.

Maintainers can configure `.github/FUNDING.yml` with GitHub Sponsors, Ko-fi, Buy Me a Coffee, PayPal, or another supported funding link.

## License

Local Model Bench is released under the MIT License.
