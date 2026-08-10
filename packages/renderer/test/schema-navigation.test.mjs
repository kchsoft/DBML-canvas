import assert from 'node:assert/strict';
import test from 'node:test';
import * as schemaNavigation from '../dist/schema-navigation.js';

const {
  isSchemaNavigationLayoutSuppressed,
  navigateToSchemaTable,
  runWithSchemaNavigationSuppression,
} = schemaNavigation;

test('computes one non-animated drawer-aware viewport from the live measured table', async () => {
  const calls = [];
  const canvas = {
    width: 1_000,
    height: 600,
    fitView: async () => assert.fail('navigation must not call fitView'),
  };
  const api = {
    getInternalNode: (id) => id === 'public.accounts' ? {
      id,
      measured: { width: 200, height: 100 },
      internals: { positionAbsolute: { x: 100, y: 200 } },
    } : undefined,
    setViewport: async (viewport, options) => {
      calls.push([viewport, options]);
      return true;
    },
  };

  const target = await navigateToSchemaTable('public.accounts', 320, canvas, api);

  assert.ok(Math.abs(target.x - 110) < Number.EPSILON * 256);
  assert.equal(target.y, 12.5);
  assert.equal(target.zoom, 1.15);
  assert.deepEqual(calls, [[target, { duration: 0 }]]);
});

test('skips missing and unmeasured live table nodes', async () => {
  const candidates = [
    undefined,
    {
      measured: { width: undefined, height: 100 },
      internals: { positionAbsolute: { x: 100, y: 200 } },
    },
    {
      measured: { width: 200, height: 0 },
      internals: { positionAbsolute: { x: 100, y: 200 } },
    },
  ];

  for (const candidate of candidates) {
    let setViewportCalls = 0;
    let result;
    await assert.doesNotReject(async () => {
      result = await navigateToSchemaTable(
        'public.accounts',
        320,
        { width: 1_000, height: 600 },
        {
          getInternalNode: () => candidate,
          setViewport: async () => {
            setViewportCalls += 1;
            return true;
          },
        },
      );
    });

    assert.equal(result, undefined);
    assert.equal(setViewportCalls, 0);
  }
});

test('does not arm a move-end lifecycle when the viewport API declines the update', async () => {
  const result = await navigateToSchemaTable(
    'public.accounts',
    320,
    { width: 1_000, height: 600 },
    {
      getInternalNode: () => ({
        measured: { width: 200, height: 100 },
        internals: { positionAbsolute: { x: 100, y: 200 } },
      }),
      setViewport: async () => false,
    },
  );

  assert.equal(result, undefined);
});

test('suppresses the real 150ms programmatic move end and persists a later manual move', async () => {
  const activity = { current: 0 };
  let layoutChanges = 0;
  const target = { x: -120, y: 20, zoom: 1.1 };
  const handleMoveEnd = (event, viewport) => {
    if (isSchemaNavigationLayoutSuppressed(activity, event, viewport)) return;
    layoutChanges += 1;
  };
  // @xyflow/system defers onMoveEnd by 150ms whenever panOnScroll is enabled.
  const deferredProgrammaticMoveEnd = new Promise((resolve) => {
    setTimeout(() => {
      handleMoveEnd(undefined, target);
      resolve();
    }, 150);
  });

  await runWithSchemaNavigationSuppression(activity, async () => target);
  await deferredProgrammaticMoveEnd;

  assert.equal(layoutChanges, 0);
  handleMoveEnd({ type: 'wheel' }, { x: -126, y: 14, zoom: 1.1 });
  assert.equal(layoutChanges, 1);
});

test('keeps only the latest overlapping result navigation eligible for suppression', async () => {
  const activity = { current: 0 };
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const firstTarget = { x: 10, y: 20, zoom: 1 };
  const secondTarget = { x: -40, y: 30, zoom: 1.15 };

  const firstNavigation = runWithSchemaNavigationSuppression(activity, () => first.promise);
  const secondNavigation = runWithSchemaNavigationSuppression(activity, () => second.promise);

  first.resolve(firstTarget);
  await firstNavigation;
  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, undefined, firstTarget),
    false,
  );

  second.resolve(secondTarget);
  await secondNavigation;
  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, undefined, secondTarget),
    true,
  );
});

test('retains the pending move end when a newer result cannot navigate', async () => {
  for (const outcome of ['missing node', 'rejected update']) {
    const activity = { current: 0 };
    const priorTarget = { x: 10, y: 20, zoom: 1 };
    await runWithSchemaNavigationSuppression(activity, async () => priorTarget);

    await runWithSchemaNavigationSuppression(activity, async () => {
      if (outcome === 'rejected update') throw new Error(outcome);
      return undefined;
    });

    assert.equal(
      isSchemaNavigationLayoutSuppressed(activity, undefined, priorTarget),
      true,
      outcome,
    );
    assert.equal(
      isSchemaNavigationLayoutSuppressed(
        activity,
        { type: 'wheel' },
        { x: 12, y: 18, zoom: 1 },
      ),
      false,
      outcome,
    );
  }
});

test('arms a newer successful target after a wheel-interrupted navigation', async () => {
  const activity = { current: 0 };
  const firstTarget = { x: 10, y: 20, zoom: 1 };
  const wheelViewport = { x: 4, y: 12, zoom: 1 };
  const secondTarget = { x: -40, y: 30, zoom: 1.15 };
  const markMoveStart = schemaNavigation.markSchemaNavigationMoveStart;

  await runWithSchemaNavigationSuppression(activity, async () => firstTarget);
  markMoveStart(activity, { type: 'wheel' }, wheelViewport);

  await runWithSchemaNavigationSuppression(activity, async () => {
    // A duration-zero XYFlow setViewport emits this synchronously before its promise resolves.
    markMoveStart(activity, undefined, wheelViewport);
    return secondTarget;
  });

  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, undefined, secondTarget),
    true,
  );
  assert.equal(
    isSchemaNavigationLayoutSuppressed(
      activity,
      { type: 'wheel' },
      { x: -44, y: 26, zoom: 1.15 },
    ),
    false,
  );
});

test('contains a rejected viewport update and leaves later manual persistence enabled', async () => {
  const activity = { current: 0 };
  let result;

  await assert.doesNotReject(async () => {
    result = await runWithSchemaNavigationSuppression(
      activity,
      async () => { throw new Error('viewport unavailable'); },
    );
  });

  assert.equal(result, false);
  assert.equal(
    isSchemaNavigationLayoutSuppressed(
      activity,
      { type: 'wheel' },
      { x: 5, y: 6, zoom: 0.9 },
    ),
    false,
  );
});

test('ends the active lifecycle on user interruption without swallowing manual move ends', async () => {
  const activity = { current: 0 };
  const target = { x: -120, y: 20, zoom: 1.1 };
  const manualViewport = { x: -132, y: 14, zoom: 1.1 };
  const markMoveStart = schemaNavigation.markSchemaNavigationMoveStart;
  const isActive = schemaNavigation.isSchemaNavigationActive;
  assert.equal(typeof markMoveStart, 'function');
  assert.equal(typeof isActive, 'function');

  await runWithSchemaNavigationSuppression(activity, async () => target);
  markMoveStart(activity, { type: 'mousedown' }, target);

  assert.equal(isActive(activity), false);
  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, { type: 'mouseup' }, manualViewport),
    false,
  );
  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, undefined, target),
    false,
  );

  const wheelActivity = { current: 0 };
  await runWithSchemaNavigationSuppression(wheelActivity, async () => target);
  markMoveStart(wheelActivity, { type: 'wheel' }, manualViewport);
  assert.equal(isActive(wheelActivity), false);
  assert.equal(
    isSchemaNavigationLayoutSuppressed(
      wheelActivity,
      { type: 'wheel' },
      manualViewport,
    ),
    false,
  );
  assert.equal(
    isSchemaNavigationLayoutSuppressed(wheelActivity, undefined, target),
    true,
  );
});

test('cancels an in-flight lifecycle on schema removal while consuming its eventual move end', async () => {
  const activity = { current: 0 };
  const navigation = Promise.withResolvers();
  const target = { x: 16, y: -28, zoom: 1.15 };
  const cancel = schemaNavigation.cancelSchemaNavigation;
  const isActive = schemaNavigation.isSchemaNavigationActive;
  assert.equal(typeof cancel, 'function');
  assert.equal(typeof isActive, 'function');

  const pending = runWithSchemaNavigationSuppression(activity, () => navigation.promise);
  cancel(activity);
  navigation.resolve(target);
  await pending;

  assert.equal(isActive(activity), false);
  assert.equal(
    isSchemaNavigationLayoutSuppressed(
      activity,
      { type: 'wheel' },
      { x: 12, y: -24, zoom: 1.15 },
    ),
    false,
  );
  assert.equal(
    isSchemaNavigationLayoutSuppressed(activity, undefined, target),
    true,
  );
  assert.equal(
    isSchemaNavigationLayoutSuppressed(
      activity,
      { type: 'wheel' },
      { x: 8, y: -20, zoom: 1.15 },
    ),
    false,
  );
});
