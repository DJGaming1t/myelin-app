"""Meaningful setup regressions before expensive phone profile inference."""
import json
import runpy
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
helpers=runpy.run_path(str(ROOT/'scripts/run-assistant-phone-profiles.py'))


class Profiles(unittest.TestCase):
    def test_frozen_identity_and_budget(self):
        fresh,regression,settings,system,manifest,original_settings,regression_manifest=helpers['load']()
        self.assertEqual(sum(len(case['turns']) for case in fresh),8)
        self.assertEqual(sum(len(case['turns']) for case in regression),14)
        self.assertTrue({case['id'] for case in fresh}.isdisjoint({case['id'] for case in regression}))
        self.assertEqual(settings['modelSha256'],'9fc94ee9249df1a818677d2147d58912f2d797a494f592255c7568a15d226e04')
        self.assertEqual(settings['runtimeLlamaCommit'],'6c8dcaa7ae41fa9f4aa2b3b68ee82cb8b2a03632')
        for profile in settings['profiles']:
            self.assertLess(profile['thinkingBudget'],profile['outputTokens'])
            self.assertLess(profile['outputTokens'],settings['contextTokens'])
        self.assertFalse(settings['releaseApproved']);self.assertFalse(settings['phoneTested'])

    def test_patterns_do_not_certify_semantics(self):
        score=helpers['HELPERS']['score']
        # Required digits are present even though the advice contradicts them.
        self.assertTrue(score({'all':['20']},'You are20minutes short, so cut10minutes.',None)['patternPass'])
        self.assertFalse(score({'all':['20']},'',None)['patternPass'])
        self.assertFalse(score({'all':['20']},'20','Runtime failed')['patternPass'])
        self.assertFalse(score({'all':['20']},'20 '+('deadline '*13),None)['patternPass'])


if __name__=='__main__':unittest.main()
