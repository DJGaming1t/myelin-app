#!/usr/bin/env python3
"""
Acceptance test for a trained MYELIN Mini LoRA adapter.

This is intentionally narrow: the adapter must turn natural/Hinglish
"add trigonometry questions for tomorrow" requests into the correct
MYELIN create_task action.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


CASES = [
    {
        "id": "hinglish-exact",
        "requestId": "accept-hinglish-exact",
        "userRequest": "kal trig ke 30 min questions add kar do",
        "priority": 2,
    },
    {
        "id": "hinglish-high-priority",
        "requestId": "accept-hinglish-high",
        "userRequest": "kal trig ke 30 min questions add kar do high priority",
        "priority": 3,
    },
    {
        "id": "english-natural",
        "requestId": "accept-english-natural",
        "userRequest": "Tomorrow add 30 minutes of trigonometry questions.",
        "priority": 2,
    },
    {
        "id": "shorthand",
        "requestId": "accept-shorthand",
        "userRequest": "trig tomorrow 30m questions",
        "priority": 2,
    },
    {
        "id": "hinglish-natural",
        "requestId": "accept-hinglish-natural",
        "userRequest": "kal trigonometry ka 30 minute practice add kar do",
        "priority": 2,
    },
]

CONTEXT = {
    "topics": [
        {
            "id": "topic-trig",
            "name": "Trigonometry",
            "subject": "Mathematics",
            "status": "learning",
            "priority": 2,
        }
    ]
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        default="principled-intelligence/Qwen3.5-0.8B-text-only",
    )
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument(
        "--compiled-train",
        type=Path,
        default=Path("training/myelin-mini/compiled/train-v1.jsonl"),
    )
    parser.add_argument("--max-new-tokens", type=int, default=320)
    parser.add_argument("--min-pass", type=int, default=len(CASES))
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def load_system_prompt(path: Path) -> str:
    first = path.read_text(encoding="utf-8").splitlines()[0]
    row = json.loads(first)
    messages = row["messages"]
    assert messages[0]["role"] == "system"
    return messages[0]["content"]


def extract_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", stripped)
    if fenced:
        stripped = fenced.group(1)
    if not stripped.startswith("{"):
        first = stripped.find("{")
        last = stripped.rfind("}")
        if first >= 0 and last > first:
            stripped = stripped[first : last + 1]
    value = json.loads(stripped)
    if not isinstance(value, dict):
        raise ValueError("Model output is not a JSON object.")
    return value


def validate_case(case: dict[str, Any], output: dict[str, Any]) -> tuple[bool, list[str]]:
    problems: list[str] = []
    if output.get("version") != 1:
        problems.append("version must be 1")
    if output.get("requestId") != case["requestId"]:
        problems.append("requestId mismatch")
    if output.get("route") != "actions":
        problems.append(f"route must be actions, got {output.get('route')!r}")
        return False, problems

    batch = output.get("batch")
    if not isinstance(batch, dict):
        problems.append("missing batch")
        return False, problems
    if batch.get("version") != 1:
        problems.append("batch.version must be 1")
    if batch.get("requestId") != case["requestId"]:
        problems.append("batch.requestId mismatch")

    actions = batch.get("actions")
    if not isinstance(actions, list) or len(actions) != 1:
        problems.append("expected exactly one action")
        return False, problems

    action = actions[0]
    if not isinstance(action, dict):
        problems.append("action is not an object")
        return False, problems

    expected = {
        "type": "create_task",
        "taskType": "practice",
        "dueDate": "2026-10-08",
        "estimatedMinutes": 30,
        "priority": case["priority"],
    }
    for key, value in expected.items():
        if action.get(key) != value:
            problems.append(f"{key}: expected {value!r}, got {action.get(key)!r}")

    topic = action.get("topic")
    if not isinstance(topic, dict) or topic.get("topicId") != "topic-trig":
        problems.append("topic must reference topic-trig")

    subject = action.get("subject")
    if subject not in ("Mathematics", "Maths"):
        problems.append(f"unexpected subject {subject!r}")

    title = action.get("title")
    if not isinstance(title, str) or not title.strip():
        problems.append("task title is missing")

    return not problems, problems


def apply_template(tokenizer: Any, messages: list[dict[str, str]]) -> str:
    kwargs = {
        "tokenize": False,
        "add_generation_prompt": True,
    }
    try:
        return tokenizer.apply_chat_template(
            messages,
            enable_thinking=False,
            **kwargs,
        )
    except TypeError:
        return tokenizer.apply_chat_template(messages, **kwargs)


def main() -> None:
    args = parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if not args.adapter.exists():
        raise FileNotFoundError(args.adapter)

    system_prompt = load_system_prompt(args.compiled_train)

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    results: list[dict[str, Any]] = []
    passed = 0

    for case in CASES:
        payload = {
            "requestId": case["requestId"],
            "currentDate": "2026-10-07",
            "userRequest": case["userRequest"],
            "context": CONTEXT,
        }
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(payload, separators=(",", ":"))},
        ]
        prompt = apply_template(tokenizer, messages)
        encoded = tokenizer(prompt, return_tensors="pt")
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )
        new_tokens = generated[0, encoded["input_ids"].shape[1] :]
        raw = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

        try:
            output = extract_json(raw)
            ok, problems = validate_case(case, output)
        except Exception as exc:
            output = None
            ok = False
            problems = [f"parse error: {exc}"]

        if ok:
            passed += 1

        results.append(
            {
                "id": case["id"],
                "userRequest": case["userRequest"],
                "passed": ok,
                "problems": problems,
                "raw": raw,
                "parsed": output,
            }
        )
        print(f"[{'PASS' if ok else 'FAIL'}] {case['id']}: {case['userRequest']}")
        if problems:
            for problem in problems:
                print(f"  - {problem}")

    report = {
        "schemaVersion": 1,
        "model": args.model,
        "adapter": str(args.adapter),
        "passed": passed,
        "total": len(CASES),
        "required": args.min_pass,
        "acceptancePassed": passed >= args.min_pass,
        "results": results,
    }

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(
        f"MYELIN Mini trigonometry acceptance: {passed}/{len(CASES)} "
        f"(required {args.min_pass})"
    )
    if passed < args.min_pass:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
