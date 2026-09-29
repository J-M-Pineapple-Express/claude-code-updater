'use strict';
const assert = require('assert');
const core = require('../core');

assert.strictEqual(core.parseVersion('2.1.284 (Claude Code)'), '2.1.284');
assert.strictEqual(core.parseVersion('garbage'), null);
assert.ok(core.cmpVersion('2.1.284', '2.1.283') > 0);
assert.ok(core.cmpVersion('2.1.10', '2.1.9') > 0);
assert.strictEqual(core.cmpVersion('2.1.9', '2.1.9'), 0);

const prompt = core.buildPrompt([{ version: '2.1.284', date: '2026-09-28', notes: '- Fixed a thing' }], '2.1.282');
assert.ok(prompt.includes('# Review Changelog'), 'bundled skill is included');
assert.ok(prompt.includes('Installed version: v2.1.282'));
assert.ok(prompt.includes('## v2.1.284 (2026-09-28)'));
console.log('core tests passed');
