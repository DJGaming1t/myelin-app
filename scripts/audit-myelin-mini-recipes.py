"""Measure historical recipe risks with the real tokenizer, without model weights."""
import argparse
import hashlib
import json
from pathlib import Path

from myelin_mini_training_audit import audit_balance, tokenize_and_audit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='principled-intelligence/Qwen3.5-0.8B-text-only')
    parser.add_argument('--output', type=Path, default=Path('artifacts/myelin-mini/training-audit/recipes.json'))
    args = parser.parse_args()
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    root = Path('training/myelin-mini/compiled')
    reports = {}
    for name, source, limit, take, thinking in [
        ('v1-default-template', 'train-v1', 1024, 0, None),
        ('v2-default-template', 'router-v2-train', 768, 0, None),
        ('v2-fast-default-template', 'router-v2-train', 512, 16, None),
        ('balanced-v3-no-thinking', 'balanced-v3-train', 768, 0, False),
    ]:
        path = root / (source + '.jsonl')
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        if take:
            rows = rows[:take]
        _, tokens = tokenize_and_audit(rows, tokenizer, limit, enable_thinking=thinking)
        reports[name] = {'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'balance': audit_balance(rows), 'tokens': tokens}
        print(name, 'rows=', len(rows), 'max-tokens=', tokens['maxTotalTokens'],
            'truncated=', sum('target-would-be-truncated' in r['problems'] for r in tokens['details']),
            'prefix-mismatches=', sum('prompt-prefix-mismatch' in r['problems'] for r in tokens['details']))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'model': args.model, 'reports': reports}, indent=2) + '\n')


if __name__ == '__main__':
    main()
