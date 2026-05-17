#!/usr/bin/env python3
"""
Small local LLM evaluation runner for LM Studio.

The runner intentionally uses only the Python standard library so it can be
started on a fresh machine without installing a framework first.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any


KNOWN_CHECKS = {
    "contains_any",
    "forbidden_regex",
    "json_exact",
    "json_fields",
    "json_valid",
    "line_count_equals",
    "max_chars",
    "must_contain",
    "must_not_contain",
    "regex",
    "word_count_at_most",
}


def load_cases(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError(f"{path}: expected a JSON array")
        for index, item in enumerate(data, start=1):
            if not isinstance(item, dict):
                raise ValueError(f"{path}:{index}: expected an object")
            item["_source"] = f"{path}:{index}"
        return data

    cases: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            try:
                item = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc
            item["_source"] = f"{path}:{line_no}"
            cases.append(item)
    return cases


def validate_cases(cases: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    seen_ids: set[str] = set()
    for case in cases:
        source = case.get("_source", "<unknown>")
        case_id = case.get("id")
        if not case_id:
            errors.append(f"{source}: missing id")
        elif case_id in seen_ids:
            errors.append(f"{source}: duplicate id {case_id!r}")
        else:
            seen_ids.add(case_id)
        if "messages" in case:
            if not isinstance(case.get("messages"), list) or not case["messages"]:
                errors.append(f"{source}: messages must be a non-empty list")
                continue
            for idx, message in enumerate(case["messages"]):
                if message.get("role") not in {"system", "user", "assistant"}:
                    errors.append(f"{source}: messages[{idx}].role is invalid")
                if not isinstance(message.get("content"), str) or not message["content"]:
                    errors.append(f"{source}: messages[{idx}].content must be a non-empty string")
        elif not isinstance(case.get("prompt"), str) or not case["prompt"]:
            errors.append(f"{source}: either messages or prompt must be provided")
        for check in case.get("scoring", {}).get("auto", []):
            check_type = check.get("type")
            if check_type not in KNOWN_CHECKS:
                errors.append(f"{source}: unknown check type {check_type!r}")
    return errors


def case_messages(case: dict[str, Any]) -> list[dict[str, str]]:
    if "messages" in case:
        return case["messages"]
    messages: list[dict[str, str]] = []
    system = case.get(
        "system",
        "Du bist ein präziser Assistent. Befolge die Aufgabe exakt und erfinde keine Fakten.",
    )
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": case["prompt"]})
    return messages


def request_json(
    method: str,
    url: str,
    payload: dict[str, Any] | None = None,
    api_key: str = "lm-studio",
    timeout: float = 120.0,
) -> dict[str, Any]:
    body = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc.reason}") from exc
    return json.loads(raw)


def resolve_model(base_url: str, model: str, api_key: str, timeout: float) -> str:
    if model != "auto":
        return model
    data = request_json("GET", f"{base_url.rstrip('/')}/models", api_key=api_key, timeout=timeout)
    models = data.get("data") or []
    if not models:
        raise RuntimeError("LM Studio returned no loaded models from /v1/models.")
    first = models[0]
    if not isinstance(first, dict) or not first.get("id"):
        raise RuntimeError(f"Unexpected /v1/models response: {data}")
    return str(first["id"])


def call_chat_completion(
    base_url: str,
    model: str,
    messages: list[dict[str, str]],
    generation: dict[str, Any],
    api_key: str,
    timeout: float,
) -> tuple[str, dict[str, Any]]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": False,
    }
    payload.update({key: value for key, value in generation.items() if value is not None})
    data = request_json(
        "POST",
        f"{base_url.rstrip('/')}/chat/completions",
        payload=payload,
        api_key=api_key,
        timeout=timeout,
    )
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected chat completion response: {data}") from exc
    return str(content), data


def strip_code_fence(text: str) -> str:
    trimmed = text.strip()
    match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", trimmed, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return trimmed


def extract_balanced_json(text: str) -> Any:
    cleaned = strip_code_fence(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    for opener, closer in (("{", "}"), ("[", "]")):
        start = cleaned.find(opener)
        while start != -1:
            depth = 0
            in_string = False
            escape = False
            for idx in range(start, len(cleaned)):
                char = cleaned[idx]
                if in_string:
                    if escape:
                        escape = False
                    elif char == "\\":
                        escape = True
                    elif char == '"':
                        in_string = False
                    continue
                if char == '"':
                    in_string = True
                elif char == opener:
                    depth += 1
                elif char == closer:
                    depth -= 1
                    if depth == 0:
                        candidate = cleaned[start : idx + 1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            break
            start = cleaned.find(opener, start + 1)
    raise ValueError("No valid JSON object or array found in model output.")


def parse_strict_json_only(text: str) -> Any:
    trimmed = text.strip()
    if not trimmed:
        raise ValueError("Empty output; expected only JSON.")
    if trimmed.startswith("```"):
        raise ValueError("Markdown code fences are not allowed; expected raw JSON only.")
    return json.loads(trimmed)


def json_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    return type(value).__name__


def json_exact_mismatches(actual: Any, expected: Any, path: str = "$") -> list[str]:
    actual_type = json_type(actual)
    expected_type = json_type(expected)
    if actual_type != expected_type:
        return [f"{path}: expected {expected_type}, got {actual_type}"]
    if expected_type == "array":
        mismatches: list[str] = []
        if len(actual) != len(expected):
            mismatches.append(f"{path}: expected {len(expected)} item(s), got {len(actual)}")
        for index, (actual_item, expected_item) in enumerate(zip(actual, expected)):
            mismatches.extend(json_exact_mismatches(actual_item, expected_item, f"{path}[{index}]"))
        return mismatches
    if expected_type == "object":
        mismatches: list[str] = []
        actual_keys = set(actual)
        expected_keys = set(expected)
        for key in sorted(expected_keys - actual_keys):
            mismatches.append(f"{path}.{key}: missing")
        for key in sorted(actual_keys - expected_keys):
            mismatches.append(f"{path}.{key}: unexpected")
        for key in sorted(expected_keys & actual_keys):
            mismatches.extend(json_exact_mismatches(actual[key], expected[key], f"{path}.{key}"))
        return mismatches
    if actual != expected:
        return [f"{path}: expected {expected!r}, got {actual!r}"]
    return []


def get_path(value: Any, dotted_path: str) -> Any:
    current = value
    for part in dotted_path.split("."):
        if isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                raise KeyError(dotted_path)
        elif isinstance(current, dict):
            if part not in current:
                raise KeyError(dotted_path)
            current = current[part]
        else:
            raise KeyError(dotted_path)
    return current


def normalize_scalar(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if re.fullmatch(r"-?\d+(?:[.,]\d+)?", stripped):
            try:
                return float(stripped.replace(",", "."))
            except ValueError:
                return stripped.casefold()
        return stripped.casefold()
    return value


def scalars_equal(actual: Any, expected: Any) -> bool:
    actual_norm = normalize_scalar(actual)
    expected_norm = normalize_scalar(expected)
    if isinstance(actual_norm, float) and isinstance(expected_norm, float):
        return abs(actual_norm - expected_norm) < 1e-9
    return actual_norm == expected_norm


def text_contains(text: str, needle: str, case_sensitive: bool = False) -> bool:
    if case_sensitive:
        return needle in text
    return needle.casefold() in text.casefold()


def score_check(check: dict[str, Any], output: str) -> tuple[bool, str]:
    check_type = check["type"]
    if check_type == "json_exact":
        parsed = parse_strict_json_only(output)
        mismatches = json_exact_mismatches(parsed, check.get("expected"))
        if mismatches:
            return False, "; ".join(mismatches)
        return True, "exact JSON matched"

    if check_type == "json_valid":
        extract_balanced_json(output)
        return True, "valid JSON found"

    if check_type == "json_fields":
        parsed = extract_balanced_json(output)
        expected = check.get("expected", {})
        mismatches: list[str] = []
        for path, expected_value in expected.items():
            try:
                actual_value = get_path(parsed, path)
            except KeyError:
                mismatches.append(f"{path}: missing")
                continue
            if not scalars_equal(actual_value, expected_value):
                mismatches.append(f"{path}: expected {expected_value!r}, got {actual_value!r}")
        if mismatches:
            return False, "; ".join(mismatches)
        return True, f"{len(expected)} field(s) matched"

    if check_type == "must_contain":
        items = check.get("items", [])
        missing = [item for item in items if not text_contains(output, item, check.get("case_sensitive", False))]
        if missing:
            return False, f"missing: {missing}"
        return True, f"all {len(items)} item(s) found"

    if check_type == "contains_any":
        items = check.get("items", [])
        if any(text_contains(output, item, check.get("case_sensitive", False)) for item in items):
            return True, "one allowed item found"
        return False, f"none found: {items}"

    if check_type == "must_not_contain":
        items = check.get("items", [])
        present = [item for item in items if text_contains(output, item, check.get("case_sensitive", False))]
        if present:
            return False, f"forbidden text present: {present}"
        return True, f"none of {len(items)} forbidden item(s) found"

    if check_type == "regex":
        patterns = check.get("patterns", [])
        missing = [pattern for pattern in patterns if not re.search(pattern, output, re.IGNORECASE | re.DOTALL)]
        if missing:
            return False, f"missing regex match: {missing}"
        return True, f"all {len(patterns)} regex pattern(s) matched"

    if check_type == "forbidden_regex":
        patterns = check.get("patterns", [])
        present = [pattern for pattern in patterns if re.search(pattern, output, re.IGNORECASE | re.DOTALL)]
        if present:
            return False, f"forbidden regex matched: {present}"
        return True, f"none of {len(patterns)} forbidden regex pattern(s) matched"

    if check_type == "word_count_at_most":
        count = len(re.findall(r"\b[\wÄÖÜäöüß-]+\b", output, re.UNICODE))
        limit = int(check["max"])
        if count <= limit:
            return True, f"{count} words <= {limit}"
        return False, f"{count} words > {limit}"

    if check_type == "line_count_equals":
        lines = [line for line in output.splitlines() if line.strip()]
        expected = int(check["count"])
        if len(lines) == expected:
            return True, f"{len(lines)} non-empty lines"
        return False, f"{len(lines)} non-empty lines, expected {expected}"

    if check_type == "max_chars":
        limit = int(check["max"])
        if len(output) <= limit:
            return True, f"{len(output)} chars <= {limit}"
        return False, f"{len(output)} chars > {limit}"

    raise ValueError(f"Unsupported check type: {check_type}")


def score_output(case: dict[str, Any], output: str) -> dict[str, Any]:
    checks = case.get("scoring", {}).get("auto", [])
    results: list[dict[str, Any]] = []
    earned = 0.0
    possible = 0.0
    for check in checks:
        points = float(check.get("points", 1.0))
        possible += points
        try:
            passed, detail = score_check(check, output)
        except Exception as exc:  # Keep scoring failures visible in the report.
            passed = False
            detail = f"{type(exc).__name__}: {exc}"
        if passed:
            earned += points
        results.append(
            {
                "type": check.get("type"),
                "label": check.get("label", ""),
                "passed": passed,
                "points": points if passed else 0.0,
                "max_points": points,
                "detail": detail,
            }
        )
    return {
        "earned": earned,
        "possible": possible,
        "percent": round((earned / possible) * 100, 2) if possible else None,
        "checks": results,
        "manual_rubric": case.get("scoring", {}).get("manual_rubric", []),
    }


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-")[:80] or "model"


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_report(results: list[dict[str, Any]], summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# LM Studio Eval Report: {summary['model']}")
    lines.append("")
    lines.append(f"- Run: {summary['run_id']}")
    lines.append(f"- Cases: {summary['case_count']}")
    lines.append(f"- Auto score: {summary['auto_earned']:.1f} / {summary['auto_possible']:.1f} ({summary['auto_percent']}%)")
    lines.append(f"- Manual rubric cases: {summary['manual_case_count']}")
    lines.append("")
    lines.append("## Category Scores")
    lines.append("")
    lines.append("| Category | Cases | Auto Score |")
    lines.append("|---|---:|---:|")
    for category, data in summary["categories"].items():
        percent = "n/a" if data["possible"] == 0 else f"{round(data['earned'] / data['possible'] * 100, 2)}%"
        lines.append(f"| {category} | {data['cases']} | {percent} |")
    lines.append("")
    lines.append("## Cases With Missed Auto Checks")
    lines.append("")
    misses = [item for item in results if item["score"]["possible"] and item["score"]["earned"] < item["score"]["possible"]]
    if not misses:
        lines.append("No missed auto checks.")
    else:
        for item in misses:
            score = item["score"]
            lines.append(f"### {item['id']} - {item['title']}")
            lines.append(f"Auto score: {score['earned']:.1f} / {score['possible']:.1f}")
            for check in score["checks"]:
                if not check["passed"]:
                    label = f" ({check['label']})" if check.get("label") else ""
                    lines.append(f"- {check['type']}{label}: {check['detail']}")
            lines.append("")
    lines.append("")
    lines.append("## Manual Review Queue")
    lines.append("")
    manual = [item for item in results if item["score"].get("manual_rubric")]
    if not manual:
        lines.append("No manual rubrics configured.")
    else:
        for item in manual:
            lines.append(f"### {item['id']} - {item['title']}")
            for rubric in item["score"]["manual_rubric"]:
                points = rubric.get("points", "")
                lines.append(f"- [{points} pts] {rubric.get('criterion', rubric)}")
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def summarize(results: list[dict[str, Any]], run_id: str, model: str, args: argparse.Namespace) -> dict[str, Any]:
    categories: dict[str, dict[str, Any]] = defaultdict(lambda: {"cases": 0, "earned": 0.0, "possible": 0.0})
    auto_earned = 0.0
    auto_possible = 0.0
    manual_case_count = 0
    for item in results:
        score = item["score"]
        category = item["category"]
        categories[category]["cases"] += 1
        categories[category]["earned"] += score["earned"]
        categories[category]["possible"] += score["possible"]
        auto_earned += score["earned"]
        auto_possible += score["possible"]
        if score.get("manual_rubric"):
            manual_case_count += 1
    return {
        "run_id": run_id,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "model": model,
        "base_url": args.base_url,
        "case_count": len(results),
        "auto_earned": auto_earned,
        "auto_possible": auto_possible,
        "auto_percent": round((auto_earned / auto_possible) * 100, 2) if auto_possible else None,
        "manual_case_count": manual_case_count,
        "categories": dict(sorted(categories.items())),
        "defaults": {
            "temperature": args.temperature,
            "top_p": args.top_p,
            "max_tokens": args.max_tokens,
            "seed": args.seed,
        },
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run practical quality evals against LM Studio.")
    parser.add_argument("--base-url", default="http://localhost:1234/v1", help="LM Studio OpenAI-compatible base URL.")
    parser.add_argument("--api-key", default=os.environ.get("LM_STUDIO_API_KEY", "lm-studio"))
    parser.add_argument("--model", default="auto", help="Model id. Use 'auto' to select the first loaded model.")
    parser.add_argument("--cases", default="testfaelle/praxis_de.json", help="JSON or JSONL file with eval cases.")
    parser.add_argument("--output-dir", default="runs", help="Directory for run outputs.")
    parser.add_argument("--category", action="append", help="Run only this category. Can be repeated.")
    parser.add_argument("--limit", type=int, help="Run only the first N matching cases.")
    parser.add_argument("--timeout", type=float, default=900.0, help="HTTP timeout per case in seconds.")
    parser.add_argument("--temperature", type=float, default=0.0)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--max-tokens", type=int, default=None, help="Optional output cap. Omit for no eval-suite cap.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true", help="Validate cases without calling LM Studio.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    cases_path = Path(args.cases)
    cases = load_cases(cases_path)
    errors = validate_cases(cases)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 2

    if args.category:
        allowed = set(args.category)
        cases = [case for case in cases if case.get("category") in allowed]
    if args.limit is not None:
        cases = cases[: args.limit]

    if args.dry_run:
        auto_points = sum(float(check.get("points", 1.0)) for case in cases for check in case.get("scoring", {}).get("auto", []))
        manual_cases = sum(1 for case in cases if case.get("scoring", {}).get("manual_rubric"))
        print(f"Validated {len(cases)} case(s), {auto_points:.1f} automatic points, {manual_cases} manual rubric case(s).")
        return 0

    model = resolve_model(args.base_url, args.model, args.api_key, args.timeout)
    run_id = dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + slugify(model)
    run_dir = Path(args.output_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    results_path = run_dir / "results.jsonl"
    default_generation = {
        "temperature": args.temperature,
        "top_p": args.top_p,
        "seed": args.seed,
    }
    if args.max_tokens:
        default_generation["max_tokens"] = args.max_tokens

    print(f"Running {len(cases)} case(s) against {model} via {args.base_url}")
    with results_path.open("w", encoding="utf-8") as handle:
        for index, case in enumerate(cases, start=1):
            generation = dict(default_generation)
            generation.update(case.get("generation", {}))
            started = time.perf_counter()
            error = None
            raw_response: dict[str, Any] | None = None
            output = ""
            try:
                output, raw_response = call_chat_completion(
                    args.base_url,
                    model,
                    case_messages(case),
                    generation,
                    args.api_key,
                    args.timeout,
                )
            except Exception as exc:
                error = f"{type(exc).__name__}: {exc}"
            latency = round(time.perf_counter() - started, 3)
            score = score_output(case, output) if error is None else {
                "earned": 0.0,
                "possible": sum(float(check.get("points", 1.0)) for check in case.get("scoring", {}).get("auto", [])),
                "percent": 0.0,
                "checks": [{"type": "request", "passed": False, "points": 0.0, "max_points": 0.0, "detail": error}],
                "manual_rubric": case.get("scoring", {}).get("manual_rubric", []),
            }
            record = {
                "id": case["id"],
                "title": case.get("title", ""),
                "category": case.get("category", "uncategorized"),
                "tags": case.get("tags", []),
                "source": case.get("_source"),
                "generation": generation,
                "latency_seconds": latency,
                "output": output,
                "score": score,
                "error": error,
                "usage": (raw_response or {}).get("usage"),
            }
            results.append(record)
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            percent = "n/a" if score["percent"] is None else f"{score['percent']}%"
            print(f"[{index:02d}/{len(cases):02d}] {case['id']}: {percent} ({latency}s)")

    summary = summarize(results, run_id, model, args)
    write_json(run_dir / "summary.json", summary)
    (run_dir / "report.md").write_text(build_report(results, summary), encoding="utf-8")
    print("")
    print(f"Done. Report: {run_dir / 'report.md'}")
    print(f"Results: {results_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
