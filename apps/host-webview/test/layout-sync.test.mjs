import assert from 'node:assert/strict';
import test from 'node:test';
import { updateNodeAnnotation, updateNodeLayout, updateViewport } from '@dbml-canvas/core';
import { reconcileLayoutState } from '../src/layout-sync.ts';

const baseLayout = () => ({
  version: 1,
  nodes: { 'public.member': { x: 10, y: 20 } },
  viewport: { x: 0, y: 0, zoom: 1 },
});

test('keeps the current layout when only the viewport moved', () => {
  const current = baseLayout();
  const panned = updateViewport(current, { x: -120, y: -80, zoom: 1.2 });

  assert.equal(reconcileLayoutState(current, panned), current);
});

test('adopts the next layout when a node moves or is annotated', () => {
  const current = baseLayout();

  const moved = updateNodeLayout(current, 'public.member', { x: 90, y: 140 });
  assert.equal(reconcileLayoutState(current, moved), moved);

  const annotated = updateNodeAnnotation(
    current,
    'public.member',
    { x: 10, y: 20 },
    { color: 'blue' },
  );
  assert.equal(reconcileLayoutState(current, annotated), annotated);
});

test('still adopts a node change that arrives together with a viewport change', () => {
  const current = baseLayout();
  const moved = updateViewport(
    updateNodeLayout(current, 'public.member', { x: 90, y: 140 }),
    { x: -40, y: -20, zoom: 0.8 },
  );

  assert.equal(reconcileLayoutState(current, moved), moved);
});
