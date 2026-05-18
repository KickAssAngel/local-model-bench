# Changelog

All notable changes to Local Model Bench will be documented in this file.

## 0.2.0 - 2026-05-18

Adds the bilingual benchmark release.

- Added a matched English 200-case benchmark suite alongside the frozen German reference suite.
- Added suite-language metadata to saved runs.
- Scoped rankings, comparisons, and auto-batch decisions to the active UI language.
- Added German and English UI switching, with the switch locked while a run is active.
- Added pair validation to keep the English suite aligned with the frozen German reference.
- Added local review documentation for the English-suite transfer.
- Updated CLI support for `--lang de|en`.

## 0.1.0 - 2026-05-17

Initial public release preparation.

- Graphical benchmark UI for LM Studio models.
- Objective 200-case frontier-style benchmark suite.
- Balanced category and per-test comparison views.
- Model metadata display for quantization, size, architecture, and speed.
- Reasoning capability detection and requested maximum reasoning level.
- Batch mode for testing all not-yet-tested loaded model variants.
- Safe batch model switching with explicit LM Studio unload confirmation.
- Windows and Ubuntu/Linux starter scripts.
