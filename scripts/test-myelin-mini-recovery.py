"""Regression coverage for evidence isolation in evaluation-only recovery."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('verify-myelin-mini-recovery.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.adapter = self.root / 'adapter'
        self.adapter.mkdir()
        self.data = self.root / 'training/myelin-mini'
        (self.data / 'compiled').mkdir(parents=True)
        for name in ['eval-v1.jsonl', 'eval-v2.jsonl', 'acceptance-v1.jsonl', 'compiled/balanced-v3-train.jsonl', 'compiled/balanced-v3-validation.jsonl']:
            (self.data / name).write_text(name)
        for name in ['scripts/infer-myelin-mini-peft.py', 'scripts/export-myelin-mini-eval-prompts.ts', 'scripts/score-myelin-mini-predictions.ts', 'src/features/assistant/myelin-mini.ts', 'src/features/assistant/myelin-mini-evaluation.ts']:
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(name)
        self.manifest = {'baseModel': recovery.MODEL, 'resumeAdapter': None, 'runTrainRows': 255, 'runValidationRows': 29,
            'epochs': 2, 'maxSteps': -1, 'smokeMode': False, 'preflight': {'passes': True, 'enableThinking': False},
            'trainSha256': recovery.digest(self.data / 'compiled/balanced-v3-train.jsonl'),
            'validationSha256': recovery.digest(self.data / 'compiled/balanced-v3-validation.jsonl')}
        self.save_manifest()
        (self.adapter / 'adapter_model.safetensors').write_bytes(b'final adapter fixture')
        (self.adapter / 'code-commit.txt').write_text(recovery.SOURCE + '\n')
        for saved, rebuilt, value in [('dataset-manifest.json', 'compiled/balanced-v3-manifest.json', {'seed': 42}),
            ('frozen-evaluation-manifest.json', 'eval-v2-manifest.json', {'sha256': recovery.digest(self.data / 'eval-v2.jsonl')})]:
            (self.adapter / saved).write_text(json.dumps(value))
            (self.data / rebuilt).write_text(json.dumps(value))
        self.git = patch.object(recovery.subprocess, 'check_output', return_value=recovery.SOURCE + '\n')
        self.git.start()
        self.addCleanup(self.git.stop)

    def save_manifest(self):
        (self.adapter / 'training-manifest.json').write_text(json.dumps(self.manifest))

    def verify(self):
        return recovery.verify(self.root, self.adapter)

    def test_matching_inputs_produce_checksums(self):
        result = self.verify()
        self.assertTrue(result['passes'])
        self.assertEqual(len(result['inputChecksums']), 8)
        self.assertEqual(result['adapterSha256'], recovery.digest(self.adapter / 'adapter_model.safetensors'))

    def test_changed_training_or_frozen_data_rejected(self):
        for name in ['compiled/balanced-v3-train.jsonl', 'compiled/balanced-v3-validation.jsonl', 'eval-v2.jsonl']:
            with self.subTest(name=name):
                file = self.data / name
                original = file.read_bytes()
                file.write_bytes(original + b' altered')
                with self.assertRaises(AssertionError): self.verify()
                file.write_bytes(original)

    def test_wrong_or_resumed_candidate_rejected(self):
        for field, value in [('baseModel', 'different-model'), ('resumeAdapter', 'checkpoint'), ('runTrainRows', 16), ('smokeMode', True), ('epochs', 1)]:
            with self.subTest(field=field):
                original = self.manifest[field]
                self.manifest[field] = value
                self.save_manifest()
                with self.assertRaises(AssertionError): self.verify()
                self.manifest[field] = original
                self.save_manifest()

    def test_wrong_source_or_missing_final_export_rejected(self):
        with patch.object(recovery.subprocess, 'check_output', return_value='new-code\n'):
            with self.assertRaises(AssertionError): self.verify()
        (self.adapter / 'adapter_model.safetensors').unlink()
        with self.assertRaises(AssertionError): self.verify()

    def test_manifest_and_thinking_drift_rejected(self):
        (self.data / 'compiled/balanced-v3-manifest.json').write_text('{"seed":43}')
        with self.assertRaises(AssertionError): self.verify()
        (self.data / 'compiled/balanced-v3-manifest.json').write_text('{"seed":42}')
        self.manifest['preflight']['enableThinking'] = True
        self.save_manifest()
        with self.assertRaises(AssertionError): self.verify()


if __name__ == '__main__':
    unittest.main()
