import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Position } from '@xyflow/react';
import { getFkEdgeVisualProps, resolveFkRoute } from '../dist/FkEdge.js';

const params = {
  sourceX: 100,
  sourceY: 100,
  sourcePosition: Position.Right,
  targetX: 400,
  targetY: 100,
  targetPosition: Position.Left,
};

const node = (id, x, y, width, height) => ({
  id,
  type: 'table',
  position: { x, y },
  measured: { width, height },
  data: {},
});

const nodes = [
  node('source', 0, 60, 100, 100),
  node('obstacle', 180, 40, 100, 140),
  node('target', 400, 60, 100, 100),
];

test('uses an adaptive path without invoking smart routing during a drag', () => {
  const adaptive = resolveFkRoute(params, nodes, 'adaptive', () => {
    throw new Error('smart routing must not run while dragging');
  });

  assert.equal(adaptive.kind, 'adaptive');
  assert.match(adaptive.path, /^M/);
  assert.equal(Number.isFinite(adaptive.labelX), true);
  assert.equal(Number.isFinite(adaptive.labelY), true);
});

test('uses a successful settled smart route and its label coordinates', () => {
  const smart = resolveFkRoute(params, nodes, 'settled', () => ({
    svgPathString: 'M 0,0 L 10,0',
    edgeCenterX: 5,
    edgeCenterY: 0,
    points: [[0, 0], [10, 0]],
  }));

  assert.deepEqual(smart, {
    kind: 'smart',
    path: 'M 0,0 L 10,0',
    labelX: 5,
    labelY: 0,
    points: [[0, 0], [10, 0]],
  });
});

test('falls back locally for returned and thrown smart routing errors', () => {
  const returnedError = resolveFkRoute(
    params,
    nodes,
    'settled',
    () => new Error('No path found'),
  );
  const thrownError = resolveFkRoute(params, nodes, 'settled', () => {
    throw new Error('Unexpected integration error');
  });

  assert.equal(returnedError.kind, 'adaptive');
  assert.match(returnedError.path, /^M/);
  assert.equal(thrownError.kind, 'adaptive');
  assert.match(thrownError.path, /^M/);
});

test('falls back when smart routing returns an unusable success value', () => {
  const invalidResults = [
    {
      svgPathString: '',
      edgeCenterX: 5,
      edgeCenterY: 0,
      points: [[0, 0], [10, 0]],
    },
    {
      svgPathString: 'M 0,0 L 10,0',
      edgeCenterX: Number.NaN,
      edgeCenterY: 0,
      points: [[0, 0], [10, 0]],
    },
    {
      svgPathString: 'M 0,0 L 10,0',
      edgeCenterX: 5,
      edgeCenterY: 0,
      points: [[0, 0], ['bad', 0]],
    },
  ];

  for (const invalid of invalidResults) {
    const route = resolveFkRoute(params, nodes, 'settled', () => invalid);
    assert.equal(route.kind, 'adaptive');
    assert.match(route.path, /^M/);
  }
});

test('routes settled paths orthogonally around a table with 16px clearance', () => {
  const route = resolveFkRoute(params, nodes, 'settled');

  assert.equal(route.kind, 'smart');
  assert.ok(route.points.length > 0);

  const routePoints = [
    [params.sourceX, params.sourceY],
    ...route.points,
    [params.targetX, params.targetY],
  ];
  const obstacle = { left: 164, right: 296, top: 24, bottom: 196 };

  for (let index = 1; index < routePoints.length; index += 1) {
    const [startX, startY] = routePoints[index - 1];
    const [endX, endY] = routePoints[index];
    const horizontal = startY === endY;
    const vertical = startX === endX;

    assert.equal(horizontal || vertical, true, 'every routed segment must be orthogonal');

    const crossesHorizontal = horizontal
      && startY > obstacle.top
      && startY < obstacle.bottom
      && Math.max(Math.min(startX, endX), obstacle.left)
        < Math.min(Math.max(startX, endX), obstacle.right);
    const crossesVertical = vertical
      && startX > obstacle.left
      && startX < obstacle.right
      && Math.max(Math.min(startY, endY), obstacle.top)
        < Math.min(Math.max(startY, endY), obstacle.bottom);

    assert.equal(crossesHorizontal || crossesVertical, false);
  }
});

test('keeps a self-reference visible when both endpoints share a table', () => {
  const selfNode = node('employee', 0, 60, 100, 100);
  const route = resolveFkRoute({
    sourceX: 100,
    sourceY: 100,
    sourcePosition: Position.Right,
    targetX: 0,
    targetY: 120,
    targetPosition: Position.Left,
  }, [selfNode], 'settled');

  assert.match(route.path, /^M/);
  assert.equal(Number.isFinite(route.labelX), true);
  assert.equal(Number.isFinite(route.labelY), true);
});

test('derives balanced focused, dimmed, and idle FK edge visuals', async () => {
  const focused = getFkEdgeVisualProps('focused', { strokeWidth: 1.5 });
  assert.deepEqual(focused.primaryStyle, {
    strokeWidth: 3,
    stroke: 'var(--dbml-accent)',
    opacity: 1,
  });
  assert.deepEqual(focused.haloStyle, {
    strokeWidth: 9,
    stroke: 'var(--dbml-accent)',
    opacity: 0.14,
  });
  assert.equal(focused.labelStyle.fill, 'var(--dbml-accent)');

  const dimmed = getFkEdgeVisualProps('dimmed', { strokeWidth: 1.5 });
  assert.equal(dimmed.primaryStyle.opacity, 0.16);
  assert.equal(dimmed.haloStyle, undefined);

  const idle = getFkEdgeVisualProps('idle', { strokeWidth: 1.5 });
  assert.deepEqual(idle.primaryStyle, { strokeWidth: 1.5 });

  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.dbml-fk-edge,\s*\.dbml-fk-edge-halo\s*\{[^}]*transition:[^}]*140ms/s,
  );
  assert.match(css, /\.react-flow__edge-text\s*\{[^}]*transition:[^}]*140ms/s);
});
