import assert from 'node:assert/strict';
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

// React Flow already memoizes every MiniMap node against viewport changes: MiniMapNodes
// subscribes to the node id list with `shallow`, and each node wrapper subscribes only to its
// own position. Panning re-renders nothing but the mask rect, so freezing the MiniMap for a
// pan buys nothing and costs a full unmount/remount of it on every wheel gesture.
test('exposes no viewport freeze helper, so panning keeps the live MiniMap', () => {
  assert.equal(miniMapModule.updateViewportMiniMapSnapshot, undefined);
  assert.equal(typeof miniMapModule.captureMiniMapSnapshot, 'function');
});
