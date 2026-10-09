"""Replay every saved v5 final/reasoning response and separately reviewed quality."""
import json
import runpy
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/run-assistant-phone-profiles.py'))
fresh, regression, settings, system, manifest, _, regression_manifest = helpers['load']()
base = ROOT / 'training/assistant-capability/phone-v5/results/20261009'
rows = [json.loads(line) for line in (base/'predictions.jsonl').read_text().splitlines()]
report = json.loads((base/'report.json').read_text())
provenance = json.loads((base/'provenance.json').read_text())
assert provenance['sourceCommit'] == '4c9d86bdc3721ec81a4c6c7d8d3e1291dfd5b2fa'
assert provenance['settings'] == settings and provenance['manifest'] == manifest
assert provenance['regressionManifest'] == regression_manifest
assert not provenance['releaseApproved'] and not provenance['phoneTested']
assert provenance['conversionManifest']['artifacts']['q4_k_m']['sha256'] == settings['modelSha256']
assert len(rows) == report['records'] == 44
assert not report['phoneTested'] and not report['releaseApproved']
for profile in settings['profiles']:
    props = json.loads((base/('server-props-'+profile['id']+'.json')).read_text())
    command = props['command']
    assert command[command.index('--reasoning-budget')+1] == str(profile['thinkingBudget'])
    assert command[command.index('-c')+1] == str(settings['contextTokens'])
    assert command[command.index('-t')+1] == str(settings['threads'])
    assert command[command.index('-ngl')+1] == '0'
    assert props['props']['default_generation_settings']['n_ctx'] == settings['contextTokens']
    for set_name, cases in [('fresh', fresh), ('observed-v4-regression', regression)]:
        selected = [row for row in rows if row['condition']==profile['id'] and row['set']==set_name]
        assert [(row['id'],row['turn']) for row in selected] == [(case['id'],index+1) for case in cases for index in range(len(case['turns']))]
        for case in cases:
            history = [{'role':'system','content':system}]
            for index, turn in enumerate(case['turns']):
                row = next(row for row in selected if row['id']==case['id'] and row['turn']==index+1)
                assert row['messages'] == history+[{'role':'user','content':turn['user']}]
                assert row['runtimeError'] is None
                assert row['score'] == helpers['HELPERS']['score'](turn,row['rawText'],None)
                assert len(row['officialTokenIds'])+profile['outputTokens'] <= settings['contextTokens']
                trace = row['detail']['trace']
                assert trace['officialTokenizerMatch'] and trace['exactPromptMatch']
                assert trace['serverRenderedPrompt'] == row['officialPrompt']
                envelope = row['detail']['rawEnvelope']
                assert len(envelope['choices']) == 1
                choice = envelope['choices'][0]
                assert choice['message']['content'] == row['rawText']
                assert envelope['usage']['completion_tokens'] <= profile['outputTokens']
                assert envelope['usage']['prompt_tokens'] == len(row['officialTokenIds'])
                assert row['detail']['outputAtLimit'] == (choice['finish_reason']=='length')
                assert row['detail']['reasoningPresent'] == bool(choice['message'].get('reasoning_content')) == profile['thinking']
                history += [{'role':'user','content':turn['user']},{'role':'assistant','content':row['rawText'] or '[unavailable]'}]
        group = report['conditions'][profile['id']+'/'+set_name]
        assert group == dict(turns=len(selected),patternPass=sum(row['score']['patternPass'] for row in selected),runtimeErrors=0,
            emptyFinal=sum(not bool(row['rawText'].strip()) for row in selected),
            outputAtLimit=sum(row['detail']['outputAtLimit'] for row in selected),
            reasoningPresent=sum(row['detail']['reasoningPresent'] for row in selected),
            medianCpuLatencyMs=statistics.median(row['latencyMs'] for row in selected))
review = json.loads((base/'review.json').read_text())
key = lambda row:(row['condition'],row['set'],row['id'],row['turn'])
assert len(review['notes'])==44 and {key(row) for row in review['notes']}=={key(row) for row in rows}
by_key = {key(row):row for row in rows}
for row in review['notes']:
    assert row['notes'] and all(isinstance(row[field],bool) for field in ['contentPass','usableFinal','strictPass'])
    assert not row['strictPass'] or (row['contentPass'] and row['usableFinal'] and by_key[key(row)]['score']['words']<=100)
    assert not by_key[key(row)]['detail']['outputAtLimit'] or not row['usableFinal']
for group, counts in review['counts'].items():
    selected = [row for row in review['notes'] if row['condition']+'/'+row['set']==group]
    assert counts == dict(turns=len(selected),contentPass=sum(row['contentPass'] for row in selected),
        usableFinal=sum(row['usableFinal'] for row in selected),strictPass=sum(row['strictPass'] for row in selected))
assert not review['releaseApproved'] and not review['phoneTested']
print('Verified all 44 saved v5 final/reasoning responses, frozen inputs, actual chat history, token parity, caps and separate quality review. No phone release approved.')
