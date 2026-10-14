/// <reference types="node" />
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/** Exercise the actual presentation hook with controlled asynchronous native measurements. */
export async function verifyGuideScroll() {
  const source = ts.transpileModule(fs.readFileSync('src/features/guides/useScreenGuide.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  function harness() {
    const calls: { y: number; animated: boolean }[] = [];
    const refs: { current: unknown }[] = [];
    const target = {}, viewport = {};
    let measure: (node: unknown) => Promise<unknown> = async node => node === target
      ? { x: 20, y: 300, width: 100, height: 48 } : { x: 0, y: 50, width: 320, height: 400 };
    const exported: { exports: Record<string, (...args: any[]) => any> } = { exports: {} };
    vm.runInNewContext(source, {
      module: exported, exports: exported.exports,
      setTimeout: (resolve: () => void) => { resolve(); return 0; },
      require(name: string) {
        if (name === 'react') return {
          useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
          useState: (value: unknown) => [value, () => {}],
          useCallback: (callback: unknown) => callback, useEffect: () => {},
        };
        if (name === 'react-native') return { Keyboard: { dismiss: () => {} } };
        if (name === 'expo-router') return { router: { setParams: () => {} }, useFocusEffect: () => {}, useLocalSearchParams: () => ({}) };
        if (name === './measure-guide-view') return { measureGuideView: (node: unknown) => measure(node) };
        throw new Error('Unexpected hook dependency: ' + name);
      },
    });
    const guide = exported.exports.useScreenGuide(true, 'user:test', 'today', { 'today.next': { current: target } }, []);
    // Copy VM objects into this realm so assertions compare values, not realm prototypes.
    refs[1].current = { getNativeScrollRef: () => viewport, scrollTo: (options: { y: number; animated: boolean }) => calls.push({ y: options.y, animated: options.animated }) };
    guide.offset.current = 200;
    guide.start();
    return { guide, calls, setMeasure: (next: typeof measure) => { measure = next; } };
  }
  const live = harness();
  await live.guide.revealAnchor('today.next');
  assert.deepEqual(live.calls, [{ y: 434, animated: false }], 'Live measured anchor scrolls immediately to the viewport inset.');
  live.guide.close(); assert.deepEqual(live.calls[1], { y: 200, animated: false }, 'Closing restores original scroll.');

  for (const mode of ['superseded', 'closed']) {
    const scene = harness(); let resolve!: (value: unknown) => void;
    const pending = new Promise(done => { resolve = done; });
    scene.setMeasure(() => pending);
    let current = true;
    const operation = scene.guide.revealAnchor('today.next', () => current);
    if (mode === 'superseded') current = false;
    else scene.guide.close();
    resolve({ x: 20, y: 300, width: 100, height: 48 }); await operation;
    assert.deepEqual(scene.calls, mode === 'closed' ? [{ y: 200, animated: false }] : [], 'Late measurement cannot scroll after cancellation/close.');
  }
  console.log('✓ Actual guide hook scrolls live anchors, restores offsets and rejects stale asynchronous scroll requests');
}
