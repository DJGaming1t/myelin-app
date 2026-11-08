import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const tabs = readFileSync('app/(app)/(main)/_layout.tsx', 'utf8');
assert.match(tabs, /detachInactiveScreens=\{false\}/, 'Keep native tab views attached');
assert.match(tabs, /<AppNav\b/, 'Use one shared floating dock');
for (const name of ['today', 'topics', 'review', 'progress']) {
  const screen = `app/(app)/(main)/${name}/index.tsx`;
  assert.ok(existsSync(screen), `${name} screen remains available`);
  assert.doesNotMatch(readFileSync(screen, 'utf8'), /<AppNav\b/, `${name} must not mount a second dock`);
}
assert.ok(existsSync('app/(app)/(main)/today/day-map.tsx'));
assert.ok(existsSync('app/(app)/(main)/topics/[topicId]/index.tsx'));
// Use Expo Router's own route-tree builder to catch malformed nested layouts.
const require = createRequire(import.meta.url);
const { getRoutes } = require('expo-router/build/getRoutesCore');
const { getReactNavigationConfig } = require('expo-router/build/getReactNavigationConfig');
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.[jt]sx?$/.test(entry.name) ? [`./${relative('app', file)}`] : [];
  });
}
const context = () => ({});
context.keys = () => walk('app');
const root = getRoutes(context, { ignoreEntryPoints: true, platform: 'android' });
const app = root.children.find(child => child.route === '(app)');
const main = app.children.find(child => child.route === '(main)');
assert.deepEqual(main.children.map(child => child.route).sort(), ['progress/index', 'review/index', 'today', 'topics']);
const today = main.children.find(child => child.route === 'today');
assert.ok(today.children.some(child => child.route === 'day-map'), 'Day Map remains in the Today stack');
assert.ok(today.children.some(child => child.route === 'task/[taskId]'), 'Task detail remains in the Today stack');
const config = getReactNavigationConfig(root, true).screens['(app)'].screens['(main)'].screens;
assert.equal(config.today.path, 'today');
assert.equal(config.today.screens['day-map'], 'day-map');
assert.equal(config.today.screens['task/[taskId]'], 'task/:taskId');
assert.equal(config.topics.path, 'topics');
assert.equal(config['review/index'], 'review');
assert.equal(config['progress/index'], 'progress');
console.log('Shared tab structure checks passed');
