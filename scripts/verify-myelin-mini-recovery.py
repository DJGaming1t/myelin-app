"""Verify evaluation-only recovery matches the final v4 training inputs."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

SOURCE = '0c0b68713e835932402b591edd336476cf7165b8'
MODEL = 'principled-intelligence/Qwen3.5-0.8B-text-only'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(root: Path, adapter: Path) -> dict:
    manifest = json.loads((adapter / 'training-manifest.json').read_text())
    assert (adapter / 'code-commit.txt').read_text().strip() == SOURCE, 'Wrong training source'
    assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == SOURCE, 'Evaluation source drift'
    assert (adapter / 'adapter_model.safetensors').is_file(), 'Missing final export'
    assert manifest['baseModel'] == MODEL and manifest['resumeAdapter'] is None, 'Wrong base or resumed adapter'
    assert manifest['runTrainRows'] == 255 and manifest['runValidationRows'] == 29
    assert manifest['epochs'] == 2 and manifest['maxSteps'] == -1 and not manifest['smokeMode']
    assert manifest['preflight']['passes'] and manifest['preflight']['enableThinking'] is False
    for field, name in [('trainSha256', 'balanced-v3-train.jsonl'), ('validationSha256', 'balanced-v3-validation.jsonl')]:
        assert digest(root / 'training/myelin-mini/compiled' / name) == manifest[field], f'{field} drift'
    for saved, rebuilt in [('dataset-manifest.json', 'compiled/balanced-v3-manifest.json'), ('frozen-evaluation-manifest.json', 'eval-v2-manifest.json')]:
        assert json.loads((adapter / saved).read_text()) == json.loads((root / 'training/myelin-mini' / rebuilt).read_text()), f'{saved} drift'
    frozen = json.loads((adapter / 'frozen-evaluation-manifest.json').read_text())
    assert digest(root / 'training/myelin-mini/eval-v2.jsonl') == frozen['sha256']
    checksums = {name: digest(root / name) for name in [
        'training/myelin-mini/eval-v1.jsonl', 'training/myelin-mini/eval-v2.jsonl',
        'training/myelin-mini/acceptance-v1.jsonl', 'scripts/infer-myelin-mini-peft.py',
        'scripts/export-myelin-mini-eval-prompts.ts', 'scripts/score-myelin-mini-predictions.ts',
        'src/features/assistant/myelin-mini.ts', 'src/features/assistant/myelin-mini-evaluation.ts']}
    return {'passes': True, 'sourceCommit': SOURCE, 'adapterSha256': digest(adapter / 'adapter_model.safetensors'),
        'inputChecksums': checksums, 'trainingManifest': manifest,
        'note': 'Only final export; no training or checkpoint selection. Frozen labels and scorer unchanged.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--adapter', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.root, args.adapter)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print('PASS: final adapter, pinned source, regenerated training hashes and frozen evaluation provenance.')


if __name__ == '__main__':
    main()
