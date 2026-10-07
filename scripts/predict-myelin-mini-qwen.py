#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSONL at {path}:{index}: {exc}") from exc
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{index} must contain a JSON object.")
        rows.append(value)
    return rows


def extract_json(text: str) -> Any:
    stripped = text.strip()
    fence = chr(96) * 3
    if stripped.startswith(fence):
        if stripped.startswith(fence + "json"):
            stripped = stripped[len(fence + "json") :].strip()
        else:
            stripped = stripped[len(fence) :].strip()
        if stripped.endswith(fence):
            stripped = stripped[: -len(fence)].strip()

    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)

    first = stripped.find("{")
    last = stripped.rfind("}")
    if first >= 0 and last > first:
        return json.loads(stripped[first : last + 1])

    raise ValueError("Model response did not contain a JSON object.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the MYELIN Mini hold-out through a Qwen LoRA adapter."
    )
    parser.add_argument(
        "--model",
        default="principled-intelligence/Qwen3.5-0.8B-text-only",
    )
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument(
        "--prompts",
        type=Path,
        default=Path("training/myelin-mini/compiled/eval-prompts-v1.jsonl"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/myelin-mini/predictions-v1.jsonl"),
    )
    parser.add_argument("--max-new-tokens", type=int, default=700)
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    prompts = read_jsonl(args.prompts)
    if args.limit > 0:
        prompts = prompts[: args.limit]
    if not prompts:
        raise ValueError("MYELIN Mini evaluation prompt set is empty.")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    base = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    predictions: list[dict[str, Any]] = []
    with torch.inference_mode():
        for index, row in enumerate(prompts, start=1):
            messages = row.get("messages")
            if not isinstance(messages, list):
                raise ValueError(f"{row.get('id')} has invalid messages.")

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
            generated = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )
            latency_ms = (time.perf_counter() - started) * 1000.0

            new_tokens = generated[0, inputs["input_ids"].shape[1] :]
            raw_text = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

            try:
                output = extract_json(raw_text)
            except Exception as exc:
                output = {
                    "__invalidModelOutput": raw_text[:4000],
                    "__parseError": str(exc),
                }

            predictions.append(
                {
                    "id": row["id"],
                    "output": output,
                    "latencyMs": latency_ms,
                    "rawText": raw_text,
                }
            )
            print(
                f"[{index}/{len(prompts)}] {row['id']} "
                f"{latency_ms:.0f}ms {raw_text[:160]!r}"
            )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in predictions),
        encoding="utf-8",
    )
    print(f"predictions={args.output}")


if __name__ == "__main__":
    main()
