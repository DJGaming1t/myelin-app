"""Replay frozen v4 predictions, scoring, provenance and qualitative counts."""
import json
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
helpers = runpy.run_path(str(ROOT / 'scripts/run-assistant-gguf.py'))
cases, settings, system, manifest = helpers['load_probe']()
base = ROOT / 'training/assistant-capability/gguf-v4/results/20261009'
case_by_id = {case['id']:case for case in cases}
all_rows = []
for folder, expected_conditions in [('original',['hf-bf16']),('gguf',['gguf-q8_0','gguf-q4_k_m'])]:
    location = base / folder
    rows = [json.loads(line) for line in (location/'predictions.jsonl').read_text().splitlines()]
    report = json.loads((location/'report.json').read_text())
    provenance = json.loads((location/'provenance.json').read_text())
    assert provenance['settings']==settings and provenance['manifest']==manifest
    assert provenance['sourceCommit']=='44d85491e84e5ee51b1e3a4e631c62573bf10aaf'
    assert provenance['releaseApproved'] is False and provenance['phoneTested'] is False
    assert sorted({row['condition'] for row in rows})==sorted(expected_conditions)
    assert len(rows)==14*len(expected_conditions)==report['records']
    assert provenance['originalFiles'][settings['original']['weightsFile']]==dict(bytes=settings['original']['sizeBytes'],sha256=settings['original']['sha256'])
    for condition in expected_conditions:
        selected = [row for row in rows if row['condition']==condition]
        assert [(row['id'],row['turn']) for row in selected]==[(case['id'],turn+1) for case in cases for turn in range(len(case['turns']))]
        for case in cases:
            history=[{'role':'system','content':system}]
            for index,turn in enumerate(case['turns']):
                row=next(row for row in selected if row['id']==case['id'] and row['turn']==index+1)
                assert row['messages']==history+[{'role':'user','content':turn['user']}]
                assert row['score']==helpers['score'](turn,row['rawText'],row['runtimeError'])
                assert row['runtimeError'] is None
                assert len(row['officialTokenIds'])+settings['outputTokens']<=settings['contextTokens']
                assert row['detail']['generatedTokens']<=settings['outputTokens']
                if condition.startswith('gguf-'):
                    assert row['detail']['exactTokenizerMatch'] is True
                    envelope=row['detail']['rawEnvelope']
                    assert envelope['content']==row['rawText']
                    actual=envelope['generation_settings']
                    for key,value in dict(seed=0,temperature=0,top_k=1,top_p=1,min_p=0,repeat_penalty=1,presence_penalty=0,frequency_penalty=0,n_predict=192,samplers=['temperature'],grammar='').items():
                        assert actual[key]==value, (key,actual[key])
                    assert actual['lora']==[]
                history += [{'role':'user','content':turn['user']},{'role':'assistant','content':row['rawText'] or '[unavailable]'}]
        group=report['conditions'][condition]
        assert group['turns']==len(selected)
        assert group['patternPass']==sum(row['score']['patternPass'] for row in selected)
        assert group['runtimeErrors']==sum(row['runtimeError'] is not None for row in selected)
        assert group['outputAtLimit']==sum(row['detail']['outputAtLimit'] for row in selected)
    all_rows+=rows
conversion=json.loads((base/'gguf/model-manifest.json').read_text())
assert conversion['original']==settings['original'] and conversion['llamaCommit']==settings['llamaCommit']
for quant, fingerprint, size in [('q8_0','254334f05da24bce796c11e8d97c8bb8e0261b5f321f85449d5abb8829fb03b3',2012012608),('q4_k_m','9fc94ee9249df1a818677d2147d58912f2d797a494f592255c7568a15d226e04',1274396736)]:
    artifact=conversion['artifacts'][quant]
    assert artifact['sha256']==fingerprint and artifact['bytes']==size
    assert artifact['metadata']['general.architecture']=='qwen35'
    assert artifact['metadata']['qwen35.block_count']==24 and artifact['tensors']==320
    assert not artifact['phoneTested'] and not artifact['releaseApproved'] and not artifact['trainedAdapter']
review=json.loads((base/'review.json').read_text())
keys=lambda row:(row['condition'],row['id'],row['turn'])
assert len(review['notes'])==42 and {keys(row) for row in review['notes']}=={keys(row) for row in all_rows}
for condition,counts in review['counts'].items():
    selected=[row for row in review['notes'] if row['condition']==condition]
    assert counts==dict(contentPass=sum(row['contentPass'] for row in selected),strictPass=sum(row['strictPass'] for row in selected),turns=len(selected))
    assert all(row['notes'] and (not row['strictPass'] or row['contentPass']) for row in selected)
assert not review['releaseApproved']
print('Verified all42GGUF/reference outputs, frozen inputs, actual history, decoded controls, converted identities and qualitative notes; neither model is release-approved.')
