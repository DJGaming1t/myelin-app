"""Replay exact saved reference records; does not certify semantic model quality."""
import json
import statistics

from assistant_diagnostic import native_response
from assistant_reference import ROOT, evaluate, load_reference


def main():
    cases, settings, system, manifest, candidate = load_reference()
    root = ROOT / 'results' / '20261009'
    proof = json.loads((root / 'verification.json').read_text())
    expected = {(case['id'], index+1): turn for case in cases
                for index, turn in enumerate(case['turns'])}
    all_rows = []
    for name in ['original', 'native']:
        folder = root / name
        rows = [json.loads(line) for line in (folder / 'predictions.jsonl').read_text().splitlines()]
        provenance = json.loads((folder / 'provenance.json').read_text())
        report = json.loads((folder / 'report.json').read_text())
        assert provenance['settings'] == settings and provenance['manifest'] == manifest
        assert provenance['sourceCommit'] == report['sourceCommit'] == proof['sources'][name]
        assert provenance['original']['revision'] == settings['original']['revision']
        assert not provenance['phoneTested'] and not provenance['releaseApproved']
        assert not report['releaseApproved'] and not report['semanticQualityCertified']
        if name == 'original':
            assert provenance['loadingInfo']['missing_keys'] == []
            assert provenance['parameterDtypes'] == ['torch.bfloat16']
            assert provenance['devices'] == ['cpu']
            assert provenance['modelType'] == 'qwen3_5_text'
            assert provenance['modelClass'] == 'Qwen3_5ForCausalLM'
            weights = provenance['original']['files']['model.safetensors-00001-of-00001.safetensors']
            assert weights['sha256'] == weights['sourceLfsSha256'] == proof['originalWeightsSha256']
        else:
            assert provenance['nativeCandidate'] == candidate
            assert provenance['nativeRuntime'] == settings['nativeRuntime']
            assert provenance['nativeLibraries'] and provenance['nativeModuleHashes']
        seen = set(); groups = {}; histories = {}
        for row in rows:
            key = (row['condition'], row['id'], row['turn'])
            assert key not in seen and row['condition'] in settings['conditions']
            seen.add(key)
            turn = expected[(row['id'], row['turn'])]
            history = histories.setdefault((row['condition'], row['id']), [{'role':'system','content':system}])
            assert row['messages'] == history + [{'role':'user','content':turn['user']}]
            history.extend([{'role':'user','content':turn['user']},
                            {'role':'assistant','content':row['rawText'] or '[generation unavailable]'}])
            assert row['score'] == evaluate(turn, row['rawText'], row['runtimeError'], settings)
            assert len(row['officialTokenIds']) + settings['maxOutputTokens'] <= settings['maxContextTokens']
            if not row['runtimeError']:
                detail = row['detail']
                if row['condition'] == 'hf-official':
                    assert detail['generatedTokens'] == len(detail['generatedTokenIds']) <= settings['maxOutputTokens']
                else:
                    assert detail['benchmark']['last_decode_token_count'] <= settings['maxOutputTokens']
                    if row['condition'] == 'native-bundled':
                        assert native_response(detail['rawEnvelope'])[1] == row['rawText']
                    else:
                        assert detail['exactTokenizerMatch'] and not detail['applyPromptTemplate']
                        assert detail['nativeTokenIds'] == row['officialTokenIds']
                        assert detail['nativeResponse']['texts'] == [row['rawText']]
            group = groups.setdefault(row['condition'], dict(turns=0, objectivePass=0, runtimeErrors=0, outputAtLimit=0, latencies=[]))
            group['turns'] += 1; group['objectivePass'] += row['score']['objectivePass']
            group['runtimeErrors'] += bool(row['runtimeError'])
            group['outputAtLimit'] += bool(row['detail'].get('outputAtLimit'))
            if not row['runtimeError']: group['latencies'].append(row['latencyMs'])
        for condition, group in groups.items():
            timings = group.pop('latencies')
            group['medianLatencyMs'] = statistics.median(timings) if timings else None
            assert group['turns'] == 8
            assert {(identifier, turn) for c, identifier, turn in seen if c == condition} == set(expected)
        assert groups == report['conditions'] and report['records'] == len(rows)
        all_rows.extend(rows)
    assert len(all_rows) == proof['records'] == 24
    assert {row['condition'] for row in all_rows} == set(settings['conditions'])
    reviews = json.loads((root / 'qualitative-review.json').read_text())['rows']
    keys = lambda rows: {(r['condition'], r['id'], r['turn']) for r in rows}
    assert len(reviews) == len(keys(reviews)) == 24 and keys(reviews) == keys(all_rows)
    print(json.dumps(dict(recordsReproduced=24, reportsReproduced=2, qualitativeReviewRows=24,
                         officialNativeTokenizerMatches=8, releaseApproved=False), indent=2))


if __name__ == '__main__':
    main()
