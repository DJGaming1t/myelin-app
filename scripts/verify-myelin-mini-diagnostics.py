#!/usr/bin/env python3
"""Regression on saved v2 errors, including protocol-rejected action attempts."""
import json
from pathlib import Path
from diagnose_myelin_mini_predictions import diagnose, read_jsonl

root = Path('training/myelin-mini')
prior = root / 'baselines/qwen3.5-0.8b-lora-v2'
result = diagnose(read_jsonl(root / 'eval-v1.jsonl'), read_jsonl(prior / 'predictions.jsonl'), json.loads((prior / 'report.json').read_text()))
assert result['cases'] == 20 and result['gatePasses'] is False
assert len(result['validUnsafeActionIds']) == 2
assert len(result['protocolRejectedActionAttemptIds']) == 4
assert len(result['unexpectedActionAttemptIds']) == 6
assert result['expectedVsParsedRoute']['clarify']['invalid-output'] == 3
assert result['parsedActionTypeSequences']['create_topic']['create_task'] == 1
print('PASS: historical v2 diagnostic matches scored failures and surfaces four rejected action attempts.')
