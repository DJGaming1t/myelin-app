import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/features/today/DayMapPath.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('require','module','exports',code)((id) => {
  if (id === 'react-native') return { View:'View', Text:'Text', Pressable:'Pressable', ScrollView:'ScrollView', StyleSheet:{create:s=>s} };
  if (id.endsWith('/MapBrick')) return { MapBrick:'MapBrick' };
  if (id.endsWith('/tokens')) return { chalkTheme:{} };
  return require(id);
}, module, module.exports);
const { DayMapPath, dayMapPathPoint } = module.exports;
function flatten(n) { if (Array.isArray(n)) return n.flatMap(flatten); if (!n || typeof n !== 'object') return []; return [n,...flatten(n.props?.children)]; }
for (const count of [0,1,12]) {
  const steps=Array.from({length:count},(_,i)=>({id:String(i),title:`Task ${i}`,minutes:35,completed:i===1,current:i===0,overdue:i===2}));
  const selected=[]; const nodes=flatten(DayMapPath({steps,selectedId:'0',onSelect:s=>selected.push(s.id)}));
  const buttons=nodes.filter(n=>n.type==='Pressable'); assert.equal(buttons.length,count);
  buttons.forEach(n=>n.props.onPress()); assert.deepEqual(selected,steps.map(s=>s.id));
  if(count>1) assert(dayMapPathPoint(1).x>dayMapPathPoint(0).x);
  if(count>2) assert(buttons[2].props.accessibilityLabel.includes('overdue'));
}
console.log('✓ path handles empty, single and busy days; every brick selects its own task and exposes its state');
