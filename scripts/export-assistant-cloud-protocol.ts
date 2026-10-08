/// <reference types="node" />
import fs from 'node:fs';
import { myelinMiniDecisionJsonSchema, myelinMiniSystemPrompt } from '../src/features/assistant/myelin-mini';

const path = 'functions/protocol-v1.json';
const output = JSON.stringify({ version: 1, system: myelinMiniSystemPrompt(), schema: myelinMiniDecisionJsonSchema() }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path, 'utf8') !== output) throw new Error('Cloud protocol differs from the app; regenerate it.');
  console.log('PASS: server-owned cloud protocol matches the app.');
} else fs.writeFileSync(path, output);
