# Contributing

Thanks for taking the time to improve Local Model Bench.

## Development Setup

You need Node.js 18 or newer. The app has no required npm dependencies.

```bash
npm run check
npm start -- --no-open
```

Open the printed local URL in your browser. LM Studio must be running separately if you want to execute benchmark runs.

## Pull Requests

Before opening a pull request:

- Run `npm run check`.
- Keep generated run data out of the pull request.
- Do not commit private prompts, model outputs, local paths, API keys, or screenshots with sensitive information.
- Keep benchmark cases objectively scorable. Prefer exact JSON checks over subjective grading.

## Benchmark Case Changes

The default suite is intentionally balanced. If you add or remove cases, keep categories equally weighted or explain why the weighting changed.

Every default benchmark case should have:

- a stable ID,
- one category,
- deterministic input,
- a single canonical expected output,
- objective automatic scoring.
