#!/usr/bin/env python3
"""Summarize scored Mini predictions without changing release-gate results."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def diagnose(gold: list[dict], predictions: list[dict], scored: dict) -> dict:
    report = scored["report"]
    if report["total"] != len(gold):
        raise ValueError("Scored report and gold case counts differ")
    if len({row["id"] for row in gold}) != len(gold):
        raise ValueError("Duplicate gold IDs")
    if len({row["id"] for row in predictions}) != len(predictions):
        raise ValueError("Duplicate prediction IDs")
    gold_by_id = {row["id"]: row for row in gold}
    if any(row["id"] not in gold_by_id for row in predictions):
        raise ValueError("Predictions include IDs outside this evaluation set")

    by_id = {row["id"]: row for row in predictions}
    failures = defaultdict(set)
    for failure in report["failures"]:
        if failure["id"] not in gold_by_id:
            raise ValueError("Scored report includes an unknown case ID")
        failures[failure["id"]].add(failure["type"])

    confusion = defaultdict(Counter)
    failure_types = Counter()
    action_type_confusion = defaultdict(Counter)
    unexpected_attempts = []
    rejected_attempts = []
    invalid_examples = []
    for example in gold:
        case_id = example["id"]
        expected = example["output"]
        prediction = by_id.get(case_id)
        for failure in failures[case_id]:
            failure_types[failure] += 1
        if prediction is None:
            actual_route = "missing-prediction"
        elif "invalid-output" in failures[case_id]:
            actual_route = "invalid-output"
            invalid_examples.append(case_id)
        else:
            actual_route = prediction["output"]["route"]
        confusion[expected["route"]][actual_route] += 1

        raw = prediction.get("output") if prediction else None
        if not isinstance(raw, dict):
            continue
        actions = raw.get("batch", {}).get("actions") if isinstance(raw.get("batch"), dict) else None
        attempted = raw.get("route") == "actions" and isinstance(actions, list) and bool(actions)
        if expected["route"] != "actions" and attempted:
            unexpected_attempts.append(case_id)
            if actual_route == "invalid-output":
                rejected_attempts.append(case_id)
        if expected["route"] == actual_route == "actions":
            gold_types = tuple(action["type"] for action in expected["batch"]["actions"])
            actual_types = tuple(action["type"] for action in actions)
            action_type_confusion[" + ".join(gold_types)][" + ".join(actual_types)] += 1

    if sum(failure_types.values()) != len(report["failures"]):
        raise ValueError("Duplicate failure type within a case")
    if sum(sum(row.values()) for row in confusion.values()) != len(gold):
        raise ValueError("Route accounting is incomplete")
    if len(invalid_examples) != len(gold) - report["parseValid"] - (len(gold) - report["predicted"]):
        raise ValueError("Protocol-invalid case count differs from scorer")
    if len(set(unexpected_attempts) - set(rejected_attempts)) != report["unsafeActionCount"]:
        raise ValueError("Valid unsafe action count differs from scorer")

    return {
        "source": "Supplementary diagnostics; release gate remains the scored report",
        "cases": len(gold),
        "gatePasses": scored["passes"],
        "expectedVsParsedRoute": {key: dict(value) for key, value in confusion.items()},
        "failureTypes": dict(failure_types),
        "parsedActionTypeSequences": {key: dict(value) for key, value in action_type_confusion.items()},
        "unexpectedActionAttemptIds": unexpected_attempts,
        "protocolRejectedActionAttemptIds": rejected_attempts,
        "validUnsafeActionIds": [case_id for case_id in unexpected_attempts if case_id not in rejected_attempts],
        "protocolInvalidIds": invalid_examples,
        "limits": "Malformed non-JSON text cannot be reliably classified as an action attempt; strict action scoring also penalizes differing descriptive wording.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gold", type=Path)
    parser.add_argument("predictions", type=Path)
    parser.add_argument("scored_report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = diagnose(read_jsonl(args.gold), read_jsonl(args.predictions), json.loads(args.scored_report.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"cases": result["cases"], "gatePasses": result["gatePasses"],
                      "unexpectedActionAttempts": len(result["unexpectedActionAttemptIds"]),
                      "rejectedActionAttempts": len(result["protocolRejectedActionAttemptIds"])}, indent=2))


if __name__ == "__main__":
    main()
