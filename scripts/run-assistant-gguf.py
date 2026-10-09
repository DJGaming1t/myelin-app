"""Pinned source-to-GGUF conversion and fresh planning probe; no trained adapter."""
import argparse
import importlib.metadata
import json
import os
import platform
import re
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from assistant_capability import sha
from assistant_reference import git_blob_sha, json_ready_metadata

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'training/assistant-capability/gguf-v4'


def load_probe():
    manifest = json.loads((PROBE / 'manifest.json').read_text())
    for name, digest in manifest['sha256'].items():
        if sha(PROBE / name) != digest:
            raise ValueError('Frozen probe changed: ' + name)
    cases = [json.loads(line) for line in (PROBE / 'cases.jsonl').read_text().splitlines()]
    if len(cases) != 12 or sum(len(c['turns']) for c in cases) != 14:
        raise ValueError('Unexpected case count')
    return cases, json.loads((PROBE / 'settings.json').read_text()), (PROBE / 'system.txt').read_text().strip(), manifest


def save(output, name, value):
    (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print('EVIDENCE ' + json.dumps({'name': name, 'value': value}, ensure_ascii=False), flush=True)


def score(turn, text, error):
    lower = text.lower()
    words = lower.split()
    repeated = any(words.count(w) > 12 for w in set(words) if len(w) > 3)
    all_ok = all(x.lower() in lower for x in turn.get('all', []))
    any_ok = not turn.get('any') or any(x.lower() in lower for x in turn['any'])
    return dict(patternPass=not error and bool(text.strip()) and all_ok and any_ok and not repeated,
                repeated=repeated, words=len(words), semanticReviewed=False)


def request(port, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}', data=data,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=240) as response:
        return json.load(response)


def snapshot(settings, include_weights):
    from huggingface_hub import HfApi, snapshot_download
    original = settings['original']
    info = HfApi().model_info(original['repo'], revision=original['revision'], files_metadata=True, token=False)
    if info.sha != original['revision']:
        raise ValueError('HF revision mismatch')
    patterns = ['*.json', '*.jinja', 'merges.txt', 'vocab.json', 'LICENSE', 'README.md']
    if include_weights:
        patterns.append('*.safetensors')
    folder = Path(snapshot_download(original['repo'], revision=original['revision'], allow_patterns=patterns, token=False))
    identities = {}
    for item in info.siblings:
        path = folder / item.rfilename
        if not path.is_file():
            continue
        digest = sha(path)
        if item.size is not None and path.stat().st_size != item.size:
            raise ValueError('HF size mismatch: ' + item.rfilename)
        if item.lfs is not None and digest != item.lfs.sha256:
            raise ValueError('HF LFS mismatch: ' + item.rfilename)
        if item.lfs is None and item.blob_id and git_blob_sha(path) != item.blob_id:
            raise ValueError('HF Git blob mismatch: ' + item.rfilename)
        identities[item.rfilename] = dict(bytes=path.stat().st_size, sha256=digest)
    if include_weights and identities.get(original['weightsFile']) != dict(bytes=original['sizeBytes'], sha256=original['sha256']):
        raise ValueError('Pinned source weight mismatch')
    return folder, identities


def conversion(args, settings, provenance):
    if subprocess.check_output(['git', '-C', str(args.llama), 'rev-parse', 'HEAD'], text=True).strip() != settings['llamaCommit']:
        raise ValueError('Unpinned llama.cpp')
    sys.path.insert(0, str(args.llama / 'gguf-py'))
    import gguf
    folder, identities = snapshot(settings, True)
    provenance['originalFiles'] = identities
    provenance['llamaSourceHashes'] = {name:sha(args.llama / name) for name in [
        'convert_hf_to_gguf.py', 'conversion/qwen.py', 'conversion/base.py', 'src/models/qwen35.cpp']}
    provenance['binaries'] = {name:sha(args.llama / 'build/bin' / name) for name in ['llama-server', 'llama-quantize']}
    save(args.output, 'provenance.json', provenance)
    bf16 = args.output / 'temporary-bf16.gguf'
    commands = [[sys.executable, str(args.llama / 'convert_hf_to_gguf.py'), str(folder),
                 '--outfile', str(bf16), '--outtype', 'bf16', '--no-mtp']]
    subprocess.run(commands[0], check=True)
    artifacts = {}
    for quant in ['Q8_0', 'Q4_K_M']:
        path = args.output / f'MYELIN-Qwen3.5-2B-{quant}.gguf'
        cmd = [str(args.llama / 'build/bin/llama-quantize'), str(bf16), str(path), quant, str(settings['threads'])]
        commands.append(cmd)
        subprocess.run(cmd, check=True)
        reader = gguf.GGUFReader(path)
        def field(name):
            value = reader.fields[name].contents()
            return value.tolist() if hasattr(value, 'tolist') else value
        meta = {name:field(name) for name in ['general.architecture', 'general.file_type',
                 'qwen35.block_count', 'qwen35.embedding_length', 'tokenizer.chat_template']}
        if meta['general.architecture'] != 'qwen35' or meta['qwen35.block_count'] != 24:
            raise ValueError('Wrong converted architecture/block count')
        if any(re.match(r'blk\.(2[4-9]|[3-9]\d)\.', t.name) or 'mtp' in t.name for t in reader.tensors):
            raise ValueError('Unexpected MTP layers')
        artifacts[quant.lower()] = dict(file=path.name, bytes=path.stat().st_size, sha256=sha(path),
              metadata=meta, tensors=len(reader.tensors), tensorTypes=sorted({str(t.tensor_type) for t in reader.tensors}),
              phoneTested=False, trainedAdapter=False, releaseApproved=False)
        del reader
    provenance['conversionCommands'] = commands
    provenance['artifacts'] = artifacts
    save(args.output, 'provenance.json', provenance)
    save(args.output, 'model-manifest.json', dict(original=settings['original'], llamaCommit=settings['llamaCommit'],
         artifacts=artifacts, purpose='MYELIN planning candidate; converted official post-trained text weights, no MYELIN fine-tune',
         activation='Requires quality review, matching Android runtime, phone memory/speed tests and confirmed action bridge.'))
    bf16.unlink()  # Derived intermediate only; recorded exact source remains in HF cache.
    return folder


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runner', choices=['original', 'gguf'], required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--llama', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cases, settings, system, manifest = load_probe()
    versions = {name:importlib.metadata.version(name) for name in ['torch', 'transformers', 'huggingface-hub']}
    if versions['torch'].split('+')[0] != settings['torch'] or versions['transformers'] != settings['transformers'] or versions['huggingface-hub'] != settings['huggingfaceHub']:
        raise ValueError('Dependency pin mismatch')
    provenance = dict(sourceCommit=os.environ.get('GITHUB_SHA'), runner=args.runner, settings=settings,
                       manifest=manifest, versions=versions, platform=platform.platform(), phoneTested=False,
                       releaseApproved=False, note='One answer per condition; CPU timings are not phone measurements.')
    save(args.output, 'provenance.json', provenance)
    if args.runner == 'gguf':
        if args.llama is None:
            raise ValueError('llama source required')
        folder = conversion(args, settings, provenance)
    else:
        folder, identities = snapshot(settings, True)
        provenance['originalFiles'] = identities
    import torch
    from transformers import AutoConfig, AutoTokenizer, GenerationConfig, Qwen3_5ForCausalLM
    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    rows = []

    def run(condition, generate):
        for case in cases:
            history = [{'role':'system', 'content':system}]
            for index, turn in enumerate(case['turns']):
                messages = history + [{'role':'user', 'content':turn['user']}]
                prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
                ids = tokenizer(prompt, add_special_tokens=False)['input_ids']
                if len(ids) + settings['outputTokens'] > settings['contextTokens']:
                    raise ValueError('Context budget exceeded')
                started = time.perf_counter(); raw = ''; detail = {}; error = None
                try:
                    raw, detail = generate(prompt, ids)
                except Exception as issue:
                    error = type(issue).__name__ + ': ' + str(issue)[:1000]
                row = dict(condition=condition, id=case['id'], turn=index+1, messages=messages,
                           officialPrompt=prompt, officialTokenIds=ids, rawText=raw, runtimeError=error,
                           detail=detail, latencyMs=(time.perf_counter()-started)*1000, score=score(turn, raw, error))
                rows.append(row)
                with (args.output / 'predictions.jsonl').open('a') as handle:
                    handle.write(json.dumps(row, ensure_ascii=False) + '\n')
                print('PREDICTION ' + json.dumps(row, ensure_ascii=False), flush=True)
                history += [{'role':'user','content':turn['user']}, {'role':'assistant','content':raw or '[unavailable]'}]

    if args.runner == 'original':
        torch.set_num_threads(settings['threads']); torch.set_num_interop_threads(1); torch.manual_seed(settings['seed'])
        config = AutoConfig.from_pretrained(folder, local_files_only=True).get_text_config()
        model, loading = Qwen3_5ForCausalLM.from_pretrained(folder, config=config, local_files_only=True,
              trust_remote_code=False, dtype=torch.bfloat16, attn_implementation='eager', output_loading_info=True)
        model.eval(); loading = json_ready_metadata(loading)
        if any(loading.get(k) for k in ['missing_keys','mismatched_keys','error_msgs']) or any(
            not k.startswith(('mtp.','model.visual.')) for k in loading.get('unexpected_keys', [])):
            save(args.output, 'loading-error.json', loading); raise ValueError('Incomplete official text load')
        provenance.update(loadingInfo=loading, parameterCount=sum(p.numel() for p in model.parameters()),
                          dtypes=sorted({str(p.dtype) for p in model.parameters()}))
        save(args.output, 'provenance.json', provenance)
        gc = GenerationConfig(max_new_tokens=settings['outputTokens'], do_sample=False, num_beams=1,
              use_cache=True, eos_token_id=tokenizer.eos_token_id, pad_token_id=tokenizer.pad_token_id, repetition_penalty=1.0)
        def original(prompt, ids):
            inputs = tokenizer(prompt, return_tensors='pt', add_special_tokens=False)
            with torch.inference_mode():
                output = model.generate(**inputs, generation_config=gc, logits_to_keep=1)[0,len(ids):].tolist()
            return tokenizer.decode(output, skip_special_tokens=True, clean_up_tokenization_spaces=False), dict(
                 generatedTokenIds=output, generatedTokens=len(output), outputAtLimit=len(output)>=settings['outputTokens'])
        run('hf-bf16', original)
    else:
        for quant in ['q8_0','q4_k_m']:
            path = args.output / provenance['artifacts'][quant]['file']
            command = [str(args.llama / 'build/bin/llama-server'), '-m', str(path), '--host','127.0.0.1',
                       '--port','8091','-c',str(settings['contextTokens']),'-t',str(settings['threads']),
                       '-ngl','0','-np','1','--no-warmup']
            with (args.output / f'server-{quant}.log').open('w') as log:
                process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
                try:
                    deadline = time.monotonic()+150
                    while True:
                        if process.poll() is not None:
                            raise RuntimeError('llama-server exited before ready; inspect server log')
                        try:
                            if request(8091,'/health').get('status') == 'ok': break
                        except Exception:
                            pass
                        if time.monotonic() > deadline: raise TimeoutError('Model load deadline exceeded')
                        time.sleep(1)
                    props = request(8091,'/props')
                    save(args.output, f'server-props-{quant}.json', dict(command=command, props=props))
                    def gguf_generate(prompt, ids):
                        gguf_ids = request(8091,'/tokenize',dict(content=prompt, add_special=False, parse_special=True))['tokens']
                        if gguf_ids != ids: raise ValueError('HF/GGUF exact tokenizer mismatch')
                        value = request(8091,'/completion',dict(prompt=ids, n_predict=settings['outputTokens'],
                            temperature=0, seed=settings['seed'], samplers=['temperature'], top_k=1, top_p=1, min_p=0,
                            repeat_penalty=1, presence_penalty=0, frequency_penalty=0, cache_prompt=False,
                            return_tokens=True, stream=False))
                        return value['content'], dict(rawEnvelope=value, exactTokenizerMatch=True,
                            generatedTokens=value['tokens_predicted'], outputAtLimit=value['tokens_predicted']>=settings['outputTokens'])
                    run('gguf-'+quant, gguf_generate)
                finally:
                    process.terminate()
                    try: process.wait(timeout=15)
                    except subprocess.TimeoutExpired: process.kill(); process.wait()
    groups = {}
    for row in rows:
        group = groups.setdefault(row['condition'], dict(turns=0, patternPass=0, runtimeErrors=0, outputAtLimit=0, latencies=[]))
        group['turns']+=1; group['patternPass']+=row['score']['patternPass']; group['runtimeErrors']+=row['runtimeError'] is not None
        group['outputAtLimit']+=bool(row['detail'].get('outputAtLimit')); group['latencies'].append(row['latencyMs'])
    for group in groups.values(): group['medianCpuLatencyMs']=statistics.median(group.pop('latencies'))
    save(args.output, 'report.json', dict(conditions=groups, records=len(rows), phoneTested=False, releaseApproved=False,
         note='Pattern checks do not certify semantics. Preserve all answers including mistakes; qualitative review required.'))
    if len(rows) != (14 if args.runner=='original' else 28) or any(row['runtimeError'] for row in rows):
        raise RuntimeError('Incomplete probe; preserve partial evidence')


if __name__ == '__main__':
    main()
