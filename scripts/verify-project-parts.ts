import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { validateWorkspaceV2 } from '../src/data/validation';
import { buildDayMap } from '../src/features/planning/day-engine';
import { createProjectParts, parseProjectDay } from '../src/features/planning/project-parts';
import { buildTodayPlan } from '../src/features/today/planner';

const now = new Date(2026, 9, 30, 10).getTime();
const tomorrow = new Date(2026, 9, 31, 10).getTime();
const input = { title: 'History project', subject: 'History', deadline: '2026-11-01', now, parts: [
  { title: 'Research', day: '2026-10-30', minutes: '35' },
  { title: 'Draft', day: '2026-10-31', minutes: '45' },
] };
const result = createProjectParts(input);
assert.equal(result.error, null);
assert.ok(result.tasks);
assert.equal(result.tasks.length, 2);
assert.equal(result.tasks[0].title, 'History project: Research');
assert.equal(result.tasks[0].postponedUntil, 0);
assert.equal(result.tasks[1].postponedUntil, parseProjectDay('2026-10-31'));
assert.notEqual(result.tasks[0].id, result.tasks[1].id);

const workspace = createEmptyWorkspace(now);
workspace.tasks.push(...result.tasks);
const restored = validateWorkspaceV2(JSON.parse(JSON.stringify(workspace)));
assert.deepEqual(restored.tasks.map(task => [task.title, task.postponedUntil, task.estimatedMinutes, task.dueAt]),
  result.tasks.map(task => [task.title, task.postponedUntil, task.estimatedMinutes, task.dueAt]));
assert.equal(buildDayMap(restored, now).plannedStudyMinutes, 35);
assert.equal(buildDayMap(restored, tomorrow).plannedStudyMinutes, 80);
assert.ok(!buildTodayPlan(restored, now, 120).blocks.some(block => block.taskId === result.tasks![1].id));
restored.tasks[0].status = 'completed';
assert.ok(buildTodayPlan(restored, tomorrow, 120).blocks.some(block => block.taskId === result.tasks![1].id));
assert.equal(createProjectParts({ ...input, title: ' ' }).tasks, null);
assert.equal(createProjectParts({ ...input, parts: [input.parts[0]] }).tasks, null);
assert.equal(createProjectParts({ ...input, parts: [input.parts[0], { ...input.parts[1], day: '2026-02-30' }] }).tasks, null);
assert.equal(createProjectParts({ ...input, parts: [input.parts[0], { ...input.parts[1], day: '2026-11-02' }] }).tasks, null);
assert.equal(createProjectParts({ ...input, parts: [input.parts[0], { ...input.parts[1], minutes: '0' }] }).tasks, null);
console.log('Project parts: validation, persistence and day eligibility passed.');
