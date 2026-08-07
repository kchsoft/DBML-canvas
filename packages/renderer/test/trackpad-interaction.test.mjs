import assert from 'node:assert/strict';
import test from 'node:test';
import * as renderer from '../dist/ErdCanvas.js';

test('uses trackpad scrolling for panning and Control-scroll for zooming', () => {
  assert.deepEqual(renderer.TRACKPAD_VIEWPORT_OPTIONS, {
    panOnScroll: true,
    zoomOnScroll: false,
    zoomActivationKeyCode: null,
    zoomOnPinch: false,
  });
});

test('reduces pointer-centered Control-wheel zoom sensitivity to 70 percent', () => {
  assert.equal(renderer.CONTROL_WHEEL_ZOOM_SENSITIVITY, 0.7);

  const next = renderer.calculateWheelZoomViewport({
    viewport: { x: 0, y: 0, zoom: 1 },
    pointer: { x: 100, y: 80 },
    deltaY: -10,
    deltaMode: 0,
    macLike: true,
    minZoom: 0.1,
    maxZoom: 2.5,
  });

  assert.ok(next.zoom > 1 && next.zoom < 1.2);
  assert.ok(Math.abs((100 - next.x) / next.zoom - 100) < 0.000001);
  assert.ok(Math.abs((80 - next.y) / next.zoom - 80) < 0.000001);

  const clamped = renderer.calculateWheelZoomViewport({
    viewport: { x: 0, y: 0, zoom: 2.4 },
    pointer: { x: 0, y: 0 },
    deltaY: -10000,
    deltaMode: 0,
    macLike: true,
    minZoom: 0.1,
    maxZoom: 2.5,
  });
  assert.equal(clamped.zoom, 2.5);
});
