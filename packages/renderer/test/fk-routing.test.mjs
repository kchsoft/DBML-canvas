import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseFkHandleSides,
  makeFkHandleId,
  transitionFkRoutingMode,
} from '../dist/fk-routing.js';
import { createFlowEdges } from '../dist/graph.js';

const node = (id, x, width = 340) => ({
  id,
  type: 'table',
  position: { x, y: 0 },
  measured: { width, height: 160 },
  data: {},
});

const schema = {
  version: 1,
  tables: [],
  relationships: [{
    id: 'orders-user',
    source: {
      tableId: 'public.orders',
      columnIds: ['public.orders.user_id'],
      cardinality: '*',
    },
    target: {
      tableId: 'public.users',
      columnIds: ['public.users.id'],
      cardinality: '1',
    },
  }],
  warnings: [],
};

test('builds role-aware handle ids for both column sides', () => {
  assert.equal(
    makeFkHandleId('source', 'left', 'public.orders.user_id'),
    'source:left:public.orders.user_id',
  );
  assert.equal(
    makeFkHandleId('target', 'right', 'public.users.id'),
    'target:right:public.users.id',
  );
});

test('chooses facing sides from measured table centers', () => {
  assert.deepEqual(
    chooseFkHandleSides(node('orders', 500), node('users', 0)),
    { source: 'left', target: 'right' },
  );
  assert.deepEqual(
    chooseFkHandleSides(node('orders', 0), node('users', 500)),
    { source: 'right', target: 'left' },
  );
});

test('uses deterministic opposite sides for self references and vertical ties', () => {
  const same = node('employees', 100);
  assert.deepEqual(chooseFkHandleSides(same, same), {
    source: 'right',
    target: 'left',
  });
  assert.deepEqual(
    chooseFkHandleSides(node('a', 100), node('b', 100)),
    { source: 'right', target: 'left' },
  );
});

test('transitions between settled and adaptive routing around a drag', () => {
  assert.equal(transitionFkRoutingMode('settled', 'drag-start'), 'adaptive');
  assert.equal(transitionFkRoutingMode('adaptive', 'drag-stop'), 'settled');
});

test('creates an FK edge with geometry-selected handles and preserved semantics', () => {
  const [edge] = createFlowEdges(
    schema,
    [node('public.orders', 500), node('public.users', 0)],
    'settled',
  );

  assert.equal(edge.type, 'fk');
  assert.equal(edge.source, 'public.orders');
  assert.equal(edge.target, 'public.users');
  assert.equal(edge.sourceHandle, 'source:left:public.orders.user_id');
  assert.equal(edge.targetHandle, 'target:right:public.users.id');
  assert.deepEqual(edge.data, { routingMode: 'settled', selfReference: false });
  assert.equal(edge.label, '* : 1');
});
