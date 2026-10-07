#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


DEFAULT_MODEL = "principled-intelligence/Qwen3.5-0.8B-text-only"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Acceptance-test the MYELIN Mini LoRA adapter.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument(
        "--compiled-train",
        type=Path,
        default=Path("training/myelin-mini/compiled/train-v1.jsonl"),
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("artifacts/myelin-mini/acceptance/report.json"),
    )
    parser.add_argument("--max-new-tokens", type=int, default=384)
    return parser.parse_args()


def first_system_prompt(path: Path) -> str:
    first = next(line for line in path.read_text(encoding="utf-8").splitlines() if line.strip())
    row = json.loads(first)
    return row["messages"][0]["content"]


def extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^\s*<think>[\s\S]*?</think>\s*", "", cleaned, flags=re.I)
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.I)
    if fenced:
        cleaned = fenced.group(1).strip()
    if cleaned.startswith("{") and cleaned.endswith("}"):
        return json.loads(cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        return json.loads(cleaned[start : end + 1])
    raise ValueError("No JSON object found in model output.")


def semantic_action_ok(output: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    if output.get("version") != 1:
        return False, "missing version=1"
    if output.get("route") != "actions":
        return False, f"expected route=actions, got {output.get('route')!r}"
    batch = output.get("batch")
    if not isinstance(batch, dict):
        return False, "missing batch"
    actions = batch.get("actions")
    if not isinstance(actions, list) or len(actions) != 1:
        return False, "expected exactly one action"
    action = actions[0]
    if action.get("type") != "create_task":
        return False, f"expected create_task, got {action.get('type')!r}"
    checks = {
        "topic.topicId": (action.get("topic") or {}).get("topicId"),
        "taskType": action.get("taskType"),
        "dueDate": action.get("dueDate"),
        "estimatedMinutes": action.get("estimatedMinutes"),
        "priority": action.get("priority"),
    }
    for key, actual in checks.items():
        if actual != expected[key]:
            return False, f"{key}: expected {expected[key]!r}, got {actual!r}"
    return True, "semantic action matched"


def route_ok(output: dict[str, Any], route: str, reason: str | None = None) -> tuple[bool, str]:
    if output.get("version") != 1:
        return False, "missing version=1"
    if output.get("route") != route:
        return False, f"expected route={route}, got {output.get('route')!r}"
    if reason is not None and output.get("reason") != reason:
        return False, f"expected reason={reason}, got {output.get('reason')!r}"
    return True, "route matched"


def generate(tokenizer, model, system: str, payload: dict[str, Any], max_new_tokens: int) -> tuple[str, float]:
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]
    try:
        rendered = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        rendered = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    inputs = tokenizer(rendered, return_tensors="pt")
    started = time.perf_counter()
    with torch.inference_mode():
        generated = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )
    elapsed_ms = (time.perf_counter() - started) * 1000
    new_tokens = generated[0, inputs["input_ids"].shape[1] :]
    return tokenizer.decode(new_tokens, skip_special_tokens=True), elapsed_ms


def main() -> None:
    args = parse_args()
    system = first_system_prompt(args.compiled_train)

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        trust_remote_code=True,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    topic_context = {
        "topics": [
            {
                "id": "topic-trig",
                "name": "Trigonometry",
                "subject": "Mathematics",
            }
        ]
    }

    cases = [
        {
            "id": "exact-target",
            "payload": {
                "requestId": "accept-exact",
                "currentDate": "2026-10-07",
                "userRequest": "kal trig ke 30 min questions add kar do",
                "context": topic_context,
            },
            "kind": "action",
            "expected": {
                "topic.topicId": "topic-trig",
                "taskType": "practice",
                "dueDate": "2026-10-08",
                "estimatedMinutes": 30,
                "priority": 2,
            },
            "required": True,
        },
        {
            "id": "hinglish-variant",
            "payload": {
                "requestId": "accept-hinglish-variant",
                "currentDate": "2026-10-07",
                "userRequest": "kal trigonometry ke 30 minute practice questions laga do",
                "context": topic_context,
            },
            "kind": "action",
            "expected": {
                "topic.topicId": "topic-trig",
                "taskType": "practice",
                "dueDate": "2026-10-08",
                "estimatedMinutes": 30,
                "priority": 2,
            },
            "required": True,
        },
        {
            "id": "hinglish-high-priority",
            "payload": {
                "requestId": "accept-hinglish-high",
                "currentDate": "2026-10-07",
                "userRequest": "kal trig ke 30 min questions add kar do high priority",
                "context": topic_context,
            },
            "kind": "action",
            "expected": {
                "topic.topicId": "topic-trig",
                "taskType": "practice",
                "dueDate": "2026-10-08",
                "estimatedMinutes": 30,
                "priority": 3,
            },
            "required": True,
        },
        {
            "id": "clarify-missing-target",
            "payload": {
                "requestId": "accept-clarify",
                "currentDate": "2026-10-07",
                "userRequest": "isko high priority kar do",
                "context": {},
            },
            "kind": "route",
            "route": "clarify",
            "reason": "missing-target",
            "required": True,
        },
        {
            "id": "escalate-tutoring",
            "payload": {
                "requestId": "accept-escalate",
                "currentDate": "2026-10-07",
                "userRequest": "mujhe trigonometry samjhao",
                "context": topic_context,
            },
            "kind": "route",
            "route": "escalate",
            "reason": "tutoring",
            "required": False,
        },
    ]

    results = []
    for case in cases:
        raw, latency_ms = generate(
            tokenizer,
            model,
            system,
            case["payload"],
            args.max_new_tokens,
        )
        parsed = None
        ok = False
        detail = ""
        try:
            parsed = extract_json(raw)
            if case["kind"] == "action":
                ok, detail = semantic_action_ok(parsed, case["expected"])
            else:
                ok, detail = route_ok(parsed, case["route"], case.get("reason"))
        except Exception as exc:
            detail = f"parse failure: {exc}"
        results.append(
            {
                "id": case["id"],
                "required": case["required"],
                "ok": ok,
                "detail": detail,
                "latencyMs": latency_ms,
                "raw": raw,
                "parsed": parsed,
            }
        )
        print(f"{case['id']}: {'PASS' if ok else 'FAIL'} | {detail}")
        print(raw)

    required = [item for item in results if item["required"]]
    required_passed = sum(1 for item in required if item["ok"])
    exact = next(item for item in results if item["id"] == "exact-target")

    report = {
        "schemaVersion": 1,
        "model": args.model,
        "adapter": str(args.adapter),
        "exactTargetPassed": bool(exact["ok"]),
        "requiredPassed": required_passed,
        "requiredTotal": len(required),
        "acceptancePassed": bool(exact["ok"]) and required_passed == len(required),
        "results": results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "results"}, indent=2))

    if not report["acceptancePassed"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
