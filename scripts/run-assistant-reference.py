"""Run pinned original and converted Qwen through three declared prompt paths."""
import argparse
import dataclasses
import importlib.metadata
import inspect
import json
import os
import platform
import statistics
import time
from pathlib import Path

from assistant_capability import sha
from assistant_diagnostic import native_response
from assistant_reference import evaluate, git_blob_sha, json_ready_metadata, load_reference


def save(output, name, value):
    (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print('EVIDENCE ' + json.dumps({'name': name, 'value': value}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runner', choices=['original', 'native'], required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cases, settings, system, manifest, candidate = load_reference()
    import torch
    import transformers
    from huggingface_hub import HfApi, snapshot_download, hf_hub_download
    from transformers import AutoConfig, AutoTokenizer, GenerationConfig, Qwen3_5ForCausalLM

    versions = {name: importlib.metadata.version(name) for name in ['torch', 'transformers', 'huggingface-hub']}
    if versions['torch'].split('+')[0] != settings['torch'] or versions['transformers'] != settings['transformers'] or versions['huggingface-hub'] != settings['huggingfaceHub']:
        raise ValueError('Unpinned reference dependencies')
    torch.set_num_threads(settings['threads'])
    torch.set_num_interop_threads(1)
    torch.manual_seed(settings['greedy']['seed'])
    repo = settings['original']['repo']; revision = settings['original']['revision']
    info = HfApi().model_info(repo, revision=revision, files_metadata=True, token=False)
    if info.sha != revision:
        raise ValueError('Original revision mismatch')
    patterns = ['*.json', '*.jinja', 'merges.txt', 'vocab.json', 'LICENSE', 'README.md']
    if args.runner == 'original': patterns.append('*.safetensors')
    started = time.perf_counter()
    snapshot = Path(snapshot_download(repo, revision=revision, allow_patterns=patterns, token=False))
    identities = {}
    for sibling in info.siblings:
        path = snapshot / sibling.rfilename
        if not path.is_file(): continue
        if sibling.size is not None and path.stat().st_size != sibling.size:
            raise ValueError('Snapshot size mismatch: ' + sibling.rfilename)
        digest = sha(path)
        if sibling.lfs is not None:
            if digest != sibling.lfs.sha256:
                raise ValueError('Snapshot LFS hash mismatch: ' + sibling.rfilename)
        elif sibling.blob_id and git_blob_sha(path) != sibling.blob_id:
            raise ValueError('Snapshot Git blob mismatch: ' + sibling.rfilename)
        identities[sibling.rfilename] = dict(bytes=path.stat().st_size, sha256=digest,
                                           sourceBlob=sibling.blob_id,
                                           sourceLfsSha256=None if sibling.lfs is None else sibling.lfs.sha256)
    if args.runner == 'original' and not any(name.endswith('.safetensors') for name in identities):
        raise ValueError('Original weights not downloaded')
    tokenizer = AutoTokenizer.from_pretrained(snapshot, local_files_only=True, trust_remote_code=False)
    if not tokenizer.chat_template:
        raise ValueError('Missing official chat template')
    provenance = dict(sourceCommit=os.environ.get('GITHUB_SHA'), runner=args.runner,
                      original=dict(repo=repo, revision=revision, files=identities),
                      settings=settings, manifest=manifest, versions=versions,
                      platform=platform.platform(), python=platform.python_version(),
                      cpuCount=os.cpu_count(), downloadAndHashSeconds=time.perf_counter()-started,
                      phoneTested=False, releaseApproved=False)
    save(args.output, 'official-template.json', dict(template=tokenizer.chat_template,
         tokenizerClass=type(tokenizer).__name__, eos=tokenizer.eos_token_id, pad=tokenizer.pad_token_id,
         enableThinking=False, note='Official pinned tokenizer template, no edits or fallback.'))
    save(args.output, 'provenance.json', provenance)
    rows = []

    def run_condition(condition, generate):
        for case in cases:
            history = [{'role': 'system', 'content': system}]
            for index, turn in enumerate(case['turns']):
                messages = history + [{'role': 'user', 'content': turn['user']}]
                official_prompt = tokenizer.apply_chat_template(messages, tokenize=False,
                                                               add_generation_prompt=True, enable_thinking=False)
                official_ids = tokenizer(official_prompt, add_special_tokens=False)['input_ids']
                if len(official_ids) + settings['maxOutputTokens'] > settings['maxContextTokens']:
                    raise ValueError('Declared context budget exceeded')
                text = ''; error = None; detail = {}; begun = time.perf_counter()
                try:
                    text, detail = generate(history, turn['user'], official_prompt, official_ids)
                except Exception as issue:
                    error = type(issue).__name__ + ': ' + str(issue)[:1000]
                row = dict(condition=condition, id=case['id'], turn=index+1, messages=messages,
                           officialPrompt=official_prompt, officialTokenIds=official_ids,
                           rawText=text, runtimeError=error, detail=detail,
                           latencyMs=(time.perf_counter()-begun)*1000,
                           score=evaluate(turn, text, error, settings))
                rows.append(row)
                with (args.output / 'predictions.jsonl').open('a') as handle:
                    handle.write(json.dumps(row, ensure_ascii=False) + '\n')
                print('PREDICTION ' + json.dumps(row, ensure_ascii=False), flush=True)
                history.extend([{'role': 'user', 'content': turn['user']},
                                {'role': 'assistant', 'content': text or '[generation unavailable]'}])

    if args.runner == 'original':
        config = AutoConfig.from_pretrained(snapshot, local_files_only=True, trust_remote_code=False).get_text_config()
        if config.model_type != 'qwen3_5_text':
            raise ValueError('Unexpected text configuration')
        model_started = time.perf_counter()
        model, loading = Qwen3_5ForCausalLM.from_pretrained(snapshot, config=config,
             local_files_only=True, trust_remote_code=False, dtype=torch.bfloat16,
             attn_implementation='eager', output_loading_info=True)
        model.eval()
        loading = json_ready_metadata(loading)
        if any(loading.get(key) for key in ['missing_keys', 'mismatched_keys', 'error_msgs']):
            save(args.output, 'loading-error.json', loading)
            raise ValueError('Original text weights not fully loaded')
        unexpected = loading.get('unexpected_keys', [])
        if any(not key.startswith(('mtp.', 'model.visual.')) for key in unexpected):
            save(args.output, 'loading-error.json', loading)
            raise ValueError('Unexpected non-vision/MTP checkpoint keys')
        provenance.update(engineLoadSeconds=time.perf_counter()-model_started, loadingInfo=loading,
                          modelClass=type(model).__name__, modelType=model.config.model_type,
                          parameterDtypes=sorted({str(p.dtype) for p in model.parameters()}),
                          parameterCount=sum(p.numel() for p in model.parameters()),
                          devices=sorted({str(p.device) for p in model.parameters()}),
                          note='Official text-only load uses Transformers qwen3_5_text checkpoint mapping; vision/MTP excluded, no random missing text weights, no adapter or quantization.')
        save(args.output, 'provenance.json', provenance)
        config = GenerationConfig(max_new_tokens=settings['maxOutputTokens'], do_sample=False,
                  num_beams=1, use_cache=True, eos_token_id=tokenizer.eos_token_id,
                  pad_token_id=tokenizer.pad_token_id, repetition_penalty=1.0)

        def original(history, user, prompt, ids):
            inputs = tokenizer(prompt, return_tensors='pt', add_special_tokens=False)
            with torch.inference_mode():
                generated = model.generate(**inputs, generation_config=config, logits_to_keep=1)
            new_ids = generated[0, len(ids):].tolist()
            text = tokenizer.decode(new_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False)
            return text, dict(generatedTokenIds=new_ids, rawDecodedWithSpecialTokens=tokenizer.decode(new_ids, skip_special_tokens=False, clean_up_tokenization_spaces=False),
                             generatedTokens=len(new_ids), outputAtLimit=len(new_ids)>=settings['maxOutputTokens'])
        run_condition('hf-official', original)
    else:
        import litert_lm
        from litert_lm import conversation, engine, session, interfaces
        version = importlib.metadata.version('litert-lm-api')
        if version != settings['nativeRuntime']: raise ValueError('Native runtime mismatch')
        path = Path(hf_hub_download(candidate['repo'], candidate['file'], revision=candidate['revision'], token=False)).absolute()
        if path.suffix != '.litertlm' or path.stat().st_size != candidate['sizeBytes'] or sha(path) != candidate['sha256']:
            raise ValueError('Converted bundle identity mismatch')
        provenance.update(nativeCandidate=candidate, nativeRuntime=version,
                          nativeModuleHashes={m.__name__:sha(m.__file__) for m in [conversation, engine, session, interfaces]},
                          nativeLibraries={p.name:sha(p) for p in sorted(Path(litert_lm.__file__).parent.rglob('*.so'))},
                          apiSignatures={name:str(inspect.signature(getattr(cls, name))) for cls, name in [
                              (litert_lm.Engine,'create_session'), (litert_lm.Engine,'create_conversation'),
                              (conversation.Conversation,'render_message_to_string')]})
        save(args.output, 'provenance.json', provenance)
        model_started = time.perf_counter()
        with litert_lm.Engine(str(path), backend=litert_lm.Backend.CPU(thread_count=settings['threads']),
                 max_num_tokens=settings['maxContextTokens'], cache_dir=settings['cache'],
                 vision_backend=None, audio_backend=None, enable_benchmark=True) as model:
            provenance.update(engineLoadSeconds=time.perf_counter()-model_started,
                              nativeEos=model.eos_token_ids, nativeBos=model.bos_token_id)
            save(args.output, 'provenance.json', provenance)
            sampler = litert_lm.SamplerConfig(**settings['greedy'])

            def bundled(history, user, prompt, ids):
                # Rendering may change internal append flags, so trace a separate session.
                with model.create_conversation(messages=history, tools=None, automatic_tool_calling=False,
                         sampler_config=sampler, max_output_tokens=settings['maxOutputTokens']) as trace:
                    incremental = trace.render_message_to_string(user)
                with model.create_conversation(messages=history, tools=None, automatic_tool_calling=False,
                         sampler_config=sampler, max_output_tokens=settings['maxOutputTokens']) as conv:
                    value = conv.send_message(user, max_output_tokens=settings['maxOutputTokens'])
                    envelope, text = native_response(value)
                    bench = dataclasses.asdict(conv.get_benchmark_info())
                return text, dict(rawEnvelope=envelope, incrementalRenderedPrompt=incremental,
                     incrementalTokenIds=model.tokenize(incremental), benchmark=bench,
                     outputAtLimit=bench['last_decode_token_count']>=settings['maxOutputTokens'],
                     note='Incremental render can omit prefilled system/history; not an entire HF prompt.')

            def official_raw(history, user, prompt, ids):
                native_ids = model.tokenize(prompt)
                if native_ids != ids:
                    raise ValueError('HF/native tokenizer mismatch for official rendered prompt')
                with model.create_session(apply_prompt_template=False, sampler_config=sampler,
                                         max_output_tokens=settings['maxOutputTokens']) as sess:
                    sess.run_prefill([prompt])
                    value = sess.run_decode()
                    if len(value.texts) != 1:
                        raise ValueError('Unexpected native response candidate count')
                    bench = dataclasses.asdict(sess.get_benchmark_info())
                return value.texts[0], dict(nativeResponse=dataclasses.asdict(value), nativeTokenIds=native_ids,
                     exactTokenizerMatch=True, applyPromptTemplate=False, benchmark=bench,
                     outputAtLimit=bench['last_decode_token_count']>=settings['maxOutputTokens'])
            run_condition('native-bundled', bundled)
            run_condition('native-official-raw', official_raw)

    conditions = {}
    for row in rows:
        group = conditions.setdefault(row['condition'], dict(turns=0, objectivePass=0, runtimeErrors=0, outputAtLimit=0, latencies=[]))
        group['turns'] += 1; group['objectivePass'] += row['score']['objectivePass']
        group['runtimeErrors'] += row['runtimeError'] is not None
        group['outputAtLimit'] += bool(row['detail'].get('outputAtLimit'))
        if not row['runtimeError']: group['latencies'].append(row['latencyMs'])
    for group in conditions.values():
        timings = group.pop('latencies'); group['medianLatencyMs'] = statistics.median(timings) if timings else None
    report = dict(sourceCommit=provenance['sourceCommit'], conditions=conditions, records=len(rows),
                  releaseApproved=False, semanticQualityCertified=False,
                  note='Automatic pattern/word checks only; all content needs qualitative review. Original BF16 vs INT8/native graph/precision/runtime confounded; not app or phone proof.')
    save(args.output, 'report.json', report)
    expected = 8 if args.runner == 'original' else 16
    if len(rows) != expected or any(row['runtimeError'] for row in rows):
        raise RuntimeError('Reference probe has incomplete generation; preserve evidence without certifying quality')


if __name__ == '__main__':
    main()
