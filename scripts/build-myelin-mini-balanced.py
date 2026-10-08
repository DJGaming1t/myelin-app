"""Build a reproducible general-route replay set; never train on evaluation requests."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import re
from collections import defaultdict
from pathlib import Path

from myelin_mini_training_audit import ACTION_TYPES, audit_balance


def read(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def fingerprint(row):
    payload = json.loads(row['messages'][1]['content']) if 'messages' in row else row['input']
    return ' '.join(re.findall(r'\w+', payload['userRequest'].casefold()))


def build(train, validation, holdout, acceptance, seed=42):
    evaluation_requests = {fingerprint(row) for row in holdout + acceptance}
    if any(fingerprint(row) in evaluation_requests for row in validation):
        raise ValueError('Validation requests overlap evaluation; repair the validation split first')
    reserved = {fingerprint(row) for row in validation + holdout + acceptance}
    excluded = [row['id'] for row in train if fingerprint(row) in reserved]
    clean = [row for row in train if fingerprint(row) not in reserved]
    buckets = defaultdict(list)
    for row in clean:
        d = json.loads(row['messages'][2]['content'])
        key = ('actions', d['batch']['actions'][0]['type']) if d['route'] == 'actions' else (d['route'], d['reason'])
        buckets[key].append(row)
    if {key[1] for key in buckets if key[0] == 'actions'} != ACTION_TYPES:
        raise ValueError('General replay source must cover all five action types')
    for route in ('clarify', 'escalate'):
        if not any(k[0] == route for k in buckets):
            raise ValueError(f'Missing {route} source examples')
    action_rows = sum(max(12, len(rows)) for key, rows in buckets.items() if key[0] == 'actions')
    rng = random.Random(seed)
    result = []
    counts = {}
    for key, source in sorted(buckets.items()):
        source = sorted(source, key=lambda r: r['id'])
        rng.shuffle(source)
        reason_count = sum(k[0] == key[0] for k in buckets)
        target = max(12, len(source)) if key[0] == 'actions' else max(len(source), math.ceil(action_rows / (2 * reason_count)))
        counts['/'.join(key)] = {'uniqueSources': len(source), 'trainingRows': target}
        for i in range(target):
            original = source[i % len(source)]
            row = copy.deepcopy(original)
            row['sourceId'] = original['id']
            row['id'] = f"balanced-{original['id']}-{i // len(source)}"
            result.append(row)
    rng.shuffle(result)
    balance = audit_balance(result)
    if balance['problems']:
        raise ValueError(balance['problems'])
    return result, {'seed': seed, 'uniqueTrainingSources': len(clean), 'excludedRequestOverlapIds': excluded,
        'buckets': counts, 'balance': balance, 'note': 'Minority examples are replayed, not new independent examples. Validation remains unweighted.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('training/myelin-mini'))
    args = parser.parse_args()
    root = args.root
    train = read(root / 'compiled/train-v1.jsonl')
    validation = read(root / 'compiled/validation-v1.jsonl')
    holdout = read(root / 'eval-v1.jsonl')
    acceptance = read(root / 'acceptance-v1.jsonl')
    rows, manifest = build(train, validation, holdout, acceptance)
    for name, values in [('balanced-v3-train', rows), ('balanced-v3-validation', validation)]:
        (root / f'compiled/{name}.jsonl').write_text(''.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n' for r in values))
    manifest['sourceSha256'] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
        for name in ['compiled/train-v1.jsonl', 'compiled/validation-v1.jsonl', 'eval-v1.jsonl', 'acceptance-v1.jsonl']}
    (root / 'compiled/balanced-v3-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
