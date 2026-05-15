"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { generateMap } = require('../scripts/generate-map');

const REPO_ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'paths-manifest.json'), 'utf8'));

test('generateMap returns a string with the expected header', () => {
  const out = generateMap(manifest);
  assert.match(out, /# Repository map/);
  assert.match(out, /## Domains/);
});

test('generateMap covers every top-level domain dir from the manifest', () => {
  const out = generateMap(manifest);
  // Sample of the top-level dirs that should appear as ## headings
  const dirs = ['foundations', 'content', 'components', 'accessibility', 'tokens'];
  for (const d of dirs) {
    assert.ok(out.includes('`' + d + '/`'), `missing dir heading for ${d}`);
  }
});

test('generateMap embeds the manifest version', () => {
  const out = generateMap(manifest);
  assert.ok(out.includes(manifest.knowledge_version), 'should reference knowledge_version');
});

test('generateMap links to coverage.md', () => {
  const out = generateMap(manifest);
  assert.ok(out.includes('components/dist/guidelines/coverage.md'), 'should link to coverage matrix');
});

test('generateMap declares it is auto-generated', () => {
  const out = generateMap(manifest);
  const lc = out.toLowerCase();
  assert.ok(lc.includes('auto-generated'), 'should declare auto-generated');
  assert.ok(lc.includes('do not edit'), 'should warn against hand-editing');
});

test('generateMap is deterministic for the same manifest', () => {
  const a = generateMap(manifest);
  const b = generateMap(manifest);
  assert.equal(a, b);
});
