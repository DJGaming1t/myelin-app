"""Validate frozen novel cases and source/budget isolation without model inference."""
import runpy
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
runner = runpy.run_path(str(ROOT/'scripts/run-assistant-stronger-phone.py'))


class StrongerPhoneProbe(unittest.TestCase):
    def test_frozen_cases_are_isolated(self):
        fresh, regression, settings, system, manifest, previous = runner['load']()
        self.assertEqual((len(fresh),sum(len(case['turns']) for case in fresh)),(8,10))
        self.assertEqual(sum(len(case['turns']) for case in regression),8)
        older = runpy.run_path(str(ROOT/'scripts/run-assistant-gguf.py'))['load_probe']()[0]
        self.assertTrue({case['id'] for case in fresh}.isdisjoint({case['id'] for case in regression+older}))
        self.assertTrue(all('rubric' in turn and 'user' in turn for case in fresh for turn in case['turns']))
        self.assertEqual(manifest['policy'],'Freeze before inference; no training or retries; observed v5 is regression only; every raw answer retained.')

    def test_phone_candidate_is_pinned_without_activation(self):
        _, _, settings, _, _, _ = runner['load']()
        self.assertEqual(settings['model']['revision'],'f9f88ac3e234be915e23811a6d28ea287bdb927e')
        self.assertEqual(settings['model']['sha256'],'25082a7dd3776cc3c741c6347d3bd04523f05796607b3fbc32fa3a25dfa1418c')
        self.assertEqual(settings['model']['bytes'],2707513696)
        self.assertEqual(settings['original']['revision'],'851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a')
        self.assertEqual(settings['runtimeLlamaCommit'],'6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632')
        self.assertEqual(settings['phoneLibrary'],'llama.rn@0.12.9')
        self.assertFalse(settings['releaseApproved'])
        self.assertFalse(settings['phoneTested'])
        self.assertEqual(len(settings['profiles']),2)
        for profile in settings['profiles']:
            self.assertLess(profile['thinkingBudget'],profile['outputTokens'])
            self.assertLess(profile['outputTokens'],settings['contextTokens'])
        self.assertEqual(settings['sampler']['presence_penalty'],1.5)
        self.assertEqual(settings['sampler']['temperature'],1)

    def test_tampered_or_replaced_download_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'model.gguf'
            path.write_bytes(b'valid')
            digest = hashlib.sha256(b'valid').hexdigest()
            settings = {'model':dict(repo='probe/model',revision='pinned',file='model.gguf',bytes=5,sha256=digest)}
            entry = SimpleNamespace(rfilename='model.gguf',size=5,lfs=SimpleNamespace(sha256=digest))
            info = SimpleNamespace(sha='pinned',siblings=[entry])
            download = Mock(return_value=str(path))
            module = SimpleNamespace(HfApi=lambda:SimpleNamespace(model_info=lambda *args,**kwargs:info),hf_hub_download=download)
            with patch.dict(sys.modules,{'huggingface_hub':module}):
                self.assertEqual(runner['download_model'](settings),path)
                path.write_bytes(b'wrong')
                with self.assertRaisesRegex(ValueError,'Downloaded GGUF identity mismatch'):
                    runner['download_model'](settings)
                info.sha = 'replacement'
                download.reset_mock()
                with self.assertRaisesRegex(ValueError,'revision mismatch'):
                    runner['download_model'](settings)
                download.assert_not_called()
                info.sha = 'pinned'; entry.lfs.sha256 = 'changed'
                with self.assertRaisesRegex(ValueError,'Published GGUF identity mismatch'):
                    runner['download_model'](settings)
                download.assert_not_called()


if __name__=='__main__': unittest.main()
