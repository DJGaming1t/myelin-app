import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  BOTTLE_REVEAL_DURATION_MS,
  CHALK_ACCENT_HEX,
  CHALK_CREAM_HEX,
  CHALK_PROGRESS_HEX,
  CHALK_STAGE_HEX,
  createNativeScene,
  ensureLoaderNavigator,
  getBottleRevealOpacity,
  getBottleMeniscusNormalizedY,
} from '../src/features/today/nativeVisualEngine.js';

function parseGlbJsonHeader(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  assert.equal(magic, 0x46546c67, 'Invalid GLB magic header');
  assert.equal(version, 2, 'Expected GLB version 2');
  assert.equal(totalLength, buffer.byteLength, 'GLB header length mismatch');
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  assert.equal(jsonChunkType, 0x4e4f534a, 'Expected JSON chunk in GLB');
  const jsonBytes = buffer.subarray(20, 20 + jsonChunkLength);
  return JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
}

const root = { navigator: {} };
ensureLoaderNavigator(root);
assert.equal(root.navigator.userAgent, 'ReactNative');

// Verify Stage 2 chalk & dusty-blue color constants
assert.equal(CHALK_STAGE_HEX, '#151514');
assert.equal(CHALK_CREAM_HEX, '#F2E7D0');
assert.equal(CHALK_PROGRESS_HEX, '#7E98A4');
assert.equal(CHALK_ACCENT_HEX, '#9BB8C6');

// The first bottle appearance is an in-place opacity reveal, not a fall.
assert.equal(getBottleRevealOpacity(0), 0);
assert.equal(getBottleRevealOpacity(BOTTLE_REVEAL_DURATION_MS), 1);
assert.equal(getBottleRevealOpacity(0, true), 1);
let previousOpacity = 0;
for (const ms of [0, 16, 100, 230, 350, 459, 460, 1000]) {
  const opacity = getBottleRevealOpacity(ms);
  assert.ok(Number.isFinite(opacity) && opacity >= previousOpacity && opacity <= 1);
  previousOpacity = opacity;
}

// ============================================================================
// ASSET IDENTITY & MODEL INTEGRITY VERIFICATION
// Ensures brain-atlas.glb and 2x2_lego_brick.glb are distinct and genuine
// ============================================================================
const bytes = await readFile(new URL('../assets/visuals/brain-atlas.glb', import.meta.url));
const legoBytes = await readFile(new URL('../assets/visuals/2x2_lego_brick.glb', import.meta.url));

const brainSha256 = createHash('sha256').update(bytes).digest('hex');
const legoSha256 = createHash('sha256').update(legoBytes).digest('hex');

assert.notEqual(
  brainSha256,
  legoSha256,
  'brain-atlas.glb must NOT be identical to 2x2_lego_brick.glb',
);
assert.notEqual(
  bytes.byteLength,
  legoBytes.byteLength,
  'brain-atlas.glb and 2x2_lego_brick.glb must have distinct byte lengths',
);

const brainGltf = parseGlbJsonHeader(bytes);
const legoGltf = parseGlbJsonHeader(legoBytes);

const brainMeshNames = (brainGltf.meshes || []).map((m) => m.name || '');
const legoMeshNames = (legoGltf.meshes || []).map((m) => m.name || '');

// Verify 2x2_lego_brick.glb preserves the genuine Lego brick mesh
assert.ok(
  legoMeshNames.some((n) => /brick|lego/i.test(n)),
  '2x2_lego_brick.glb must contain a Lego brick mesh',
);

// Verify brain-atlas.glb contains genuine multi-hemisphere cortical brain meshes and zero Lego meshes
assert.equal(
  brainMeshNames.some((n) => /brick|lego/i.test(n)),
  false,
  'brain-atlas.glb must not contain any Lego or brick meshes',
);
const corticalMeshes = brainMeshNames.filter((n) =>
  /cortex|frontal|temporal|occipital|parietal|cerebell|brain.stem|pial|hemisphere/i.test(n),
);
assert.ok(
  corticalMeshes.length >= 6,
  `brain-atlas.glb must include bilateral cortical lobes, cerebellum, and brain stem (found ${corticalMeshes.length})`,
);
assert.ok(
  corticalMeshes.some((n) => /left.*frontal/i.test(n)) &&
    corticalMeshes.some((n) => /right.*frontal/i.test(n)) &&
    corticalMeshes.some((n) => /temporal/i.test(n)) &&
    corticalMeshes.some((n) => /parietal/i.test(n)) &&
    corticalMeshes.some((n) => /occipital/i.test(n)) &&
    corticalMeshes.some((n) => /cerebell/i.test(n)) &&
    corticalMeshes.some((n) => /brain.stem/i.test(n)),
  'brain-atlas.glb must contain Left/Right Frontal, Parietal, Temporal, Occipital cortices, Cerebellum, and Brain Stem',
);

// Negative test: verify BrainRenderer actively rejects 2x2_lego_brick.glb if passed as brain modelBuffer
const wrongModelErrors = [];
const origConsoleError = console.error;
console.error = () => {};
try {
  const wrongEngine = createNativeScene(
    legoBytes.buffer.slice(legoBytes.byteOffset, legoBytes.byteOffset + legoBytes.byteLength),
    (e) => wrongModelErrors.push(e),
  );
  for (let i = 0; i < 25 && !wrongModelErrors.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(
    wrongModelErrors.length > 0,
    'BrainRenderer must reject 2x2_lego_brick.glb when inspected as brain-atlas.glb',
  );
  assert.equal(
    wrongEngine.scene.children[0].children.length,
    0,
    'BrainRenderer must not populate brainGroup from a non-brain Lego brick mesh',
  );
  wrongEngine.dispose();
} finally {
  console.error = origConsoleError;
}

const errors = [];
const engine = createNativeScene(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteLength + bytes.byteOffset),
  (e) => errors.push(e),
);
const groups = engine.scene.children;
for (let i = 0; i < 50 && !groups[0].children.length; i++) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.equal(errors.length, 0, errors.join('\n'));
assert.ok(groups[0].children.length, 'Offline brain must load');
const brainPoints = groups[0].children[0];
const brainPosAttr = brainPoints?.geometry?.attributes?.position;
assert.ok(brainPosAttr && brainPosAttr.count >= 40000, 'Brain point cloud must contain ~44,000 cortical surface points');
const names = ['brain', 'bottle', 'stopwatch', 'cube', 'chess'];
const drag = { x: 0, y: 0 };
let elapsed = 0,
  previous = null,
  maxFrameAngle = 0;
const seen = new Set(),
  sizes = [];

function bounds(group) {
  engine.scene.updateMatrixWorld(true);
  engine.camera.updateMatrixWorld(true);
  const min = new THREE.Vector2(Infinity, Infinity),
    max = new THREE.Vector2(-Infinity, -Infinity),
    v = new THREE.Vector3();
  group.traverseVisible((o) => {
    const a = o.geometry?.attributes.position;
    if (!a || o.material?.colorWrite === false) return;
    // Sample the complete point cloud rather than only its enclosing box.
    for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 1800))) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).project(engine.camera);
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y));
      min.min(v);
      max.max(v);
    }
  });
  return { min, max, width: (max.x - min.x) / 2, height: (max.y - min.y) / 2 };
}

for (const aspect of [0.8, 1, 1.6]) {
  engine.camera.aspect = aspect;
  engine.camera.updateProjectionMatrix();
  for (let frame = 0; frame < 3400; frame++) {
    elapsed += 16;
    engine.update(16, 50, false, drag);
    const visible = groups.filter((g) => g.visible);
    assert.equal(visible.length, 1, 'No overlapping models during fades');
    const g = visible[0],
      index = groups.indexOf(g);
    assert.ok(
      Math.abs(g.scale.x - g.scale.y) < 1e-10 && Math.abs(g.scale.y - g.scale.z) < 1e-10,
      'Never squash a model sideways',
    );
    if (previous?.index === index) {
      maxFrameAngle = Math.max(maxFrameAngle, g.quaternion.angleTo(previous.quaternion));
    }
    previous = { index, quaternion: g.quaternion.clone() };
    if (elapsed % 10000 > 800 && elapsed % 10000 < 820) {
      const b = bounds(g);
      seen.add(index);
      assert.ok(Math.max(b.width, b.height) > 0.43, `${names[index]} is too small`);
      assert.ok(
        b.min.x > -0.98 && b.max.x < 0.98 && b.min.y > -0.98 && b.max.y < 0.98,
        `${names[index]} clips at aspect ${aspect}`,
      );
      sizes.push({
        model: names[index],
        aspect,
        width: Math.round(b.width * 100),
        height: Math.round(b.height * 100),
      });
    }
  }
}
assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
assert.ok(maxFrameAngle < 0.02, `Abrupt orientation change ${maxFrameAngle}`);

// Drag resets at a switch, then every model starts from its chosen resting angle.
drag.x = 1;
drag.y = 0.3;
for (let i = 0; i < 650; i++) engine.update(16, 75, true, drag);
assert.equal(drag.x, 0);
assert.equal(drag.y, 0);
const g = groups.find((g) => g.visible),
  q = g.quaternion.clone(),
  scale = g.scale.clone();
engine.update(16, 75, true, drag);
assert.ok(g.quaternion.angleTo(q) < 1e-6);
assert.deepEqual(g.scale, scale);
for (const progress of [0, 25, 100, NaN]) engine.update(16, progress, true, drag);
assert.equal(errors.length, 0);
engine.dispose();

// ============================================================================
// STAGE 2 VERIFICATION — Locked Bottle & Stopwatch Modes, 0/25/43/75/100% Fill,
// Single-GLView & Honest Shader Diagnostics
// ============================================================================
const bottleEngine = createNativeScene(null, (e) => errors.push(e), null, { mode: 'bottle' });
assert.equal(bottleEngine.getModel(), 'bottle');
bottleEngine.update(16, 43, false, { x: 0, y: 0 });
assert.ok(
  Math.abs(bottleEngine.scene.children[1].position.y) < 0.03,
  'The bottle begins in place without a drop',
);
const initialBottleOpacity = bottleEngine.bottle.shell.material.opacity;
for (let frame = 0; frame < 40; frame++) bottleEngine.update(16, 43, false, { x: 0, y: 0 });
assert.ok(bottleEngine.bottle.shell.material.opacity > initialBottleOpacity, 'The bottle reveals in place');
for (let f = 0; f < 1000; f++) {
  bottleEngine.update(16, 43, false, { x: 0, y: 0 });
  const vis = bottleEngine.scene.children.filter((c) => c.visible);
  assert.equal(vis.length, 1);
  assert.equal(
    bottleEngine.scene.children.indexOf(vis[0]),
    1,
    'Bottle mode must stay locked to bottleGroup and never auto-cycle',
  );
}

// Keep the animated shell inside the camera on both narrow and wide hero areas.
for (const aspect of [0.85, 1.6, 2.1]) {
  bottleEngine.camera.aspect = aspect;
  bottleEngine.camera.updateProjectionMatrix();
  const projected = new THREE.Vector3();
  for (let frame = 0; frame < 80; frame++) {
    bottleEngine.update(32, 43, false, { x: 0, y: 0 });
    bottleEngine.scene.updateMatrixWorld(true);
    bottleEngine.camera.updateMatrixWorld(true);
    const shell = bottleEngine.bottle.shell;
    const points = shell.geometry.attributes.position;
    for (let point = 0; point < points.count; point += 10) {
      projected.fromBufferAttribute(points, point).applyMatrix4(shell.matrixWorld).project(bottleEngine.camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `Bottle clipped at aspect ${aspect}`);
    }
  }
}

// Check 0%, 25%, 43%, 75%, 100% fill states on BottleRenderer
for (const pct of [0, 25, 43, 75, 100]) {
  bottleEngine.update(16, pct, true, { x: 0, y: 0 });
  const b = bottleEngine.bottle;
  if (pct === 0) {
    assert.equal(b.water.visible, false, 'At 0%, bottle water point cloud must be hidden');
    assert.equal(b.waterBody.visible, false, 'At 0%, bottle waterBody must be hidden');
    assert.equal(b.waterline.visible, false, 'At 0%, bottle meniscus ring must be hidden');
    assert.equal(b.water.geometry.drawRange.count, 0);
  } else if (pct === 100) {
    assert.equal(b.water.visible, true, 'At 100%, bottle water must be visible');
    assert.equal(b.water.geometry.drawRange.count, b.waterPoints, 'At 100%, all water points draw');
    assert.equal(b.waterline.visible, false, 'At 100%, mid-bottle meniscus ring is hidden');
  } else {
    assert.equal(b.water.visible, true);
    assert.equal(b.waterline.visible, true);
    assert.equal(b.water.geometry.drawRange.count, Math.floor((b.waterPoints * pct) / 100));
  }
}

// Switch to Stopwatch mode and check 0%, 25%, 43%, 75%, 100% dial states
bottleEngine.setModel('stopwatch');
assert.equal(bottleEngine.getModel(), 'stopwatch');
for (let f = 0; f < 60; f++) {
  bottleEngine.update(16, 43, true, { x: 0, y: 0 });
}
for (let f = 0; f < 600; f++) {
  bottleEngine.update(16, 43, false, { x: 0, y: 0 });
  const vis = bottleEngine.scene.children.filter((c) => c.visible);
  assert.equal(
    bottleEngine.scene.children.indexOf(vis[0]),
    2,
    'Stopwatch mode must stay locked to stopwatchGroup and never auto-cycle',
  );
}
for (const pct of [0, 25, 43, 75, 100]) {
  bottleEngine.update(16, pct, true, { x: 0, y: 0 });
  const w = bottleEngine.watch;
  const expectedSectorVerts = Math.round((pct / 100) * 240) * 3;
  assert.equal(w.completionSector.geometry.drawRange.count, expectedSectorVerts);
  assert.equal(w.progressDots.geometry.drawRange.count, Math.round((w.trackCount * pct) / 100));
}
assert.ok(getBottleMeniscusNormalizedY(0) > getBottleMeniscusNormalizedY(43));
assert.ok(getBottleMeniscusNormalizedY(43) > getBottleMeniscusNormalizedY(100));
bottleEngine.dispose();

// Check NativeProgressVisual.jsx for single GLView, honest checkShaderErrors=true, and StaticChalkVisualFallback
const npvSource = await readFile(
  new URL('../src/features/today/NativeProgressVisual.jsx', import.meta.url),
  'utf8',
);
assert.equal(
  (npvSource.match(/<GLView\b/g) || []).length,
  1,
  'Exactly one GLView instance is permitted in NativeProgressVisual.jsx',
);
assert.equal(
  npvSource.includes('checkShaderErrors = false'),
  false,
  'Must not hide shader errors with checkShaderErrors = false',
);
assert.ok(
  npvSource.includes('renderer.debug.checkShaderErrors = true') &&
    npvSource.includes('renderer.debug.onShaderError'),
  'Must keep shader error checking enabled with onShaderError diagnostics',
);
assert.ok(
  npvSource.includes('StaticChalkVisualFallback'),
  'Must provide StaticChalkVisualFallback when WebGL is initializing or unavailable',
);
assert.match(npvSource, /!ready\s*\?\s*<StaticChalkVisualFallback/, 'Show the bundled fallback until the graphics context draws');
assert.ok(!npvSource.includes('Starting 3D…'), 'Do not replace the hero with a repeated loading message');
assert.match(npvSource, /fallbackWrap:\s*\{[^}]*backgroundColor:\s*'transparent'/s, 'Fallback must not paint an opaque layer over the GL surface');
assert.match(npvSource, /glView:\s*\{[^}]*\.\.\.StyleSheet\.absoluteFillObject/s, 'The GL view must fill the measured stage');
assert.match(npvSource, /style=\{\[styles\.glView,\s*\{\s*height:\s*viewportHeight\s*\}\]\}/, 'Pass a non-zero viewport height directly to the native GL wrapper');
const todaySource = await readFile(new URL('../app/(app)/(main)/today/index.tsx', import.meta.url), 'utf8');
assert.match(todaySource, /<ProgressVisual[^>]*viewportHeight=\{heroStageHeight\}/, 'Today must pass its calculated hero height to the GL view');

console.log(
  JSON.stringify(
    {
      passed: true,
      models: seen.size,
      brainIdentityVerified: {
        brainSha256,
        legoSha256,
        corticalMeshesCount: corticalMeshes.length,
        wrongModelRejected: wrongModelErrors.length > 0,
      },
      bottleAndStopwatchModesVerified: true,
      shaderDiagnosticsVerified: true,
      staticFallbackVerified: true,
      maxFrameAngle,
      sizes,
    },
    null,
    2,
  ),
);
