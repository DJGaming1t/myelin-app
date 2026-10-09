"""Frozen, read-only native-runtime diagnostic; never an app action adapter."""
from __future__ import annotations

import json
import re
from pathlib import Path

from assistant_capability import ROOT as CAPABILITY_ROOT, load_suite, score, sha

ROOT = CAPABILITY_ROOT / 'diagnostic-v2'


def load_diagnostic():
    _, long_system, _ = load_suite()  # Keep the original frozen inputs intact.
    manifest = json.loads((ROOT/'manifest.json').read_text())
    for name, digest in manifest['files'].items():
        if sha(ROOT/name) != digest:
            raise ValueError('Frozen diagnostic input changed: '+name)
    cases = [json.loads(line) for line in (ROOT/'cases.jsonl').read_text().splitlines()]
    settings = json.loads((ROOT/'settings.json').read_text())
    if settings['engine']['cache'] not in [':memory', ':nocache']:
        raise ValueError('Unsupported native cache sentinel')
    if len(cases) != 4 or len({case['id'] for case in cases}) != 4 or sum(len(case['turns']) for case in cases) != 5:
        raise ValueError('Incomplete diagnostic cases')
    prompts = {'plain': (ROOT/'plain.txt').read_text(),
               'short-json': (ROOT/'short-json.txt').read_text(), 'long-json': long_system}
    return cases, settings, prompts, manifest


def native_response(value):
    """Preserve SDK output across 0.15 dict and 0.18 Message, without repair."""
    raw = value.to_json() if hasattr(value, 'to_json') else value
    if not isinstance(raw, dict) or raw.get('role') not in ['assistant', 'model'] or raw.get('tool_calls') or raw.get('channels'):
        raise ValueError('Unexpected native response envelope')
    content = raw.get('content')
    if isinstance(content, str):
        return raw, content
    if isinstance(content, list) and content and all(isinstance(part, dict) and part.get('type') == 'text' and isinstance(part.get('text'), str) for part in content):
        return raw, ''.join(part['text'] for part in content)
    raise ValueError('Unexpected native response content')


def evaluate(turn, text, prompt_id, runtime_error=None):
    if runtime_error:
        return {'valid': False, 'objectivePass': False, 'errors': ['native-runtime-error'], 'reviewRequired': True}
    if prompt_id != 'plain':
        expected = {'intent': 'reply', 'task': None, 'schedule': None, 'missingFields': []}
        return score({**turn, 'expect': expected}, text)
    valid = isinstance(text, str) and bool(text.strip()) and len(text) <= 3000
    errors = [] if valid else ['invalid-answer']
    if valid and re.search(turn['answerPattern'], text, re.I) is None:
        errors.append('answer-check-mismatch')
    return {'valid': valid, 'objectivePass': not errors, 'errors': errors,
            'reviewRequired': True, 'reviewRubric': turn['review']}
