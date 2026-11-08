import assert from 'node:assert/strict';
import { startupRecoveryAction } from '../src/features/today/visualStartupRecovery.mjs';

assert.equal(startupRecoveryAction({ active: true, focused: true, paused: false, attempts: 0 }), 'retry');
assert.equal(startupRecoveryAction({ active: true, focused: true, paused: false, attempts: 1 }), 'error');
assert.equal(startupRecoveryAction({ active: false, focused: true, paused: false, attempts: 0 }), 'wait');
assert.equal(startupRecoveryAction({ active: true, focused: false, paused: false, attempts: 0 }), 'wait');
assert.equal(startupRecoveryAction({ active: true, focused: true, paused: true, attempts: 0 }), 'wait');
console.log('Visual startup recovery checks passed');
