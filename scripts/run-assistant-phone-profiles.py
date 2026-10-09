"""Probe existing converted phone weights with bounded actual reasoning."""
import argparse
import importlib.metadata
import json
import os
import runpy
import statistics
import subprocess
import time
from pathlib import Path

from assistant_capability import sha

ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / 'training/assistant-capability/phone-v5'
HELPERS = runpy.run_path(str(ROOT / 'scripts/run-assistant-gguf.py'))


def load():
    manifest = json.loads((PROBE / 'manifest.json').read_text())
    for name, digest in manifest['sha256'].items():
        if sha(PROBE / name) != digest: raise ValueError('Frozen v5 input changed: '+name)
    regression, original_settings, _, regression_manifest = HELPERS['load_probe']()
    fresh = [json.loads(line) for line in (PROBE / 'cases.jsonl').read_text().splitlines()]
    if len(fresh)!=6 or sum(len(case['turns']) for case in fresh)!=8: raise ValueError('v5 case count changed')
    return fresh, regression, json.loads((PROBE / 'settings.json').read_text()), (PROBE / 'system.txt').read_text().strip(), manifest, original_settings, regression_manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--llama', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); args.output.mkdir(parents=True, exist_ok=True)
    fresh, regression, settings, system, manifest, original_settings, regression_manifest = load()
    if subprocess.check_output(['git','-C',str(args.llama),'rev-parse','HEAD'],text=True).strip()!=settings['runtimeLlamaCommit']:
        raise ValueError('Runtime differs from phone-library backend pin')
    model = args.models / settings['modelFile']
    if model.stat().st_size != settings['modelBytes'] or sha(model)!=settings['modelSha256']:
        raise ValueError('Converted model identity mismatch')
    source_manifest = json.loads((args.models/'model-manifest.json').read_text())
    if source_manifest['llamaCommit']!=settings['conversionLlamaCommit'] or source_manifest['artifacts']['q4_k_m']['sha256']!=settings['modelSha256']:
        raise ValueError('Conversion lineage mismatch')
    folder, identities = HELPERS['snapshot'](original_settings, False)
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    versions = {name:importlib.metadata.version(name) for name in ['torch','transformers','huggingface-hub']}
    if versions['torch'].split('+')[0]!='2.8.0' or versions['transformers']!='5.3.0' or versions['huggingface-hub']!='1.3.0':
        raise ValueError('Dependency mismatch')
    save = lambda name,value: HELPERS['save'](args.output,name,value)
    provenance = dict(sourceCommit=os.environ.get('GITHUB_SHA'), settings=settings, manifest=manifest,
        regressionManifest=regression_manifest, originalTokenizerFiles=identities, conversionManifest=source_manifest,
        runtimeBinarySha256=sha(args.llama/'build/bin/llama-server'),
        runtimeQwenSourceSha256=sha(args.llama/'src/models/qwen35.cpp'), versions=versions,
        phoneTested=False, releaseApproved=False, note='Linux CPU at phone-library llama.cpp pin, not Android JNI or phone QA. One seed, no quality retry. New prompt/sampler/runtime/budget compared as whole profiles, no single-cause claim.')
    save('provenance.json',provenance)
    rows = []
    for profile in settings['profiles']:
        command = [str(args.llama/'build/bin/llama-server'),'-m',str(model),'--host','127.0.0.1','--port','8092',
            '-c',str(settings['contextTokens']),'-t',str(settings['threads']),'-ngl','0','-np','1','--no-warmup',
            '--jinja','--reasoning-format','deepseek','--reasoning-budget',str(profile['thinkingBudget'])]
        with (args.output/('server-'+profile['id']+'.log')).open('w') as log:
            process = subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
            try:
                deadline=time.monotonic()+150
                while True:
                    if process.poll() is not None: raise RuntimeError('Server exited before ready; inspect log')
                    try:
                        if HELPERS['request'](8092,'/health').get('status')=='ok':break
                    except Exception:pass
                    if time.monotonic()>deadline:raise TimeoutError('Model loading deadline')
                    time.sleep(1)
                save('server-props-'+profile['id']+'.json',dict(command=command,props=HELPERS['request'](8092,'/props')))
                for set_name,cases in [('fresh',fresh),('observed-v4-regression',regression)]:
                    for case in cases:
                        history=[{'role':'system','content':system}]
                        for index,turn in enumerate(case['turns']):
                            messages=history+[{'role':'user','content':turn['user']}]
                            prompt=tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=True,enable_thinking=profile['thinking'])
                            ids=tokenizer(prompt,add_special_tokens=False)['input_ids']
                            if len(ids)+profile['outputTokens']>settings['contextTokens']:raise ValueError('Context overflow')
                            started=time.perf_counter();value={};text='';error=None;trace={}
                            try:
                                server_prompt=HELPERS['request'](8092,'/apply-template',dict(messages=messages,chat_template_kwargs={'enable_thinking':profile['thinking']},reasoning_effort='none' if not profile['thinking'] else 'high'))['prompt']
                                server_ids=HELPERS['request'](8092,'/tokenize',dict(content=prompt,add_special=False,parse_special=True))['tokens']
                                trace=dict(serverRenderedPrompt=server_prompt,officialTokenizerMatch=server_ids==ids,exactPromptMatch=server_prompt==prompt)
                                if server_ids!=ids:raise ValueError('HF/GGUF tokenizer mismatch')
                                # The actual chat endpoint owns its reasoning parser and budget enforcement.
                                # Render tracing records template parity but never substitutes a raw completion.
                                payload=dict(messages=messages,max_tokens=profile['outputTokens'],seed=settings['seed'],stream=False,
                                    cache_prompt=False,chat_template_kwargs={'enable_thinking':profile['thinking']},
                                    reasoning_effort='none' if not profile['thinking'] else 'high',**settings['sampler'])
                                value=HELPERS['request'](8092,'/v1/chat/completions',payload)
                                choices=value.get('choices',[])
                                if len(choices)!=1:raise ValueError('Unexpected completion count')
                                text=choices[0]['message'].get('content') or ''
                                if not isinstance(text,str):raise ValueError('Non-text final answer')
                            except Exception as issue:error=type(issue).__name__+': '+str(issue)[:1000]
                            detail=dict(rawEnvelope=value,trace=trace,outputAtLimit=bool(value.get('choices') and value['choices'][0].get('finish_reason')=='length'),
                                reasoningPresent=bool(value.get('choices') and value['choices'][0]['message'].get('reasoning_content')))
                            row=dict(condition=profile['id'],set=set_name,id=case['id'],turn=index+1,messages=messages,
                                officialPrompt=prompt,officialTokenIds=ids,rawText=text,runtimeError=error,detail=detail,
                                latencyMs=(time.perf_counter()-started)*1000,score=HELPERS['score'](turn,text,error))
                            rows.append(row)
                            with (args.output/'predictions.jsonl').open('a') as handle:handle.write(json.dumps(row,ensure_ascii=False)+'\n')
                            print('PREDICTION '+json.dumps(row,ensure_ascii=False),flush=True)
                            history += [{'role':'user','content':turn['user']},{'role':'assistant','content':text or '[unavailable]'}]
            finally:
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()
    groups={}
    for row in rows:
        key=row['condition']+'/'+row['set']
        group=groups.setdefault(key,dict(turns=0,patternPass=0,runtimeErrors=0,emptyFinal=0,outputAtLimit=0,reasoningPresent=0,latencies=[]))
        group['turns']+=1;group['patternPass']+=row['score']['patternPass'];group['runtimeErrors']+=row['runtimeError'] is not None
        group['emptyFinal']+=not bool(row['rawText'].strip());group['outputAtLimit']+=row['detail']['outputAtLimit'];group['reasoningPresent']+=row['detail']['reasoningPresent'];group['latencies'].append(row['latencyMs'])
    for group in groups.values():group['medianCpuLatencyMs']=statistics.median(group.pop('latencies'))
    save('report.json',dict(conditions=groups,records=len(rows),phoneTested=False,releaseApproved=False,
         note='Fresh v5 and observed v4 separately reported. Automatic patterns are not semantic certification.'))
    if len(rows)!=44 or any(row['runtimeError'] for row in rows):raise RuntimeError('Incomplete profile probe; preserve partial evidence')


if __name__=='__main__':main()
