'use strict';
const assert = require('assert');
global.window = {};
require('../public/md.js');
const r = window.renderMarkdown;

assert.ok(!r('<script>alert(1)</script>').includes('<script>'), 'HTML is escaped');
assert.ok(r('[x](javascript:alert(1))').indexOf('data-href') === -1, 'non-https links are not linked');
assert.ok(r('[docs](https://code.claude.com)').includes('data-href="https://code.claude.com"'));
assert.ok(r('### Title').includes('<h4>Title</h4>'));
const nested = r('- a\n  - b\n- c');
assert.strictEqual((nested.match(/<ul>/g) || []).length, 2);
assert.strictEqual((nested.match(/<\/ul>/g) || []).length, 2);
assert.ok(r('**bold** and `code`').includes('<strong>bold</strong> and <code>code</code>'));
console.log('md tests passed');
