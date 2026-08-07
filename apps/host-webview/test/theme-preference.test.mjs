import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readThemePreference,
  resolveCanvasTheme,
  toggleCanvasTheme,
  writeThemePreference,
} from '../src/theme-preference.ts';

test('uses the host theme until a manual preference is selected', () => {
  assert.equal(resolveCanvasTheme('dark', null), 'dark');
  assert.equal(resolveCanvasTheme('dark', 'light'), 'light');
  assert.equal(toggleCanvasTheme('dark'), 'light');
  assert.equal(toggleCanvasTheme('light'), 'dark');
});

test('reads and writes theme preference without trusting storage values', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };

  assert.equal(readThemePreference(storage), null);
  writeThemePreference(storage, 'dark');
  assert.equal(readThemePreference(storage), 'dark');
  values.set('dbml-canvas/theme-preference', 'system');
  assert.equal(readThemePreference(storage), null);
});
