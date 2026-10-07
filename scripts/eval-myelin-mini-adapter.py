#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


DEFAULT_MODEL = "principled-intelligence/Qwen3.5-0.8B-text-only"
DEFAULT_PROMPTS = Path("training/myelin-mini/compiled/eval-prompts-v1.jsonl")
DEFAULT_CASES = [
    "e18-hinglish",
    "e03-practice-tomorrow",
    "e09-clarify-date",
    "e13-escalate-tutoring",
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.I)
    if fenced:
        text = fenced.group(1).strip()
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    value = json.loads(text)
    if not isinstance(value, dict):
        raise ValueError("Model output must be a JSON object.")
    return value


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--adapter", type=Path, required=True)
    p.add_argument("--prompts", type=Path, default=DEFAULT_PROMPTS)
    p.add_argument("--cases", default=",".join(DEFAULT_CASES))
    p.add_argument("--max-new-tokens", type=int, default=320)
    p.add_argument("--output", type=Path)
    return p.parse_args()


def assert_action_case(case_id: str, value: dict[str, Any]) -> None:
    assert value.get("version") == 1, f"{case_id}: missing version=1"
    assert value.get("route") == "actions", f"{case_id}: expected actions"
    assert float(value.get("confidence", 0)) >= 0.72, f"{case_id}: low confidence"
    batch = value.get("batch")
    assert isinstance(batch, dict), f"{case_id}: missing batch"
    actions = batch.get("actions")
    assert isinstance(actions, list) and actions, f"{case_id}: empty actions"

    if case_id == "e18-hinglish":
        a = actions[0]
        assert a.get("type") == "create_task"
        assert a.get("taskType") == "practice"
        assert a.get("estimatedMinutes") == 30
        assert a.get("priority") == 3
        assert a.get("dueDate") == "2026-10-08"
        topic = a.get("topic")
        assert isinstance(topic, dict) and topic.get("topicId") == "topic-trig"
    elif case_id == "e03-practice-tomorrow":
        a = actions[0]
        assert a.get("type") == "create_task"
        assert a.get("estimatedMinutes") == 35
        assert a.get("dueDate") == "2026-10-08"


def assert_case(case_id: str, value: dict[str, Any]) -> None:
    if case_id in {"e18-hinglish", "e03-practice-tomorrow"}:
        assert_action_case(case_id, value)
        return
    if case_id == "e09-clarify-date":
        assert value.get("version") == 1
        assert value.get("route") == "clarify"
        assert value.get("reason") == "missing-date"
        return
    if case_id == "e13-escalate-tutoring":
        assert value.get("version") == 1
        assert value.get("route") == "escalate"
        assert value.get("reason") == "tutoring"
        return
    raise AssertionError(f"No assertion defined for {case_id}")


def main() -> None:
    args = parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    wanted = [case.strip() for case in args.cases.split(",") if case.strip()]
    prompt_rows = {row["id"]: row for row in read_jsonl(args.prompts)}
    missing = [case for case in wanted if case not in prompt_rows]
    if missing:
        raise ValueError(f"Unknown evaluation cases: {missing}")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    results: list[dict[str, Any]] = []
    failures: list[str] = []

    for case_id in wanted:
        row = prompt_rows[case_id]
        encoded = tokenizer.apply_chat_template(
            row["messages"],
            add_generation_prompt=True,
            tokenize=True,
            return_tensors="pt",
            return_dict=True,
        )
        input_ids = encoded["input_ids"]
        attention_mask = encoded.get("attention_mask")

        with torch.inference_mode():
            generated = model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )

        new_tokens = generated[0, input_ids.shape[1] :]
        raw = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

        try:
            parsed = extract_json(raw)
            assert_case(case_id, parsed)
            passed = True
            error = None
        except Exception as exc:
            parsed = None
            passed = False
            error = f"{type(exc).__name__}: {exc}"
            failures.append(f"{case_id}: {error}")

        record = {
            "id": case_id,
            "passed": passed,
            "raw": raw,
            "parsed": parsed,
            "error": error,
        }
        results.append(record)
        print(json.dumps(record, ensure_ascii=False))

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in results) + "\n",
            encoding="utf-8",
        )

    passed = sum(1 for item in results if item["passed"])
    print(f"MYELIN Mini adapter generation gate: {passed}/{len(results)} passed")

    if failures:
        print("Failures:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
