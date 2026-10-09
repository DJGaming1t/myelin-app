"""Evaluate a pinned already-converted 4B candidate; never activate it automatically."""
import argparse
import importlib.metadata
import json
import os
import runpy
import statistics
import subprocess
import sys
import time
from pathlib import Path

from assistant_capability import sha

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'training/assistant-capability/phone-v6'
HELPERS = runpy.run_path(str(ROOT/'scripts/run-assistant-gguf.py'))


def load():
    manifest = json.loads((PROBE/'manifest.json').read_text())
    for name, digest in manifest['sha256'].items():
        if sha(PROBE/name) != digest: raise ValueError('Frozen v6 input changed: '+name)
    fresh = [json.loads(line) for line in (PROBE/'cases.jsonl').read_text().splitlines()]
    previous = runpy.run_path(str(ROOT/'scripts/run-assistant-phone-profiles.py'))['load']()
    regression = previous[0]
    if len(fresh)!=8 or sum(len(case['turns']) for case in fresh)!=10: raise ValueError('Fresh count changed')
    if {case['id'] for case in fresh} & {case['id'] for case in regression}: raise ValueError('Case leakage')
    return fresh, regression, json.loads((PROBE/'settings.json').read_text()), (PROBE/'system.txt').read_text().strip(), manifest, previous[4]


def download_model(settings):
    from huggingface_hub import HfApi, hf_hub_download
    model = settings['model']
    info = HfApi().model_info(model['repo'],revision=model['revision'],files_metadata=True,token=False)
    if info.sha != model['revision']: raise ValueError('Model revision mismatch')
    entry = next(item for item in info.siblings if item.rfilename==model['file'])
    if entry.size!=model['bytes'] or entry.lfs is None or entry.lfs.sha256!=model['sha256']:
        raise ValueError('Published GGUF identity mismatch')
    path = Path(hf_hub_download(model['repo'],model['file'],revision=model['revision'],token=False))
    if path.stat().st_size!=model['bytes'] or sha(path)!=model['sha256']: raise ValueError('Downloaded GGUF identity mismatch')
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--llama',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--preflight',action='store_true')
    args = parser.parse_args()
    fresh, regression, settings, system, manifest, regression_manifest = load()
    versions = {name:importlib.metadata.version(name) for name in ['transformers','huggingface-hub','jinja2']}
    if versions != {'transformers':'5.3.0','huggingface-hub':'1.3.0','jinja2':'3.1.6'}: raise ValueError('Tokenizer dependency mismatch')
    folder, identities = HELPERS['snapshot'](settings,False)
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(folder,local_files_only=True,trust_remote_code=False)
    if args.preflight:
        for profile in settings['profiles']:
            for case in fresh+regression:
                messages=[{'role':'system','content':system},{'role':'user','content':case['turns'][0]['user']}]
                prompt=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=profile['thinking'])
                ids=tokenizer(prompt,add_special_tokens=False)['input_ids']
                if not ids or len(ids)+profile['outputTokens']>settings['contextTokens']: raise ValueError('Initial prompt overflow')
        print('Official tokenizer/template preflight passed for every initial fresh/regression request and both thinking modes; no inference.')
        return
    if args.llama is None or args.output is None: parser.error('--llama and --output required for inference')
    args.output.mkdir(parents=True,exist_ok=True)
    if subprocess.check_output(['git','-C',str(args.llama),'rev-parse','HEAD'],text=True).strip()!=settings['runtimeLlamaCommit']:
        raise ValueError('Runtime does not match phone library pin')
    model = download_model(settings)
    sys.path.insert(0,str(args.llama/'gguf-py'))
    import gguf
    reader = gguf.GGUFReader(model)
    metadata = {}
    for name in ['general.architecture','general.file_type','qwen35.block_count','qwen35.embedding_length','tokenizer.chat_template']:
        value = reader.fields[name].contents()
        metadata[name] = value.tolist() if hasattr(value,'tolist') else value
    if metadata['general.architecture']!='qwen35' or metadata['qwen35.block_count']!=32 or metadata['qwen35.embedding_length']!=2560:
        raise ValueError('Unexpected 4B architecture')
    save = lambda name,value: HELPERS['save'](args.output,name,value)
    save('provenance.json',dict(sourceCommit=os.environ.get('GITHUB_SHA'),settings=settings,manifest=manifest,
        regressionManifest=regression_manifest,originalTokenizerFiles=identities,ggufMetadata=metadata,tensors=len(reader.tensors),
        runtimeBinarySha256=sha(args.llama/'build/bin/llama-server'),runtimeQwenSourceSha256=sha(args.llama/'src/models/qwen35.cpp'),
        versions=versions,phoneTested=False,releaseApproved=False,trainedAdapter=False,
        note='Unmodified LM Studio pre-converted Q4 weights, no MYELIN fine-tuning. CPU backend pin of llama.rn, not Android/JNI/phone QA. One seed per declared profile, no retries or final-answer repair.'))
    del reader
    rows = []
    for profile in settings['profiles']:
        command = [str(args.llama/'build/bin/llama-server'),'-m',str(model),'--host','127.0.0.1','--port','8093',
            '-c',str(settings['contextTokens']),'-t',str(settings['threads']),'-ngl','0','-np','1','--no-warmup',
            '--jinja','--reasoning-format','deepseek','--reasoning-budget',str(profile['thinkingBudget'])]
        with (args.output/('server-'+profile['id']+'.log')).open('w') as log:
            process = subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
            try:
                ready_by = time.monotonic()+180
                while True:
                    if process.poll() is not None: raise RuntimeError('Server exited; inspect log')
                    try:
                        if HELPERS['request'](8093,'/health').get('status')=='ok': break
                    except Exception: pass
                    if time.monotonic()>ready_by: raise TimeoutError('Loading deadline')
                    time.sleep(1)
                save('server-props-'+profile['id']+'.json',dict(command=command,props=HELPERS['request'](8093,'/props')))
                for set_name,cases in [('fresh',fresh),('observed-v5-regression',regression)]:
                    for case in cases:
                        history = [{'role':'system','content':system}]
                        for index,turn in enumerate(case['turns']):
                            messages = history+[{'role':'user','content':turn['user']}]
                            prompt = tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=profile['thinking'])
                            ids = tokenizer(prompt,add_special_tokens=False)['input_ids']
                            if len(ids)+profile['outputTokens']>settings['contextTokens']: raise ValueError('Context overflow')
                            payload = dict(messages=messages,max_tokens=profile['outputTokens'],seed=settings['seed'],stream=False,
                                cache_prompt=False,chat_template_kwargs={'enable_thinking':profile['thinking']},
                                reasoning_effort='high' if profile['thinking'] else 'none',**settings['sampler'])
                            started = time.perf_counter(); value={}; text=''; error=None; trace={}
                            try:
                                server_prompt = HELPERS['request'](8093,'/apply-template',dict(messages=messages,
                                    chat_template_kwargs={'enable_thinking':profile['thinking']},reasoning_effort=payload['reasoning_effort']))['prompt']
                                server_ids = HELPERS['request'](8093,'/tokenize',dict(content=prompt,add_special=False,parse_special=True))['tokens']
                                trace = dict(serverRenderedPrompt=server_prompt,officialTokenizerMatch=server_ids==ids,exactPromptMatch=server_prompt==prompt)
                                if server_ids!=ids or server_prompt!=prompt: raise ValueError('Official template/token parity failure')
                                value = HELPERS['request'](8093,'/v1/chat/completions',payload)
                                if len(value.get('choices',[]))!=1: raise ValueError('Unexpected completion count')
                                text = value['choices'][0]['message'].get('content') or ''
                                if not isinstance(text,str): raise ValueError('Non-text final answer')
                            except Exception as issue: error=type(issue).__name__+': '+str(issue)[:1000]
                            detail = dict(rawEnvelope=value,trace=trace,requestedPayload=payload,
                                outputAtLimit=bool(value.get('choices') and value['choices'][0].get('finish_reason')=='length'),
                                reasoningPresent=bool(value.get('choices') and value['choices'][0]['message'].get('reasoning_content')))
                            row = dict(condition=profile['id'],set=set_name,id=case['id'],turn=index+1,messages=messages,
                                officialPrompt=prompt,officialTokenIds=ids,rawText=text,runtimeError=error,detail=detail,
                                latencyMs=(time.perf_counter()-started)*1000,score=HELPERS['score'](turn,text,error))
                            rows.append(row)
                            with (args.output/'predictions.jsonl').open('a') as handle: handle.write(json.dumps(row,ensure_ascii=False)+'\n')
                            print('PREDICTION '+json.dumps(row,ensure_ascii=False),flush=True)
                            history += [{'role':'user','content':turn['user']},{'role':'assistant','content':text or '[unavailable]'}]
            finally:
                process.terminate()
                try: process.wait(timeout=15)
                except subprocess.TimeoutExpired: process.kill(); process.wait()
    groups = {}
    for row in rows:
        key = row['condition']+'/'+row['set']
        group = groups.setdefault(key,dict(turns=0,patternPass=0,runtimeErrors=0,emptyFinal=0,outputAtLimit=0,reasoningPresent=0,latencies=[]))
        group['turns']+=1; group['patternPass']+=row['score']['patternPass']; group['runtimeErrors']+=row['runtimeError'] is not None
        group['emptyFinal']+=not bool(row['rawText'].strip()); group['outputAtLimit']+=row['detail']['outputAtLimit']
        group['reasoningPresent']+=row['detail']['reasoningPresent']; group['latencies'].append(row['latencyMs'])
    for group in groups.values(): group['medianCpuLatencyMs']=statistics.median(group.pop('latencies'))
    save('report.json',dict(conditions=groups,records=len(rows),phoneTested=False,releaseApproved=False,
        note='Fresh and observed regression cases reported separately. Keyword patterns are not semantic approval. Phone integration requires manual quality review and native APK/device QA.'))
    if len(rows)!=36 or any(row['runtimeError'] for row in rows): raise RuntimeError('Incomplete probe; preserve partial results')


if __name__=='__main__': main()
