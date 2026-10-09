"""Isolated candidate probe, never a production action parser or app mutation path."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'training' / 'assistant-capability'


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load_suite():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    for name, digest in manifest['files'].items():
        if sha(ROOT / name) != digest:
            raise ValueError('Frozen capability input changed: ' + name)
    rows = [json.loads(line) for line in (ROOT / 'eval-v1.jsonl').read_text().splitlines() if line.strip()]
    if len(rows) != 24 or len({row['id'] for row in rows}) != 24:
        raise ValueError('Incomplete or duplicate capability cases')
    return rows, (ROOT / 'system.txt').read_text(), manifest


def subset(actual, expected):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(key in actual and subset(actual[key], value) for key, value in expected.items())
    # Booleans are not valid integers for task durations or weekday numbers.
    return type(actual) is type(expected) and actual == expected


def score(turn, text, finish_reason='stop'):
    result = {'valid': False, 'objectivePass': False, 'reviewRequired': 'review' in turn,
              'reviewRubric': turn.get('review'), 'errors': []}
    try:
        if finish_reason != 'stop':
            raise ValueError('generation-incomplete')
        value = json.loads(text)
        if not isinstance(value, dict) or set(value) != {'intent', 'answer', 'task', 'schedule', 'missingFields'}:
            raise ValueError('invalid-envelope')
        if value['intent'] not in ['reply', 'task', 'schedule', 'clarify', 'decline']:
            raise ValueError('invalid-intent')
        if not isinstance(value['answer'], str) or not value['answer'].strip() or len(value['answer']) > 3000:
            raise ValueError('invalid-answer')
        missing = value['missingFields']
        if not isinstance(missing, list) or len(missing) > 6 or any(not isinstance(item, str) for item in missing):
            raise ValueError('invalid-missing-fields')
        task = value['task']
        if task is not None:
            if not isinstance(task, dict) or set(task) != {'title', 'deadline', 'durationMinutes', 'priority'}:
                raise ValueError('invalid-task')
            if not isinstance(task['title'], str) or not task['title'].strip() or len(task['title']) > 300:
                raise ValueError('invalid-title')
            if task['priority'] not in ['low', 'normal', 'high']:
                raise ValueError('invalid-priority')
            if task['durationMinutes'] is not None and (type(task['durationMinutes']) is not int or not 1 <= task['durationMinutes'] <= 1440):
                raise ValueError('invalid-duration')
            if task['deadline'] is not None:
                from datetime import date
                if not isinstance(task['deadline'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', task['deadline']):
                    raise ValueError('invalid-date')
                date.fromisoformat(task['deadline'])
        schedule = value['schedule']
        if schedule is not None:
            if not isinstance(schedule, dict) or set(schedule) != {'days', 'start', 'end'}:
                raise ValueError('invalid-schedule')
            days = schedule['days']
            if not isinstance(days, list) or not days or len(set(days)) != len(days) or any(type(day) is not int or day not in range(7) for day in days):
                raise ValueError('invalid-days')
            for key in ['start', 'end']:
                if not isinstance(schedule[key], str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', schedule[key]):
                    raise ValueError('invalid-time')
            if schedule['start'] >= schedule['end']:
                raise ValueError('invalid-interval')
        if value['intent'] in ['reply', 'decline'] and (task is not None or schedule is not None):
            raise ValueError('reply-has-proposal')
        if value['intent'] == 'task' and (task is None or task['deadline'] is None or task['durationMinutes'] is None or schedule is not None or missing):
            raise ValueError('incomplete-task-proposal')
        if value['intent'] == 'schedule' and (schedule is None or task is not None or missing):
            raise ValueError('incomplete-schedule-proposal')
        result['valid'] = True
        if not subset(value, turn['expect']):
            result['errors'].append('expected-fields-mismatch')
        if 'answerPattern' in turn and re.search(turn['answerPattern'], value['answer'], re.I) is None:
            result['errors'].append('answer-check-mismatch')
        for required in turn.get('requiredMissing', []):
            if not any(required.lower() in field.lower() for field in missing):
                result['errors'].append('missing-clarification-field')
        result['objectivePass'] = not result['errors']
        result['value'] = value
    except (ValueError, TypeError, KeyError) as error:
        result['errors'].append(str(error))
    return result
