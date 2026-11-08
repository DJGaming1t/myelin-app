import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadThemeTokens() {
  try {
    return await import('../src/theme/tokens.ts');
  } catch {
    const tsSource = fs.readFileSync(path.join(__dirname, '../src/theme/tokens.ts'), 'utf8');
    const cjsCode = tsSource
      .replace(/export\s+type\s+[A-Za-z0-9_]+\s*=\s*(?:\{[\s\S]*?\}|[^;]+);/g, '')
      .replace(/new\s+Set<[\s\S]*?>\(\)/g, 'new Set()')
      .replace(/export\s+const\s+([a-zA-Z0-9_]+)(?:\s*:\s*[^=]+)?\s*=/g, 'const $1 = exports.$1 =')
      .replace(/let\s+([a-zA-Z0-9_]+)(?:\s*:\s*[^=]+)?\s*=/g, 'let $1 =')
      .replace(/const\s+([a-zA-Z0-9_]+)(?:\s*:\s*[^=]+)?\s*=/g, 'const $1 =')
      .replace(/export\s+function\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*:\s*[^{]+\{/g, (_, name, rawArgs) => {
        if (name === 'subscribeThemePalette') return 'exports.subscribeThemePalette = function subscribeThemePalette(listener) {';
        const cleanArgs = rawArgs
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => a.replace(/^([a-zA-Z0-9_]+)\s*:\s*[^=]+(\s*=\s*[\s\S]+)?$/, (__, id, def) => id + (def || '')))
          .join(', ');
        return `const ${name} = exports.${name} = function ${name}(${cleanArgs}) {`;
      })
      .replace(/\s+as\s+const/g, '');
    const mod = { exports: {} };
    const fn = new vm.Script(`(function(exports, module) {\n${cjsCode}\n})`, { filename: 'tokens.ts' });
    fn.runInThisContext()(mod.exports, mod);
    return mod.exports;
  }
}

const {
  applyThemePalette,
  chalkTheme,
  colors,
  getActiveThemePalette,
  getChalkThemeTokens,
  getThemeColors,
  themePalettes,
} = await loadThemeTokens();

function luminance(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const surfaces = ['bg', 'panel', 'panelRaised', 'panelWarm', 'accentSoft'];
let lowest = Infinity;

// 1. Verify all 37 text/surface pairs across editorial, grey, and white palettes
for (const paletteName of ['editorial', 'grey', 'white']) {
  const pal = themePalettes[paletteName];
  for (const surface of surfaces) {
    for (const text of ['text', 'textDim', 'muted', 'subtle', 'accent', 'success', 'danger']) {
      const ratio = contrast(pal[text], pal[surface]);
      if (paletteName === 'editorial') lowest = Math.min(lowest, ratio);
      assert.ok(
        ratio >= 4.5,
        `[${paletteName}] ${text} on ${surface}: ${ratio.toFixed(2)}:1`,
      );
    }
  }
  assert.ok(contrast(pal.onAccent, pal.accentFill) >= 4.5);
  assert.ok(contrast(pal.onStage, pal.stage) >= 4.5);
}

// 2. Verify chalkTheme semantic tokens and WCAG contrast ratios
assert.equal(chalkTheme.hero, '#151514');
assert.equal(chalkTheme.paper, '#F2E7D0');
assert.equal(chalkTheme.paperRaised, '#DFD4C0');
assert.equal(chalkTheme.graphite, '#2C2B28');
assert.equal(chalkTheme.inkSoft, '#66635C');
assert.equal(chalkTheme.mutedCream, '#C6BEAD');
assert.equal(chalkTheme.progressBlue, '#7E98A4');
assert.equal(chalkTheme.dock, '#252522');

assert.ok(
  contrast(chalkTheme.onStage, chalkTheme.hero) >= 4.5,
  'chalkTheme onStage on hero must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.mutedCream, chalkTheme.hero) >= 4.5,
  'chalkTheme mutedCream on hero must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.graphite, chalkTheme.paper) >= 4.5,
  'chalkTheme graphite on paper must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.graphite, chalkTheme.paperRaised) >= 4.5,
  'chalkTheme graphite on paperRaised must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.inkSoft, chalkTheme.paper) >= 4.5,
  'chalkTheme inkSoft on paper must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.dockInactiveText, chalkTheme.dock) >= 4.5,
  'chalkTheme dockInactiveText on dock must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.dock, chalkTheme.dockActivePill) >= 4.5,
  'chalkTheme dock on dockActivePill must meet WCAG AA',
);
assert.ok(
  contrast(chalkTheme.onStage, chalkTheme.nextUpBadge) >= 4.5,
  'chalkTheme onStage on nextUpBadge must meet WCAG AA',
);

// 3. Verify existing theme customization & custom overrides are preserved
const customGrey = applyThemePalette('grey', { accent: '#7A2E1D', accentFill: '#FF8566' });
assert.equal(getActiveThemePalette(), 'grey');
assert.equal(customGrey.bg, '#EAECEF');
assert.equal(customGrey.accent, '#7A2E1D');
assert.equal(customGrey.accentFill, '#FF8566');

const chalkDefault = getChalkThemeTokens({ accent: '#7A2E1D', accentFill: '#FF8566' });
assert.equal(chalkDefault.progressBlue, '#7E98A4', 'chalkTheme default progressBlue remains #7E98A4');
assert.equal(chalkDefault.customAccentFill, '#FF8566', 'custom accent fill is preserved');

const chalkWithCustomProgress = getChalkThemeTokens(
  { accentFill: '#5B88A6' },
  { applyCustomAccentToProgress: true },
);
assert.equal(chalkWithCustomProgress.progressBlue, '#5B88A6');

// Restore default editorial palette
applyThemePalette('editorial', {});
assert.equal(colors.bg, chalkTheme.paper);

console.log(`Passed 37 text/surface pairs across all palettes + chalkTheme pairs; lowest body-text contrast ${lowest.toFixed(2)}:1`);