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

test('freezes the MiniMap once for a wheel pan and releases it at pan end', () => {
  assert.equal(typeof miniMapModule.updateViewportMiniMapSnapshot, 'function');

  const captured = '<svg class="react-flow__minimap"><rect x="80"/></svg>';

  const started = miniMapModule.updateViewportMiniMapSnapshot(
    undefined,
    'wheel',
    'start',
    captured,
  );
  const repeated = miniMapModule.updateViewportMiniMapSnapshot(
    started,
    'wheel',
    'start',
    '<svg class="react-flow__minimap"><rect x="160"/></svg>',
  );
  const endedWithoutEvent = miniMapModule.updateViewportMiniMapSnapshot(
    repeated,
    undefined,
    'end',
    undefined,
  );

  assert.equal(started, captured);
  assert.equal(repeated, started);
  assert.equal(endedWithoutEvent, undefined);
});
