#!/usr/bin/env python3
"""
LoRA/SFT trainer for MYELIN Mini.

Preparation:
  npm run build:myelin-mini-dataset

Dry-run validation (no ML dependencies required):
  python scripts/train-myelin-mini-qwen.py --dry-run

GPU training:
  pip install -r training/myelin-mini/requirements-train.txt
  python scripts/train-myelin-mini-qwen.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_MODEL = "principled-intelligence/Qwen3.5-0.8B-text-only"
DEFAULT_TRAIN = Path("training/myelin-mini/compiled/train-v1.jsonl")
DEFAULT_VALIDATION = Path("training/myelin-mini/compiled/validation-v1.jsonl")
DEFAULT_OUTPUT = Path("training/myelin-mini/output/qwen3.5-0.8b-lora-v1")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(
            f"{path} does not exist. Run npm run build:myelin-mini-dataset first."
        )

    rows: list[dict[str, Any]] = []
    for index, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSONL in {path}:{index}: {exc}") from exc
        if not isinstance(value, dict):
            raise ValueError(f"{path}:{index} must contain a JSON object.")
        rows.append(value)
    return rows


def validate_rows(rows: list[dict[str, Any]], label: str) -> dict[str, int]:
    if not rows:
        raise ValueError(f"{label} dataset is empty.")

    ids: set[str] = set()
    route_counts: dict[str, int] = {"actions": 0, "clarify": 0, "escalate": 0}

    for index, row in enumerate(rows, start=1):
        row_id = row.get("id")
        if not isinstance(row_id, str) or not row_id:
            raise ValueError(f"{label}:{index} has no id.")
        if row_id in ids:
            raise ValueError(f"Duplicate {label} id: {row_id}")
        ids.add(row_id)

        messages = row.get("messages")
        if not isinstance(messages, list) or len(messages) != 3:
            raise ValueError(f"{label}:{row_id} must have system/user/assistant messages.")

        expected_roles = ["system", "user", "assistant"]
        for message_index, (message, expected_role) in enumerate(
            zip(messages, expected_roles), start=1
        ):
            if not isinstance(message, dict):
                raise ValueError(f"{label}:{row_id} message {message_index} is invalid.")
            if message.get("role") != expected_role:
                raise ValueError(
                    f"{label}:{row_id} message {message_index} must be {expected_role}."
                )
            if not isinstance(message.get("content"), str) or not message["content"].strip():
                raise ValueError(
                    f"{label}:{row_id} message {message_index} has empty content."
                )

        try:
            target = json.loads(messages[-1]["content"])
        except json.JSONDecodeError as exc:
            raise ValueError(f"{label}:{row_id} assistant target is not JSON.") from exc

        if target.get("version") != 1:
            raise ValueError(f"{label}:{row_id} is missing protocol version 1.")

        route = target.get("route")
        if route not in route_counts:
            raise ValueError(f"{label}:{row_id} has unsupported route {route!r}.")
        route_counts[route] += 1

        request_id = target.get("requestId")
        if not isinstance(request_id, str) or not request_id:
            raise ValueError(f"{label}:{row_id} has no target requestId.")

        try:
            user_payload = json.loads(messages[1]["content"])
        except json.JSONDecodeError as exc:
            raise ValueError(f"{label}:{row_id} user message is not JSON.") from exc

        if user_payload.get("requestId") != request_id:
            raise ValueError(
                f"{label}:{row_id} user/assistant requestId mismatch."
            )

        if route == "actions":
            batch = target.get("batch")
            if not isinstance(batch, dict):
                raise ValueError(f"{label}:{row_id} action route has no batch.")
            if batch.get("version") != 1 or batch.get("requestId") != request_id:
                raise ValueError(f"{label}:{row_id} has an invalid action batch envelope.")
            actions = batch.get("actions")
            if not isinstance(actions, list) or not actions:
                raise ValueError(f"{label}:{row_id} action batch is empty.")
        elif route == "clarify":
            if not isinstance(target.get("reason"), str):
                raise ValueError(f"{label}:{row_id} clarification has no reason.")
            if not isinstance(target.get("question"), str) or not target["question"].endswith("?"):
                raise ValueError(f"{label}:{row_id} clarification must contain one question.")
            missing = target.get("missingFields")
            if not isinstance(missing, list) or not missing:
                raise ValueError(f"{label}:{row_id} clarification has no missingFields.")
        else:
            if not isinstance(target.get("reason"), str):
                raise ValueError(f"{label}:{row_id} escalation has no reason.")
            if not isinstance(target.get("note"), str) or len(target["note"]) < 10:
                raise ValueError(f"{label}:{row_id} escalation note is too short.")

    return route_counts


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune MYELIN Mini with LoRA SFT.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--train", type=Path, default=DEFAULT_TRAIN)
    parser.add_argument("--validation", type=Path, default=DEFAULT_VALIDATION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--epochs", type=float, default=4.0)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--gradient-accumulation", type=int, default=8)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    train_rows = read_jsonl(args.train)
    validation_rows = read_jsonl(args.validation)
    train_routes = validate_rows(train_rows, "train")
    validation_routes = validate_rows(validation_rows, "validation")

    if len(train_rows) < 80:
        raise ValueError("Combined MYELIN Mini training set should contain at least 80 rows.")
    if len(validation_rows) < 10:
        raise ValueError("Combined MYELIN Mini validation set should contain at least 10 rows.")
    for route in ("actions", "clarify", "escalate"):
        if train_routes[route] == 0 or validation_routes[route] == 0:
            raise ValueError(f"Both train and validation must cover route: {route}")

    print(
        "MYELIN Mini SFT data validated | "
        f"train={len(train_rows)} {train_routes} | "
        f"validation={len(validation_rows)} {validation_routes}"
    )

    if args.dry_run:
        print("dry-run=PASS")
        return

    # Heavy ML imports intentionally happen only after dry-run validation.
    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from trl import SFTConfig, SFTTrainer

    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for the MYELIN Mini LoRA training run.")

    args.output.mkdir(parents=True, exist_ok=True)

    train_dataset = Dataset.from_list(train_rows)
    validation_dataset = Dataset.from_list(validation_rows)

    use_bf16 = bool(torch.cuda.is_bf16_supported())
    training_args = SFTConfig(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        warmup_ratio=0.10,
        lr_scheduler_type="cosine",
        weight_decay=0.01,
        logging_steps=5,
        logging_first_step=True,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        report_to="none",
        seed=args.seed,
        data_seed=args.seed,
        max_length=args.max_length,
        assistant_only_loss=True,
        packing=False,
        gradient_checkpointing=True,
        bf16=use_bf16,
        fp16=not use_bf16,
    )

    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
    )

    trainer = SFTTrainer(
        model=args.model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        peft_config=peft_config,
    )

    result = trainer.train()
    trainer.save_model(str(args.output))

    processing_class = getattr(trainer, "processing_class", None)
    if processing_class is not None:
        processing_class.save_pretrained(str(args.output))

    metrics = dict(result.metrics)
    eval_metrics = trainer.evaluate()
    metrics.update({f"final_{key}": value for key, value in eval_metrics.items()})

    manifest = {
        "schemaVersion": 1,
        "baseModel": args.model,
        "method": "LoRA SFT",
        "trainFile": str(args.train),
        "validationFile": str(args.validation),
        "trainSha256": sha256_file(args.train),
        "validationSha256": sha256_file(args.validation),
        "trainRows": len(train_rows),
        "validationRows": len(validation_rows),
        "trainRoutes": train_routes,
        "validationRoutes": validation_routes,
        "epochs": args.epochs,
        "learningRate": args.learning_rate,
        "batchSize": args.batch_size,
        "gradientAccumulation": args.gradient_accumulation,
        "maxLength": args.max_length,
        "loraR": args.lora_r,
        "loraAlpha": args.lora_alpha,
        "seed": args.seed,
        "bf16": use_bf16,
        "metrics": metrics,
    }
    (args.output / "training-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    print(f"adapter={args.output}")
    print(f"training-manifest={args.output / 'training-manifest.json'}")


if __name__ == "__main__":
    main()
