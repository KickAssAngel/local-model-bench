#!/usr/bin/env python3
"""Compare multiple run summaries produced by run_eval.py."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_summary(path: Path) -> dict[str, Any]:
    if path.is_dir():
        path = path / "summary.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing summary: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def percent(earned: float, possible: float) -> str:
    if possible == 0:
        return "n/a"
    return f"{round(earned / possible * 100, 2)}%"


def build_comparison(summaries: list[dict[str, Any]]) -> str:
    categories = sorted({category for summary in summaries for category in summary.get("categories", {})})
    lines: list[str] = []
    lines.append("# Eval Run Comparison")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append("| Model | Run | Cases | Auto Score |")
    lines.append("|---|---|---:|---:|")
    for summary in summaries:
        lines.append(
            "| {model} | {run} | {cases} | {score} |".format(
                model=summary["model"],
                run=summary["run_id"],
                cases=summary["case_count"],
                score=percent(summary["auto_earned"], summary["auto_possible"]),
            )
        )
    lines.append("")
    lines.append("## Categories")
    lines.append("")
    header = "| Category | " + " | ".join(summary["model"] for summary in summaries) + " |"
    lines.append(header)
    lines.append("|---|" + "|".join("---:" for _ in summaries) + "|")
    for category in categories:
        cells = [category]
        for summary in summaries:
            data = summary.get("categories", {}).get(category, {"earned": 0.0, "possible": 0.0})
            cells.append(percent(data["earned"], data["possible"]))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines).rstrip() + "\n"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare eval run summaries.")
    parser.add_argument("runs", nargs="+", help="Run directories or summary.json files.")
    parser.add_argument("--out", help="Optional Markdown output path.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    summaries = [load_summary(Path(item)) for item in args.runs]
    comparison = build_comparison(summaries)
    if args.out:
        Path(args.out).write_text(comparison, encoding="utf-8")
        print(f"Wrote {args.out}")
    else:
        print(comparison)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
