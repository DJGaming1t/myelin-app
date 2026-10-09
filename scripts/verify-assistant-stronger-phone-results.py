"""Replay the untouched v6 phone-capability evidence before accepting an inference run.

This verifies the *measurement*, not semantic correctness or Android suitability.
It never approves, activates or edits any model or app setting.
"""
import argparse
import json
import runpy
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def verify(folder, root=ROOT):
    runner = runpy.run_path(str(root / 'scripts/run-assistant-stronger-phone.py'))
    fresh, regression, settings, system, manifest, regression_manifest = runner['load']()
    evidence = json.loads((folder / 'provenance.json').read_text())
    report = json.loads((folder / 'report.json').read_text())
    rows = [json.loads(line) for line in (folder / 'predictions.jsonl').read_text().splitlines()]
    assert evidence['settings'] == settings and evidence['manifest'] == manifest, 'Frozen source mismatch'
    assert evidence['regressionManifest'] == regression_manifest, 'Historical regression source mismatch'
    assert evidence['sourceCommit'] and evidence['runtimeBinarySha256'] and evidence['runtimeQwenSourceSha256'], 'Missing provenance'
    assert evidence['phoneTested'] is False and evidence['releaseApproved'] is False, 'Premature release marker'
    assert evidence['trainedAdapter'] is False and report['phoneTested'] is False and report['releaseApproved'] is False
    assert len(rows) == report['records'] == 36, 'Partial or duplicated inference output'
    assert len(settings['profiles']) == 2
    expected_groups = {}
    offset = 0
    for profile in settings['profiles']:
        props = json.loads((folder / ('server-props-' + profile['id'] + '.json')).read_text())
        command = props['command']
        for key, wanted in [('--reasoning-budget', profile['thinkingBudget']), ('-c', settings['contextTokens']),
                            ('-t', settings['threads']), ('-ngl', 0)]:
            assert key in command and command[command.index(key) + 1] == str(wanted), 'Unpinned server setting: ' + key
        assert props['props']['default_generation_settings']['n_ctx'] == settings['contextTokens']
        for set_name, cases in [('fresh', fresh), ('observed-v5-regression', regression)]:
            selected = rows[offset:offset + sum(len(c['turns']) for c in cases)]
            offset += len(selected)
            history_by_case = {}
            for case in cases:
                history_by_case[case['id']] = [{'role': 'system', 'content': system}]
                for turn_no, turn in enumerate(case['turns'], 1):
                    row = selected.pop(0)
                    assert (row['condition'], row['set'], row['id'], row['turn']) == (profile['id'], set_name, case['id'], turn_no), 'Wrong turn/order'
                    history = history_by_case[case['id']]
                    expected_messages = history + [{'role': 'user', 'content': turn['user']}]
                    assert row['messages'] == expected_messages, 'History/recent correction mismatch'
                    assert row['runtimeError'] is None, 'Inference/runtime failure'
                    assert isinstance(row['rawText'], str), 'Invalid final reply field'
                    assert row['score'] == runner['HELPERS']['score'](turn, row['rawText'], None), 'Score mismatch'
                    assert row['score']['semanticReviewed'] is False, 'Automated patterns cannot certify semantics'
                    assert len(row['officialTokenIds']) + profile['outputTokens'] <= settings['contextTokens'], 'Prompt exceeds context'
                    trace = row['detail']['trace']
                    assert trace['exactPromptMatch'] is True and trace['officialTokenizerMatch'] is True
                    assert trace['serverRenderedPrompt'] == row['officialPrompt'], 'Template mismatch'
                    envelope = row['detail']['rawEnvelope']
                    assert len(envelope['choices']) == 1, 'Unexpected number of responses'
                    choice = envelope['choices'][0]
                    assert (choice['message'].get('content') or '') == row['rawText'], 'Edited final reply'
                    assert envelope['usage']['completion_tokens'] <= profile['outputTokens'], 'Completion overflow'
                    assert envelope['usage']['prompt_tokens'] == len(row['officialTokenIds']), 'Token accounting mismatch'
                    assert row['detail']['outputAtLimit'] == (choice['finish_reason'] == 'length')
                    assert row['detail']['reasoningPresent'] == bool(choice['message'].get('reasoning_content'))
                    payload = row['detail']['requestedPayload']
                    assert all(payload[name] == val for name, val in settings['sampler'].items()), 'Sampler changed'
                    assert payload['max_tokens'] == profile['outputTokens'] and payload['seed'] == settings['seed']
                    assert payload['messages'] == expected_messages and payload['stream'] is False
                    assert payload['chat_template_kwargs'] == {'enable_thinking': profile['thinking']}
                    assert payload['reasoning_effort'] == ('high' if profile['thinking'] else 'none')
                    assert row['latencyMs'] >= 0, 'Negative CPU timing'
                    history.extend([{'role':'user','content':turn['user']},
                                    {'role':'assistant','content':row['rawText'] or '[unavailable]'}])
            assert not selected, 'Extra unaccounted turns'
            group_rows = [r for r in rows if r['condition'] == profile['id'] and r['set'] == set_name]
            expected_groups[profile['id'] + '/' + set_name] = dict(
                turns=len(group_rows), patternPass=sum(r['score']['patternPass'] for r in group_rows),
                runtimeErrors=0, emptyFinal=sum(not r['rawText'].strip() for r in group_rows),
                outputAtLimit=sum(r['detail']['outputAtLimit'] for r in group_rows),
                reasoningPresent=sum(r['detail']['reasoningPresent'] for r in group_rows),
                medianCpuLatencyMs=statistics.median(r['latencyMs'] for r in group_rows))
    assert offset == len(rows), 'Unaccounted evidence'
    assert report['conditions'] == expected_groups, 'Summary does not replay raw evidence'
    return dict(passed=True, records=len(rows), profiles=[p['id'] for p in settings['profiles']],
                freshTurns=10, observedRegressionTurns=8,
                patterns={k:v['patternPass'] for k,v in expected_groups.items()},
                semanticReviewed=False, phoneTested=False, releaseApproved=False,
                note='All recorded turns and official tokenizer traces replayed. Pattern scores are NOT qualitative approval. No Android execution was tested.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    args.input.mkdir(parents=True, exist_ok=True)
    result = None
    try:
        result = verify(args.input)
    except Exception as exc:
        result = dict(passed=False, error=type(exc).__name__ + ': ' + str(exc),
                      semanticReviewed=False, phoneTested=False, releaseApproved=False)
    (args.input / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
    if not result['passed']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
