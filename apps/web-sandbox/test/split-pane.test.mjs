import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampSourceWidth,
  defaultSourceWidth,
  resolveSourceWidth,
} from '../src/split-pane.ts';

test('defaults to 34 percent of the workspace', () => {
  assert.equal(defaultSourceWidth(1000), 340);
});

test('clamps source width between 260px and 70 percent', () => {
  assert.equal(clampSourceWidth(100, 1000), 260);
  assert.equal(clampSourceWidth(900, 1000), 700);
  assert.equal(clampSourceWidth(480, 1000), 480);
});

test('uses the default for malformed storage and clamps valid storage', () => {
  assert.equal(resolveSourceWidth(null, 1000), 340);
  assert.equal(resolveSourceWidth('not-a-number', 1000), 340);
  assert.equal(resolveSourceWidth('-20', 1000), 340);
  assert.equal(resolveSourceWidth('900', 1000), 700);
});
