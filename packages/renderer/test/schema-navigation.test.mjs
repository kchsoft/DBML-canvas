import assert from 'node:assert/strict';
import test from 'node:test';
import { navigateToSchemaTable } from '../dist/schema-navigation.js';

test('fits one table then shifts it left by half the visible drawer width', async () => {
  const calls = [];
  const api = {
    fitView: async (options) => { calls.push(['fitView', options]); return true; },
    getViewport: () => ({ x: 40, y: 20, zoom: 1.1 }),
    setViewport: async (viewport, options) => {
      calls.push(['setViewport', viewport, options]);
      return true;
    },
  };
  await navigateToSchemaTable('public.accounts', 320, api);
  assert.deepEqual(calls[0][1].nodes, [{ id: 'public.accounts' }]);
  assert.deepEqual(calls[1][1], { x: -120, y: 20, zoom: 1.1 });
});

test('does not shift the viewport when fitting the table fails', async () => {
  let setViewportCalled = false;
  const api = {
    fitView: async () => false,
    getViewport: () => ({ x: 40, y: 20, zoom: 1.1 }),
    setViewport: async () => {
      setViewportCalled = true;
      return true;
    },
  };

  await navigateToSchemaTable('public.accounts', 320, api);

  assert.equal(setViewportCalled, false);
});
