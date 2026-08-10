import assert from 'node:assert/strict';
import test from 'node:test';
import * as schemaNavigation from '../dist/schema-navigation.js';

const {
  isSchemaNavigationLayoutSuppressed,
  navigateToSchemaTable,
  runWithSchemaNavigationSuppression,
} = schemaNavigation;

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

test('keeps ErdCanvas layout changes suppressed through React Flow deferred move end', async () => {
  const activity = { current: 0 };
  let layoutChanges = 0;
  const onLayoutChange = () => {
    layoutChanges += 1;
  };
  const handleMoveEnd = () => {
    if (isSchemaNavigationLayoutSuppressed(activity)) return;
    onLayoutChange();
  };
  const api = {
    fitView: async () => true,
    getViewport: () => ({ x: 40, y: 20, zoom: 1.1 }),
    setViewport: async () => {
      setTimeout(handleMoveEnd, 0);
      return true;
    },
  };

  await runWithSchemaNavigationSuppression(
    activity,
    () => navigateToSchemaTable('public.accounts', 320, api),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(layoutChanges, 0);
  assert.equal(activity.current, 0);
});
