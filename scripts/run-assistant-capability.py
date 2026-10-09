from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import socket
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

from assistant_capability import ROOT, load_suite, score, sha


def fetch_json(url, payload=None, timeout=5):
    request = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = response.read(128_001)
    if len(data) > 128_000:
        raise ValueError('oversized-runtime-response')
    return json.loads(data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows, system, manifest = load_suite()
    candidates = json.loads((ROOT / 'candidates.json').read_text())
    candidate = next(model for model in candidates['models'] if model['id'] == args.candidate)
    if importlib.metadata.version('litert-lm') != '0.18.0':
        raise ValueError('Unpinned CLI version')
    args.output.mkdir(parents=True, exist_ok=True)

    from huggingface_hub import hf_hub_download
    download_started = time.perf_counter()
    path = Path(hf_hub_download(candidate['repo'], candidate['file'], revision=candidate['revision'], token=False)).resolve()
    if path.stat().st_size != candidate['sizeBytes'] or sha(path) != candidate['sha256']:
        raise ValueError('Candidate bundle identity mismatch')
    provenance = {'candidate': candidate, 'sourceCommit': os.environ.get('GITHUB_SHA'),
                  'suite': manifest, 'runtime': {'cli': importlib.metadata.version('litert-lm'),
                   'python': platform.python_version(), 'platform': platform.platform(),
                   'cpuCount': os.cpu_count(), 'backend': 'cpu', 'cpuThreads': 2,
                   'cache': 'memory', 'maxContextTokens': 4096, 'maxOutputTokens': 384,
                   'temperature': 0, 'topK': 1, 'seed': 42,
                   'modelReference': str(path), 'outputLimitParameter': 'max_completion_tokens'},
                  'downloadAndHashSeconds': time.perf_counter()-download_started,
                  'phoneTested': False, 'appProtocolTested': False, 'fineTuned': False,
                  'limit': 'Isolated synthetic capability probe; not a MYELIN release certificate. Linux CPU is not Android performance.'}
    (args.output/'provenance.json').write_text(json.dumps(provenance, indent=2)+'\n')
    subprocess.run(['litert-lm', 'import', str(path), candidate['id']], check=True, timeout=180)
    config = args.output/'runtime-config.json'
    config.write_text(json.dumps({'default': {'backend': 'cpu', 'cpu_thread_count': 2,
                                            'cache': 'memory', 'max_num_tokens': 4096,
                                            'temperature': 0.0, 'top_k': 1, 'seed': 42}}))
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
    origin = f'http://127.0.0.1:{port}'
    predictions = []
    with (args.output/'runtime.log').open('w') as log:
        process = subprocess.Popen(['litert-lm', 'serve', '--host', '127.0.0.1', '--port', str(port),
                                    '--config', str(config.resolve())], stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic()+120
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('Runtime exited before serving')
                try:
                    models = fetch_json(origin+'/v1/models')
                    if candidate['id'] not in [model['id'] for model in models['data']]:
                        raise ValueError('Expected imported model absent')
                    break
                except (OSError, ValueError, KeyError):
                    time.sleep(0.25)
            else:
                raise RuntimeError('Runtime setup deadline')
            for case in rows:
                # Each case starts a fresh conversation. Later turns contain
                # actual generated replies, never the evaluator's expectations.
                messages = [{'role': 'system', 'content': system}]
                for index, turn in enumerate(case['turns']):
                    messages.append({'role': 'user', 'content': turn['user']})
                    started = time.perf_counter()
                    text = ''; finish = None; transport_error = None; usage = None
                    try:
                        envelope = fetch_json(origin+'/v1/chat/completions', {
                            # The official CLI also accepts an existing absolute
                            # file. Use the verified bundle directly: registry
                            # listing succeeded in the first run but alias
                            # resolution during completion returned 404.
                            'model': str(path), 'messages': messages, 'stream': False,
                            'temperature': 0, 'max_completion_tokens': 384, 'seed': 42}, timeout=180)
                        choices = envelope.get('choices')
                        if not isinstance(choices, list) or len(choices) != 1:
                            raise ValueError('Invalid completion choices')
                        message = choices[0]['message']; finish = choices[0]['finish_reason']
                        if message.get('role') != 'assistant' or not isinstance(message.get('content'), str) or message.get('tool_calls'):
                            raise ValueError('Invalid completion message')
                        text = message['content']; usage = envelope.get('usage')
                    except Exception as error:
                        # No generation retry or output repair. Preserve failure.
                        transport_error = type(error).__name__ + ': ' + str(error)[:300]
                    elapsed = (time.perf_counter()-started)*1000
                    result = score(turn, text, finish)
                    prediction = {'id': case['id'], 'turn': index+1, 'category': case['category'],
                                  'latencyMs': elapsed, 'finishReason': finish, 'rawText': text,
                                  'usage': usage, 'transportError': transport_error, 'score': result}
                    predictions.append(prediction)
                    with (args.output/'predictions.jsonl').open('a') as output:
                        output.write(json.dumps(prediction, ensure_ascii=False)+'\n')
                    print(f"{candidate['id']} {case['id']} turn {index+1}: valid={result['valid']} objective={result['objectivePass']} {elapsed:.0f}ms", flush=True)
                    messages.append({'role': 'assistant', 'content': text or '[generation unavailable]'})
        finally:
            process.terminate()
            try: process.wait(timeout=15)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
            log.flush()
            print('RUNTIME_LOG_TAIL_BEGIN', flush=True)
            print((args.output/'runtime.log').read_text(errors='replace')[-24000:], flush=True)
            print('RUNTIME_LOG_TAIL_END', flush=True)
    latencies = [row['latencyMs'] for row in predictions if row['transportError'] is None]
    categories = {}
    for row in predictions:
        value = categories.setdefault(row['category'], {'turns': 0, 'valid': 0, 'objectivePass': 0})
        value['turns'] += 1; value['valid'] += row['score']['valid']; value['objectivePass'] += row['score']['objectivePass']
    report = {'candidate': candidate['id'], 'sourceCommit': provenance['sourceCommit'],
              'cases': len(rows), 'turns': len(predictions), 'expectedTurns': manifest['turns'],
              'valid': sum(row['score']['valid'] for row in predictions),
              'transportFailures': sum(row['transportError'] is not None for row in predictions),
              'objectivePass': sum(row['score']['objectivePass'] for row in predictions),
              'semanticQualityCertified': False, 'manualReviewRequired': sum(row['score']['reviewRequired'] for row in predictions),
              'categories': categories, 'p50LatencyMs': statistics.median(latencies) if latencies else None,
              'maxLatencyMs': max(latencies) if latencies else None, 'provenance': provenance,
              'releaseApproved': False, 'note': 'Objective checks include format/fields and simple answer patterns. Correct explanations, title meaning and false success claims require separate review. No app actions executed.'}
    (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    for name in ['provenance.json', 'report.json', 'predictions.jsonl']:
        print('EVIDENCE_BEGIN '+name, flush=True)
        print((args.output/name).read_text(), flush=True)
        print('EVIDENCE_END '+name, flush=True)
    if len(predictions) != manifest['turns'] or any(row['transportError'] for row in predictions):
        raise RuntimeError('Incomplete runtime evaluation; see preserved evidence')


if __name__ == '__main__':
    main()
