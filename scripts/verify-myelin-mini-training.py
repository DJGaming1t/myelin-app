"""Fast regression tests for dataset isolation, balance, and completion masks."""
import copy
import importlib.util
import json
import unittest
from pathlib import Path

from myelin_mini_training_audit import ACTION_TYPES, audit_balance, tokenize_and_audit

spec = importlib.util.spec_from_file_location('balanced', Path(__file__).with_name('build-myelin-mini-balanced.py'))
balanced = importlib.util.module_from_spec(spec)
spec.loader.exec_module(balanced)


def row(index, route, kind):
    decision = {'route': route}
    if route == 'actions':
        decision['batch'] = {'actions': [{'type': kind}]}
    else:
        decision['reason'] = kind
    return {'id': str(index), 'messages': [{'role': 'system', 'content': 'system'},
        {'role': 'user', 'content': json.dumps({'userRequest': 'request ' + str(index)})},
        {'role': 'assistant', 'content': json.dumps(decision)}]}


class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        assert kwargs['enable_thinking'] is False
        return [10, 11, 12] if len(messages) == 2 else [10, 11, 12, 20, 21]


class TrainingChecks(unittest.TestCase):
    def test_complete_target_and_mask(self):
        tokens, report = tokenize_and_audit([row(1, 'clarify', 'missing-target')], Tokenizer(), 5)
        self.assertEqual(report['failedRows'], 0)
        self.assertEqual(tokens[0]['completion_mask'], [0, 0, 0, 1, 1])
        self.assertEqual(len(tokens[0]['input_ids']), len(tokens[0]['completion_mask']))

    def test_one_token_over_limit_is_rejected_without_truncating(self):
        tokens, report = tokenize_and_audit([row(1, 'clarify', 'missing-target')], Tokenizer(), 4)
        self.assertEqual(report['failedRows'], 1)
        self.assertIn('target-would-be-truncated', report['details'][0]['problems'])
        self.assertEqual(len(tokens[0]['input_ids']), 5)

    def test_prefix_mismatch_and_empty_completion_rejected(self):
        class BadTokenizer(Tokenizer):
            def apply_chat_template(self, messages, **kwargs):
                return [10, 11, 12] if len(messages) == 2 else [10, 99]
        _, report = tokenize_and_audit([row(1, 'clarify', 'missing-target')], BadTokenizer(), 100)
        self.assertEqual(set(report['details'][0]['problems']), {'prompt-prefix-mismatch', 'empty-completion'})

    def test_practice_only_dataset_rejected(self):
        report = audit_balance([row(i, 'actions', 'create_task') for i in range(42)])
        self.assertTrue(report['problems'])

    def test_replay_preserves_sources_and_excludes_normalized_request_overlap(self):
        source = [row(i, 'actions', kind) for i, kind in enumerate(sorted(ACTION_TYPES))]
        source += [row(20, 'clarify', 'missing-target'), row(21, 'escalate', 'tutoring')]
        leaked = row(99, 'actions', 'create_task')
        source.append(leaked)
        original = copy.deepcopy(source)
        heldout = [{'input': {'userRequest': '  REQUEST 99!! '}}]
        first, manifest = balanced.build(source, [], heldout, [])
        second, _ = balanced.build(source, [], heldout, [])
        self.assertEqual(first, second)
        self.assertEqual(source, original)
        self.assertEqual(manifest['excludedRequestOverlapIds'], ['99'])
        self.assertEqual({r['sourceId'] for r in first}, {r['id'] for r in source[:-1]})
        self.assertEqual(len({r['id'] for r in first}), len(first))
        self.assertFalse(audit_balance(first)['problems'])
        for r in first:
            self.assertEqual(r['messages'], next(s for s in source if s['id'] == r['sourceId'])['messages'])

    def test_validation_overlap_fails(self):
        with self.assertRaisesRegex(ValueError, 'Validation requests overlap'):
            balanced.build([], [row(1, 'clarify', 'missing-date')], [{'input': {'userRequest': 'request 1'}}], [])


if __name__ == '__main__':
    unittest.main()
