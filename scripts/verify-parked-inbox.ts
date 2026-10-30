import assert from 'node:assert/strict';
import { createEmptyWorkspace } from '../src/data/schema';
import { saveParkedThoughts } from '../src/features/focus/parked-inbox';

const workspace = createEmptyWorkspace();
const thought = { id: 'p1', text: 'Read the chapter', createdAt: 100 };
saveParkedThoughts(workspace, 'focus1', [thought], 'Math', null);
saveParkedThoughts(workspace, 'focus1', [thought], 'Math', null);
assert.equal(workspace.tasks.length, 1, 'A retry must not duplicate a parked thought');
assert.equal(workspace.tasks[0].title, thought.text);
assert.equal(workspace.tasks[0].planState, 'inbox');
console.log('Parked thought conversion is idempotent.');
