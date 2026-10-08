"""Fail-closed dataset and token checks shared by preflight and training."""
from __future__ import annotations

import json
from collections import Counter
from typing import Any

ACTION_TYPES = {'create_topic', 'update_topic', 'create_task', 'create_exam', 'generate_exam_plan'}


def audit_balance(rows: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = [json.loads(row['messages'][2]['content']) for row in rows]
    routes = Counter(d['route'] for d in decisions)
    actions = Counter(a['type'] for d in decisions for a in d.get('batch', {}).get('actions', []))
    problems = []
    for route in ('actions', 'clarify', 'escalate'):
        if routes[route] < len(rows) * 0.15:
            problems.append(f'{route} must cover at least 15% of training rows')
    missing = ACTION_TYPES - actions.keys()
    if missing:
        problems.append('Missing action types: ' + ', '.join(sorted(missing)))
    if actions and max(actions.values()) / sum(actions.values()) > 0.65:
        problems.append('One action type exceeds 65% of action examples')
    return {'rows': len(rows), 'routes': dict(routes), 'actionTypes': dict(actions), 'problems': problems}


def tokenize_and_audit(rows: list[dict[str, Any]], tokenizer: Any, max_length: int, *, enable_thinking: bool | None = False) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Render exactly the no-thinking inference prefix and never truncate targets."""
    if max_length < 1:
        raise ValueError('max_length must be positive')
    tokenized = []
    details = []
    template_kwargs = {} if enable_thinking is None else {'enable_thinking': enable_thinking}
    for row in rows:
        messages = row['messages']
        prefix = tokenizer.apply_chat_template(messages[:2], tokenize=True,
            add_generation_prompt=True, return_dict=False, **template_kwargs)
        full = tokenizer.apply_chat_template(messages, tokenize=True,
            add_generation_prompt=False, return_dict=False, **template_kwargs)
        matches = full[:len(prefix)] == prefix
        completion = len(full) - len(prefix)
        problems = []
        if not matches:
            problems.append('prompt-prefix-mismatch')
        if completion <= 0:
            problems.append('empty-completion')
        if len(full) > max_length:
            problems.append('target-would-be-truncated')
        details.append({'id': row['id'], 'promptTokens': len(prefix), 'completionTokens': completion,
            'totalTokens': len(full), 'problems': problems})
        # TRL recognizes pretokenized data. These exact audited tokens and masks
        # are used for training, avoiding a second, different chat-template pass.
        tokenized.append({'input_ids': full, 'completion_mask': [0] * len(prefix) + [1] * max(0, completion)})
    report = {'rows': len(rows), 'maxLength': max_length, 'enableThinking': enable_thinking,
        'maxTotalTokens': max((r['totalTokens'] for r in details), default=0),
        'failedRows': sum(bool(r['problems']) for r in details), 'details': details}
    return tokenized, report
