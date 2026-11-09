import assert from 'node:assert/strict';
import { paperSurfaces } from '../src/theme/paperSurfaces';

function luminance(hex: string) {
  const components = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * components[0] + 0.7152 * components[1] + 0.0722 * components[2];
}
const contrast = (luminance(paperSurfaces.onAccent) + 0.05) / (luminance(paperSurfaces.accent) + 0.05);
assert.ok(contrast >= 4.5, `Primary action contrast ${contrast.toFixed(2)} is below 4.5:1`);
assert.ok((luminance(paperSurfaces.card) + 0.05) / (luminance('#161917') + 0.05) >= 4.5);
console.log(`Paper action contrast: ${contrast.toFixed(2)}:1`);
