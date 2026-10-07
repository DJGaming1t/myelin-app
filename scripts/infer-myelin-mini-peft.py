#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def extract_json(text: str) -> Any:
    value = text.strip()
    if value.startswith("```"):
        lines = value.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        value = "\n".join(lines).strip()

    first = value.find("{")
    last = value.rfind("}")
    if first < 0 or last <= first:
        raise ValueError("No JSON object in generated output")
    return json.loads(value[first:last + 1])


def render_prompt(tokenizer: Any, messages: list[dict[str, str]]) -> str:
    kwargs = dict(tokenize=False, add_generation_prompt=True)
    try:
        return tokenizer.apply_chat_template(
            messages,
            enable_thinking=False,
            **kwargs,
        )
    except TypeError:
        return tokenizer.apply_chat_template(messages, **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--prompts", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-new-tokens", type=int, default=320)
    args = parser.parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    rows = read_jsonl(args.prompts)
    predictions: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=1):
        prompt = render_prompt(tokenizer, row["messages"])
        inputs = tokenizer(prompt, return_tensors="pt")
        started = time.perf_counter()

        with torch.inference_mode():
            generated = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )

        latency_ms = (time.perf_counter() - started) * 1000
        new_tokens = generated[0, inputs["input_ids"].shape[1]:]
        text = tokenizer.decode(new_tokens, skip_special_tokens=True)

        try:
            output = extract_json(text)
            parse_error = None
        except Exception as exc:
            output = {
                "version": 1,
                "requestId": row["requestId"],
                "route": "escalate",
                "confidence": 0,
                "reason": "low-confidence",
                "note": ("Inference JSON parse failed: " + str(exc))[:240],
            }
            parse_error = str(exc)

        predictions.append({
            "id": row["id"],
            "output": output,
            "latencyMs": latency_ms,
            "rawText": text,
            "parseError": parse_error,
        })
        print(
            f"[{index}/{len(rows)}] {row['id']} "
            f"{latency_ms:.0f}ms "
            f"parse={'ok' if parse_error is None else 'fail'}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(
            json.dumps(row, ensure_ascii=False) + "\n"
            for row in predictions
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
