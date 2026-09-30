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
assert.ok(!prompt.includes('looking back'), 'update view is not framed as a look back');
const past = core.buildPrompt([{ version: '2.1.280', date: '2026-09-22', notes: '- Old thing' }], '2.1.284', { lookback: true });
assert.ok(past.includes('looking back'), 'past-release summaries are framed as a look back');
const many = Array.from({ length: 30 }, (_, i) => ({ version: `2.1.${300 - i}`, date: '', notes: '' }));
assert.strictEqual((core.buildPrompt(many, null).match(/^## v/gm) || []).length, core.MAX_SUMMARY_RELEASES);
console.log('core tests passed');
