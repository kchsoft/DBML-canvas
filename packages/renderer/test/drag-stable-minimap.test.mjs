import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const miniMapModule = await import('../dist/DragStableMiniMap.js').catch(() => ({}));

test('captures the complete live MiniMap SVG before a drag starts', () => {
  assert.equal(typeof miniMapModule.captureMiniMapSnapshot, 'function');

  const markup = '<svg class="react-flow__minimap" viewBox="0 0 900 500"><rect x="80"/></svg>';
  const root = {
    querySelector(selector) {
      assert.equal(selector, '.react-flow__minimap');
      return { outerHTML: markup };
    },
  };

  assert.equal(miniMapModule.captureMiniMapSnapshot(root), markup);
  assert.equal(miniMapModule.captureMiniMapSnapshot(null), undefined);
  assert.equal(
    miniMapModule.captureMiniMapSnapshot({ querySelector: () => null }),
    undefined,
  );
});

test('renders one inert MiniMap snapshot with its frozen viewBox and coordinates', () => {
  assert.equal(typeof miniMapModule.DragStableMiniMap, 'function');

  const markup = '<svg class="react-flow__minimap" viewBox="0 0 900 500"><rect x="80"/></svg>';
  const rendered = renderToStaticMarkup(createElement(
    miniMapModule.DragStableMiniMap,
    { markup },
  ));

  assert.match(rendered, /class="dbml-minimap-drag-snapshot"/);
  assert.match(rendered, /viewBox="0 0 900 500"/);
  assert.match(rendered, /x="80"/);
  assert.match(rendered, /aria-hidden="true"/);
});

test('ErdCanvas swaps the live MiniMap for the complete snapshot only during a drag', async () => {
  const source = await readFile(new URL('../src/ErdCanvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /captureMiniMapSnapshot\(canvasRef\.current\)/);
  assert.match(source, /const \[miniMapSnapshot, setMiniMapSnapshot\]/);
  assert.match(source, /fkDragSession && miniMapSnapshot/);
  assert.match(source, /<DragStableMiniMap markup=\{miniMapSnapshot\}/);
  assert.match(source, /<MiniMap pannable zoomable nodeStrokeWidth=\{3\} \/>/);
  assert.doesNotMatch(source, /nodeComponent=/);
  assert.doesNotMatch(source, /MiniMapDragSnapshotProvider/);
});
