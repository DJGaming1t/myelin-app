from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib.metadata
import inspect
import json
import os
import platform
import statistics
import time
from pathlib import Path

from assistant_capability import ROOT as CAPABILITY_ROOT, sha
from assistant_diagnostic import evaluate, load_diagnostic, native_response


def save(path, value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n')


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--candidate',required=True)
    parser.add_argument('--runtime',required=True,choices=['0.15.0','0.18.0'])
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    cases,settings,prompts,manifest=load_diagnostic()
    version=importlib.metadata.version('litert-lm-api')
    if version!=args.runtime or args.runtime not in settings['runtimes']:
        raise ValueError('Unpinned native runtime')
    args.output.mkdir(parents=True,exist_ok=True)

    import litert_lm
    from litert_lm import conversation, engine, interfaces, utils
    from litert_lm._ffi import _get_lib
    from huggingface_hub import hf_hub_download

    send_source=inspect.getsource(conversation.Conversation._create_optional_args)
    sampler_source=inspect.getsource(utils._sampler_config_to_params)
    symbol='litert_lm_repetition_penalty_config_set_presence_penalty'
    if symbol not in send_source or not hasattr(_get_lib(),symbol):
        raise ValueError('Native presence penalty is not wired')
    for key in ['top_k','top_p','temperature','seed']:
        if key not in sampler_source: raise ValueError('Sampler setting not wired: '+key)
    audit={'sdk':version,'symbolAvailable':symbol,
           'apiSignatures':{'createConversation':str(inspect.signature(litert_lm.Engine.create_conversation)),
                            'sendMessage':str(inspect.signature(conversation.Conversation.send_message)),
                            'sampler':str(inspect.signature(litert_lm.SamplerConfig)),
                            'penalty':str(inspect.signature(litert_lm.RepetitionPenaltyConfig))},
           'presenceForwardingSource':send_source,'samplerForwardingSource':sampler_source,
           'moduleHashes':{module.__name__:sha(module.__file__) for module in [conversation,engine,interfaces,utils]},
           'nativeLibraries':{str(p.name):sha(p) for p in sorted(Path(litert_lm.__file__).parent.rglob('*.so'))},
           'note':'Public SDK settings passed to native setters; no CLI body fields, monkeypatch or imitation model.'}
    save(args.output/'native-api-audit.json',audit)
    candidate=next(x for x in json.loads((CAPABILITY_ROOT/'candidates.json').read_text())['models'] if x['id']==args.candidate)
    started=time.perf_counter()
    path=Path(hf_hub_download(candidate['repo'],candidate['file'],revision=candidate['revision'],token=False)).absolute()
    if path.suffix!='.litertlm' or path.stat().st_size!=candidate['sizeBytes'] or sha(path)!=candidate['sha256']:
        raise ValueError('Native bundle identity/extension mismatch')
    provenance={'sourceCommit':os.environ.get('GITHUB_SHA'),'candidate':candidate,'suite':manifest,
                'runtime':version,'python':platform.python_version(),'platform':platform.platform(),
                'cpuCount':os.cpu_count(),'settings':settings,'downloadAndHashSeconds':time.perf_counter()-started,
                'promptHashes':{key:hashlib.sha256(value.encode()).hexdigest() for key,value in prompts.items()},
                'modelReference':str(path),'phoneTested':False,'appProtocolTested':False,
                'note':'Native Python SDK experiment, not the CLI server or Android app. Greedy/sample comparisons use fresh conversations and one seed; no general accuracy certificate.'}
    save(args.output/'provenance.json',provenance)
    predictions=[]; model_started=time.perf_counter()
    with litert_lm.Engine(str(path),backend=litert_lm.Backend.CPU(thread_count=2),
                         max_num_tokens=4096,cache_dir=':memory:',vision_backend=None,audio_backend=None,
                         enable_benchmark=True,use_ringbuffers_local_attention=True) as model:
        provenance['engineLoadSeconds']=time.perf_counter()-model_started
        save(args.output/'provenance.json',provenance)
        for profile in settings['profiles']:
            sampler=litert_lm.SamplerConfig(**profile['sampler'])
            penalty=None if profile['penalty'] is None else litert_lm.RepetitionPenaltyConfig(**profile['penalty'])
            if dataclasses.asdict(sampler)!=profile['sampler']:
                raise ValueError('Sampler configuration mismatch')
            if penalty is not None and dataclasses.asdict(penalty)!=profile['penalty']:
                raise ValueError('Penalty configuration mismatch')
            for prompt_id in settings['prompts']:
                for case in cases:
                    messages=[{'role':'system','content':prompts[prompt_id]}]
                    for index,turn in enumerate(case['turns']):
                        begun=time.perf_counter(); text=''; error=None; raw=None; benchmark=None; benchmark_error=None
                        try:
                            # Rebuild from explicit actual history, as the CLI did.
                            # Cases/profiles/prompts do not inherit hidden state.
                            with model.create_conversation(messages=messages,tools=None,
                                      automatic_tool_calling=False,sampler_config=sampler,
                                      max_output_tokens=settings['maxOutputTokens']) as conv:
                                result=conv.send_message(turn['user'],max_output_tokens=settings['maxOutputTokens'],
                                                         repetition_penalty_config=penalty)
                                raw=result.to_json() if hasattr(result,'to_json') else result
                                raw,text=native_response(raw)
                                try: benchmark=dataclasses.asdict(conv.get_benchmark_info())
                                except Exception as issue: benchmark_error=type(issue).__name__+': '+str(issue)[:300]
                        except Exception as issue:
                            error=type(issue).__name__+': '+str(issue)[:600]
                        record={'candidate':candidate['id'],'runtime':version,'profile':profile['id'],'prompt':prompt_id,
                                'id':case['id'],'turn':index+1,'category':case['category'],
                                'latencyMs':(time.perf_counter()-begun)*1000,'rawEnvelope':raw,'rawText':text,
                                'runtimeError':error,'benchmark':benchmark,'benchmarkError':benchmark_error,
                                'settingsUsed':{'sampler':dataclasses.asdict(sampler),
                                                'penalty':None if penalty is None else dataclasses.asdict(penalty)},
                                'score':evaluate(turn,text,prompt_id,error)}
                        predictions.append(record)
                        with (args.output/'predictions.jsonl').open('a') as out: out.write(json.dumps(record,ensure_ascii=False)+'\n')
                        # Preserve every complete record in logs, including partial-run failures.
                        print('PREDICTION '+json.dumps(record,ensure_ascii=False),flush=True)
                        messages.extend([{'role':'user','content':turn['user']},
                                         {'role':'assistant','content':text or '[generation unavailable]'}])
    groups={}
    for row in predictions:
        key=row['profile']+'/'+row['prompt']
        group=groups.setdefault(key,{'turns':0,'valid':0,'objectivePass':0,'runtimeErrors':0,'outputAtLimit':0,'latencies':[]})
        group['turns']+=1; group['valid']+=row['score']['valid']; group['objectivePass']+=row['score']['objectivePass']
        group['runtimeErrors']+=row['runtimeError'] is not None
        group['outputAtLimit']+=bool(row['benchmark'] and row['benchmark']['last_decode_token_count']>=settings['maxOutputTokens'])
        if row['runtimeError'] is None: group['latencies'].append(row['latencyMs'])
    for group in groups.values():
        values=group.pop('latencies'); group['medianLatencyMs']=statistics.median(values) if values else None
    report={'sourceCommit':provenance['sourceCommit'],'candidate':candidate['id'],'runtime':version,
            'turns':len(predictions),'expectedTurns':manifest['turnsPerJob'],'groups':groups,
            'releaseApproved':False,'semanticQualityCertified':False,
            'note':'Plain answers use text/pattern checks; JSON modes use the exact existing envelope scorer. All content needs qualitative review. No grammar enforcement, generated retries or output repair. Generation profile jointly changes sampling/presence penalty; no individual causal claim.'}
    save(args.output/'report.json',report)
    for name in ['native-api-audit.json','provenance.json','report.json']:
        print('EVIDENCE_BEGIN '+name,flush=True);print((args.output/name).read_text(),flush=True);print('EVIDENCE_END '+name,flush=True)
    if len(predictions)!=manifest['turnsPerJob'] or any(x['runtimeError'] for x in predictions):
        raise RuntimeError('Incomplete native diagnostic; preserved raw evidence is not a quality score')


if __name__=='__main__': main()
