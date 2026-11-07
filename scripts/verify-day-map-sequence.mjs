// Exercise the component's event wiring without pretending to render Android.
// Native primitives are inert nodes; the real JSX and callbacks run unchanged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/today/DayMapSequence.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} });
const module = { exports: {} };
new Function('require', 'module', 'exports', outputText)((id) => {
  if (id === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: (s) => s } };
  if (id.endsWith('/AppIcon')) return { AppIcon: 'AppIcon' };
  if (id.endsWith('/TimeBrick')) return { TimeBrick: 'TimeBrick' };
  if (id.endsWith('/tokens')) return { chalkTheme: {} };
  return require(id);
}, module, module.exports);
const { DayMapSequence } = module.exports;
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object') return [];
  return [node, ...flatten(node.props?.children)];
}
const step = (id, extra = {}) => ({ id, kind: 'task', taskId: id, topicId: null, title: `Task ${id}`, subject: '', minutes: 35, completed: false, current: false, scheduledStart: 0, scheduledEnd: 0, mode: 'study', ...extra });
for (const count of [0, 1, 12]) {
  const opened = [], completed = [];
  const steps = Array.from({ length: count }, (_, i) => step(String(i), { completed: i > 0 && i % 2 === 0 }));
  const nodes = flatten(DayMapSequence({ steps, onOpen: s => opened.push(s.id), onComplete: s => completed.push(s.id) }));
  const open = nodes.filter(n => n.props?.testID?.startsWith('day-map-open-'));
  assert.equal(open.length, count, 'every real step must be available');
  open.forEach(n => n.props.onPress());
  assert.deepEqual(opened, steps.map(s => s.id));
  assert.deepEqual(completed, [], 'opening details must never mark work done');
  const complete = nodes.filter(n => n.props?.testID?.startsWith('day-map-complete-'));
  complete.forEach(n => n.props.onPress());
  assert.deepEqual(completed, steps.filter(s => !s.completed).map(s => s.id));
  assert(open.every(n => !flatten(n.props.children).some(child => child.type === 'Pressable')), 'completion controls must not nest inside detail buttons');
}
const topic = flatten(DayMapSequence({ steps: [step('topic', { kind: 'topic', taskId: null, topicId: 't' })], onOpen() {}, onComplete() { throw Error('Topic must not use task completion'); } }));
assert(!topic.some(n => n.props?.testID?.startsWith('day-map-complete-')));
console.log('✓ empty, single and busy sequences retain every step; opening and completing are independent; topics never use task completion');
