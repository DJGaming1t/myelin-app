import unittest

from assistant_reference import evaluate, load_reference


class ReferenceTests(unittest.TestCase):
    def test_frozen_conditions(self):
        cases, settings, _, manifest, native = load_reference()
        self.assertEqual(sum(len(c['turns']) for c in cases) * len(settings['conditions']), 24)
        self.assertEqual(manifest['turnsPerCondition'], 8)
        self.assertEqual(settings['conditions'], ['hf-official', 'native-bundled', 'native-official-raw'])
        self.assertEqual(native['sha256'], '8ae5027136e0b89039ed76eedfb61f0cf4b7277024d99bf765359264295b86b1')

    def test_runtime_error_and_bounds(self):
        cases, settings, _, _, _ = load_reference()
        turn = cases[0]['turns'][0]
        self.assertTrue(evaluate(turn, '63', None, settings)['objectivePass'])
        self.assertFalse(evaluate(turn, '63', 'native failed', settings)['objectivePass'])
        self.assertFalse(evaluate(turn, '633333', None, settings)['objectivePass'])
        self.assertFalse(evaluate(turn, '', None, settings)['objectivePass'])

    def test_patterns_are_not_semantic_approval(self):
        cases, settings, _, _, _ = load_reference()
        score = evaluate(cases[2]['turns'][0], 'Ice is more dense than water.', None, settings)
        self.assertTrue(score['objectivePass'])
        self.assertTrue(score['reviewRequired'])
        topic = cases[-1]['turns'][-1]
        self.assertFalse(evaluate(topic, 'Topic: osmosis', None, settings)['objectivePass'])


if __name__ == '__main__':
    unittest.main()
