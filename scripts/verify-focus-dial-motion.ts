import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as tokens from '../src/theme/tokens';
import * as geometry from '../src/features/focus/focus-dial-layout';

// Execute the real dial component: reduced motion must bypass animation calls,
// and pausing must never fade the countdown text along with the decorative ring.
const source = fs.readFileSync('app/(app)/focus/index.tsx', 'utf8');
let reduced = false;
let animationCalls = 0;
const jsx = (type: unknown, props: any) => ({ type, props });
const moduleObject = { exports: {} as any };
vm.runInNewContext(ts.transpileModule(source + '\nexport { TimerDial };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, {
  module: moduleObject, exports: moduleObject.exports,
  require(name: string) {
    if (name === 'react') return { useEffect: (effect: () => void) => effect() };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-native') return {
      View: 'View', Text: 'Text', StyleSheet: { create: (styles: any) => styles, absoluteFill: {} },
    };
    if (name === 'react-native-reanimated') return {
      __esModule: true, default: { View: 'Animated.View' },
      useSharedValue(value: number) { return { get: () => value, set: (next: number) => { value = next; } }; },
      useAnimatedStyle: (getStyle: () => unknown) => getStyle(),
      cancelAnimation() {},
      withSpring(value: number) { animationCalls++; return value; },
      withTiming(value: number) { animationCalls++; return value; },
    };
    if (name.endsWith('/tokens')) return tokens;
    if (name.endsWith('/focus-dial-layout')) return geometry;
    if (name.endsWith('/useReducedMotion')) return { useReducedMotion: () => reduced };
    return {};
  },
});

const flatten = (style: any): any => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style || {};
for (const reduceMotion of [false, true]) {
  for (const size of [128, 168, 228]) {
    for (const phase of ['focus', 'break'] as const) {
      for (const state of ['running', 'paused', 'complete'] as const) {
        reduced = reduceMotion;
        animationCalls = 0;
        const complete = state === 'complete';
        const paused = state === 'paused';
        const output = moduleObject.exports.TimerDial({
          value: '12:34', label: state.toUpperCase(), size, phase, paused, complete, progress: 0.25,
        });
        const dial = output.props.children;
        const dialStyle = flatten(dial.props.style);
        assert.equal(dialStyle.opacity, undefined, 'Do not fade the parent of the countdown text.');
        assert.equal(dialStyle.transform[0].scale, reduced ? 1 : complete ? 1.015 : paused ? 0.988 : 1);
        assert.equal(animationCalls, reduced ? 0 : 2);
        const [ring, ticks, inner] = dial.props.children;
        assert.equal(flatten(ring.props.style).opacity, (paused ? 0.62 : 1) * 0.55);
        assert.equal(ticks.props.children.length, geometry.FOCUS_PROGRESS_MARKS);
        assert.deepEqual(Array.from(flatten(inner.props.children[0].props.style).fontVariant), ['tabular-nums']);
        const currentTick = flatten(ticks.props.children[10].props.style);
        assert.equal(currentTick.backgroundColor, complete || phase === 'break' ? tokens.colors.success : tokens.colors.accentBright);
        for (const tick of ticks.props.children) {
          const style = flatten(tick.props.style);
          assert.ok(style.left >= 0 && style.top >= 0 && style.left + style.width <= size && style.top + style.height <= size);
        }
      }
    }
  }
}
console.log('✓ Actual dial: 36 size/phase/state/motion combinations preserve text contrast, geometry and reduced motion');
