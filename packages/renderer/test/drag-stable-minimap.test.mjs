import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const miniMapModule = await import('../dist/DragStableMiniMapNode.js').catch(() => ({}));

const liveProps = {
  id: 'public.orders',
  x: 420,
  y: 90,
  width: 340,
  height: 160,
  borderRadius: 5,
  className: '',
  color: '#dde3ea',
  shapeRendering: 'crispEdges',
  selected: false,
};

const frozenNodes = [{
  id: 'public.orders',
  type: 'table',
  position: { x: 80, y: 90 },
  measured: { width: 340, height: 160 },
  data: {},
}];

test('MiniMap drag snapshot resolves frozen and live node rectangles', () => {
  assert.equal(typeof miniMapModule.createMiniMapNodeSnapshot, 'function');
  assert.equal(typeof miniMapModule.getMiniMapNodeRect, 'function');

  const snapshot = miniMapModule.createMiniMapNodeSnapshot(frozenNodes);
  assert.deepEqual(miniMapModule.getMiniMapNodeRect(liveProps, undefined), {
    x: 420,
    y: 90,
    width: 340,
    height: 160,
  });
  assert.deepEqual(miniMapModule.getMiniMapNodeRect(liveProps, snapshot), {
    x: 80,
    y: 90,
    width: 340,
    height: 160,
  });
  assert.equal(
    miniMapModule.getMiniMapNodeRect({ ...liveProps, x: 500 }, snapshot),
    miniMapModule.getMiniMapNodeRect(liveProps, snapshot),
  );
});

test('MiniMap drag snapshot keeps the SVG node visible and releases final geometry', () => {
  assert.equal(typeof miniMapModule.MiniMapDragSnapshotProvider, 'function');
  assert.equal(typeof miniMapModule.DragStableMiniMapNode, 'object');

  const frozenMarkup = renderToStaticMarkup(createElement(
    miniMapModule.MiniMapDragSnapshotProvider,
    { nodes: frozenNodes },
    createElement(miniMapModule.DragStableMiniMapNode, liveProps),
  ));
  const liveMarkup = renderToStaticMarkup(createElement(
    miniMapModule.MiniMapDragSnapshotProvider,
    {},
    createElement(miniMapModule.DragStableMiniMapNode, liveProps),
  ));

  assert.match(frozenMarkup, /class="react-flow__minimap-node"/);
  assert.match(frozenMarkup, /x="80"/);
  assert.match(frozenMarkup, /y="90"/);
  assert.match(liveMarkup, /x="420"/);
});

test('ErdCanvas keeps the existing MiniMap mounted with the drag-stable node renderer', async () => {
  const source = await readFile(new URL('../src/ErdCanvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /<MiniMapDragSnapshotProvider nodes=\{fkDragSession\?\.frozenNodes\}>/);
  assert.match(source, /nodeComponent=\{DragStableMiniMapNode\}/);
  assert.match(source, /<MiniMap\s/);
  assert.doesNotMatch(source, /fkDragSession \? null : <MiniMap/);
});
