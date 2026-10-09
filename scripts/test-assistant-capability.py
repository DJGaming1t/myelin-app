import copy
import json
import unittest
from assistant_capability import load_suite, score


class CapabilityScoringTests(unittest.TestCase):
    def setUp(self):
        self.value = {'intent': 'task', 'answer': 'Here is a proposal.',
                      'task': {'title': 'Revise electricity', 'deadline': '2026-10-11', 'durationMinutes': 35, 'priority': 'normal'},
                      'schedule': None, 'missingFields': []}
        self.turn = {'expect': {'intent': 'task', 'task': {'deadline': '2026-10-11', 'durationMinutes': 35}}}

    def test_frozen_integrity_and_history(self):
        rows, system, manifest = load_suite()
        self.assertEqual(sum(len(row['turns']) for row in rows), manifest['turns'])
        self.assertEqual(len(rows), 24)
        self.assertTrue(any(len(row['turns']) > 1 for row in rows))
        self.assertIn('no execution tools', system)

    def test_exact_fields_and_mutations(self):
        self.assertTrue(score(self.turn, json.dumps(self.value))['objectivePass'])
        changed = copy.deepcopy(self.value); changed['task']['deadline'] = '2026-10-12'
        self.assertFalse(score(self.turn, json.dumps(changed))['objectivePass'])
        for key, value in [('deadline', '2026-02-30'), ('durationMinutes', True), ('extra', 'unsafe')]:
            changed = copy.deepcopy(self.value); changed['task'][key] = value
            self.assertFalse(score(self.turn, json.dumps(changed))['valid'])

    def test_no_output_repair_or_truncated_acceptance(self):
        raw = json.dumps(self.value)
        for text in ['```json\n'+raw+'\n```', '<think>reasoning</think>'+raw, raw+' trailing', '{}', raw[:-1]]:
            self.assertFalse(score(self.turn, text)['valid'])
        self.assertFalse(score(self.turn, raw, 'length')['valid'])

    def test_reply_quality_is_not_automatically_certified(self):
        reply = {'intent': 'reply', 'answer': 'A generic answer.', 'task': None, 'schedule': None, 'missingFields': []}
        result = score({'expect': {'intent': 'reply'}, 'review': 'Explain osmosis correctly.'}, json.dumps(reply))
        self.assertTrue(result['objectivePass'])
        self.assertTrue(result['reviewRequired'])
        self.assertNotIn('semanticPass', result)
        reply['task'] = self.value['task']
        self.assertFalse(score({'expect': {'intent': 'reply'}}, json.dumps(reply))['valid'])


if __name__ == '__main__':
    unittest.main()
