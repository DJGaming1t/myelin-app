"""Frozen reference/conversion probe; never executes model-proposed actions."""
import hashlib
import json
import re
from pathlib import Path

from assistant_capability import ROOT as CAPABILITY_ROOT, load_suite, sha
from assistant_diagnostic import load_diagnostic

ROOT = CAPABILITY_ROOT / 'reference-v3'


def json_ready_metadata(value):
    """Normalize SDK metadata sets only; never repair or transform model outputs."""
    if isinstance(value, dict):
        return {key: json_ready_metadata(item) for key, item in value.items()}
    if isinstance(value, set):
        return sorted(value)
    if isinstance(value, (list, tuple)):
        return [json_ready_metadata(item) for item in value]
    return value


def load_reference():
    load_suite()
    load_diagnostic()
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    for path, digest in manifest['files'].items():
        if sha(ROOT / path) != digest:
            raise ValueError('Frozen reference input changed: ' + path)
    cases = [json.loads(line) for line in (ROOT / 'cases.jsonl').read_text().splitlines()]
    settings = json.loads((ROOT / 'settings.json').read_text())
    if len(cases) != 6 or len({c['id'] for c in cases}) != 6 or sum(len(c['turns']) for c in cases) != 8:
        raise ValueError('Incomplete reference probe')
    candidates = json.loads((CAPABILITY_ROOT / 'candidates.json').read_text())['models']
    native = next(c for c in candidates if c['id'] == 'qwen35-enhanced-int8')
    return cases, settings, (ROOT / 'system.txt').read_text(), manifest, native


def evaluate(turn, text, error, settings):
    errors = []
    if error:
        errors.append('runtime-error')
    elif not isinstance(text, str) or not text.strip() or len(text) > 3000:
        errors.append('invalid-text')
    else:
        if len(text.split()) > settings['maxWords']:
            errors.append('word-limit')
        if not re.search(turn['answerPattern'], text, re.I):
            errors.append('answer-check-mismatch')
    return dict(objectivePass=not errors, errors=errors, reviewRequired=True, reviewRubric=turn['review'])


def git_blob_sha(path):
    digest = hashlib.sha1(('blob ' + str(path.stat().st_size) + '\0').encode())
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()
