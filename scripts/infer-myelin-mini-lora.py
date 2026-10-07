#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


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
            raise ValueError(f"{path}:{index} must contain an object")
        rows.append(value)
    return rows


def extract_json(text: str) -> Any:
    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)
    first = stripped.find("{")
    last = stripped.rfind("}")
    if first >= 0 and last > first:
        return json.loads(stripped[first:last + 1])
    raise ValueError("No JSON object found in model output")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--adapter", type=Path, required=True)
    parser.add_argument("--eval-file", type=Path, default=Path("training/myelin-mini/eval-v1.jsonl"))
    parser.add_argument("--compiled-train", type=Path, default=Path("training/myelin-mini/compiled/train-v1.jsonl"))
    parser.add_argument("--predictions-out", type=Path, required=True)
    parser.add_argument("--max-new-tokens", type=int, default=384)
    parser.add_argument("--case-ids", default="")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    eval_rows = read_jsonl(args.eval_file)

    if args.case_ids.strip():
        wanted = {value.strip() for value in args.case_ids.split(",") if value.strip()}
        eval_rows = [row for row in eval_rows if row.get("id") in wanted]
        if len(eval_rows) != len(wanted):
            found = {row.get("id") for row in eval_rows}
            missing = sorted(wanted - found)
            raise ValueError(f"Unknown evaluation cases: {missing}")

    compiled = read_jsonl(args.compiled_train)
    if not compiled:
        raise ValueError("Compiled training data is empty")
    system_message = compiled[0]["messages"][0]["content"]

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.float32,
        low_cpu_mem_usage=True,
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base, str(args.adapter))
    model.eval()

    predictions: list[dict[str, Any]] = []

    for row in eval_rows:
        output = row["output"]
        request_id = output["requestId"]
        inp = row["input"]
        messages = [
            {"role": "system", "content": system_message},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "requestId": request_id,
                        "currentDate": inp["currentDate"],
                        "userRequest": inp["userRequest"],
                        "context": inp.get("context", {}),
                    },
                    separators=(",", ":"),
                ),
            },
        ]

        prompt = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        encoded = tokenizer(prompt, return_tensors="pt")

        started = time.perf_counter()
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
            )
        latency_ms = (time.perf_counter() - started) * 1000

        new_tokens = generated[0, encoded["input_ids"].shape[1]:]
        generated_text = tokenizer.decode(new_tokens, skip_special_tokens=True)

        try:
            parsed = extract_json(generated_text)
        except Exception as exc:
            parsed = {
                "version": 1,
                "requestId": request_id,
                "route": "escalate",
                "confidence": 0,
                "reason": "low-confidence",
                "note": f"Fine-tuned benchmark output was invalid JSON: {exc}"[:240],
            }

        predictions.append(
            {
                "id": row["id"],
                "output": parsed,
                "latencyMs": latency_ms,
                "rawText": generated_text,
            }
        )
        print(f"{row['id']}: {latency_ms:.0f}ms -> {generated_text[:240]!r}")

    args.predictions_out.parent.mkdir(parents=True, exist_ok=True)
    args.predictions_out.write_text(
        "\n".join(json.dumps(item, ensure_ascii=False) for item in predictions) + "\n",
        encoding="utf-8",
    )
    print(f"predictions={args.predictions_out}")


if __name__ == "__main__":
    main()
