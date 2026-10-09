"""Reproduce completed diagnostic reports from exact saved native responses."""
import json
import statistics
from pathlib import Path

from assistant_diagnostic import ROOT, evaluate, load_diagnostic, native_response


def main():
    cases, settings, _, manifest = load_diagnostic()
    result_root = ROOT / 'results' / '20261009'
    proof = json.loads((result_root / 'verification.json').read_text())
    expected = {(profile['id'], prompt, case['id'], index + 1): turn
                for profile in settings['profiles'] for prompt in settings['prompts']
                for case in cases for index, turn in enumerate(case['turns'])}
    total = errors = 0
    checked = []
    for job in proof['jobs']:
        folder = result_root / (job['candidate'] + '-' + job['runtime'])
        rows = [json.loads(line) for line in (folder / 'predictions.jsonl').read_text().splitlines()]
        report = json.loads((folder / 'report.json').read_text())
        provenance = json.loads((folder / 'provenance.json').read_text())
        audit = json.loads((folder / 'native-api-audit.json').read_text())
        assert len(rows) == manifest['turnsPerJob'] == len(expected)
        assert provenance['sourceCommit'] == report['sourceCommit'] == proof['sourceCommit']
        assert provenance['settings'] == settings and provenance['suite'] == manifest
        assert audit['sdk'] == provenance['runtime'] == job['runtime']
        assert audit['nativeLibraries'] and audit['moduleHashes']
        assert not provenance['phoneTested'] and not provenance['appProtocolTested']
        assert not report['releaseApproved'] and not report['semanticQualityCertified']
        seen = set()
        groups = {}
        for row in rows:
            key = (row['profile'], row['prompt'], row['id'], row['turn'])
            assert key in expected and key not in seen
            seen.add(key)
            assert row['candidate'] == job['candidate'] and row['runtime'] == job['runtime']
            profile = next(p for p in settings['profiles'] if p['id'] == row['profile'])
            assert row['settingsUsed'] == {'sampler': profile['sampler'], 'penalty': profile['penalty']}
            assert row['score'] == evaluate(expected[key], row['rawText'], row['prompt'], row['runtimeError'])
            if not row['runtimeError']:
                assert native_response(row['rawEnvelope'])[1] == row['rawText']
                assert row['benchmark']['last_decode_token_count'] <= settings['maxOutputTokens']
            group = groups.setdefault(row['profile'] + '/' + row['prompt'],
                                     dict(turns=0, valid=0, objectivePass=0, runtimeErrors=0, outputAtLimit=0, latencies=[]))
            group['turns'] += 1
            group['valid'] += row['score']['valid']
            group['objectivePass'] += row['score']['objectivePass']
            group['runtimeErrors'] += row['runtimeError'] is not None
            group['outputAtLimit'] += bool(row['benchmark'] and row['benchmark']['last_decode_token_count'] >= settings['maxOutputTokens'])
            if not row['runtimeError']:
                group['latencies'].append(row['latencyMs'])
        for group in groups.values():
            timings = group.pop('latencies')
            group['medianLatencyMs'] = statistics.median(timings) if timings else None
        assert report['groups'] == groups
        total += len(rows)
        errors += sum(row['runtimeError'] is not None for row in rows)
        checked.append(dict(candidate=job['candidate'], runtime=job['runtime'], records=len(rows)))
    assert total == proof['records'] == 120 and errors == proof['nativeErrors'] == 30
    assert total - errors == proof['generatedResponses'] == 90
    review = json.loads((result_root / 'qualitative-review.json').read_text())
    review_keys = {(r['candidate'], r['runtime'], r['profile'], r['prompt'], r['id'], r['turn'])
                   for r in review['rows']}
    expected_review_keys = {(job['candidate'], job['runtime'], *key)
                            for job in proof['jobs'] for key in expected}
    assert len(review['rows']) == len(review_keys) == 120
    assert review_keys == expected_review_keys and not review['releaseApproved']
    for folder in sorted((result_root / 'setup-attempt').glob('qwen*')):
        rows = [json.loads(line) for line in (folder / 'predictions.jsonl').read_text().splitlines()]
        assert len(rows) == 30 and sum(bool(row['runtimeError']) for row in rows) == 15
        for row in rows:
            key = (row['profile'], row['prompt'], row['id'], row['turn'])
            assert row['score'] == evaluate(expected[key], row['rawText'], row['prompt'], row['runtimeError'])
    print(json.dumps(dict(recordsReproduced=total, generatedResponses=total-errors,
                          runtimeErrors=errors, setupRecordsSeparatelyPreserved=60,
                          checked=checked, releaseApproved=False), indent=2))


if __name__ == '__main__':
    main()
