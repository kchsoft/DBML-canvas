import assert from 'node:assert/strict';
import test from 'node:test';
import * as graph from '../dist/graph.js';
import {
  chooseFkHandleSides,
  makeFkHandleId,
  transitionFkRoutingMode,
} from '../dist/fk-routing.js';
import {
  applyFkFocusPresentationToNodes,
  createFlowEdges,
  createFlowNodes,
} from '../dist/graph.js';

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
  assert.equal(transitionFkRoutingMode('adaptive', 'drag-start'), 'adaptive');
  assert.equal(transitionFkRoutingMode('settled', 'drag-stop'), 'settled');
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
  assert.deepEqual(edge.data, {
    routingMode: 'settled',
    routingNodes: [node('public.orders', 500), node('public.users', 0)],
    selfReference: false,
    focusState: 'idle',
  });
  assert.equal(edge.label, '* : 1');
});

test('carries one focus presentation into table nodes and FK edges', () => {
  const graphSchema = {
    version: 1,
    tables: [
      {
        id: 'public.orders',
        name: 'orders',
        displayName: 'orders',
        schemaName: 'public',
        columns: [
          { id: 'public.orders.user_id', name: 'user_id', type: 'int' },
          { id: 'public.orders.team_id', name: 'team_id', type: 'int' },
        ],
        indexes: [],
      },
      {
        id: 'public.users',
        name: 'users',
        displayName: 'users',
        schemaName: 'public',
        columns: [{ id: 'public.users.id', name: 'id', type: 'int' }],
        indexes: [],
      },
      {
        id: 'public.teams',
        name: 'teams',
        displayName: 'teams',
        schemaName: 'public',
        columns: [{ id: 'public.teams.id', name: 'id', type: 'int' }],
        indexes: [],
      },
    ],
    relationships: [
      schema.relationships[0],
      {
        id: 'orders-team',
        source: {
          tableId: 'public.orders',
          columnIds: ['public.orders.team_id'],
          cardinality: '*',
        },
        target: {
          tableId: 'public.teams',
          columnIds: ['public.teams.id'],
          cardinality: '1',
        },
      },
    ],
    warnings: [],
  };
  const presentation = {
    relationshipIds: new Set(['orders-user']),
    endpointColumnIds: new Set(['public.orders.user_id', 'public.users.id']),
    activeColumnId: 'public.orders.user_id',
  };
  const onFkColumnFocus = () => {};
  const nodes = createFlowNodes(
    graphSchema,
    { version: 1, nodes: {} },
    undefined,
    undefined,
    presentation,
    onFkColumnFocus,
  );
  const orders = nodes.find(({ id }) => id === 'public.orders');

  assert.equal(orders.data.activeFkColumnId, 'public.orders.user_id');
  assert.deepEqual(orders.data.relatedFkColumnIds, ['public.orders.user_id']);
  assert.equal(orders.data.onFkColumnFocus, onFkColumnFocus);

  const edges = createFlowEdges(graphSchema, nodes, 'settled', presentation);
  assert.equal(edges.find(({ id }) => id === 'orders-user').data.focusState, 'focused');
  assert.equal(edges.find(({ id }) => id === 'orders-team').data.focusState, 'dimmed');

  const measuredNodes = nodes.map((flowNode) => ({
    ...flowNode,
    measured: { width: 340, height: 120 },
  }));
  const updatedNodes = applyFkFocusPresentationToNodes(
    measuredNodes,
    presentation,
    onFkColumnFocus,
  );
  const updatedOrders = updatedNodes.find(({ id }) => id === 'public.orders');
  assert.deepEqual(updatedOrders.measured, { width: 340, height: 120 });
  assert.equal(updatedOrders.position, measuredNodes[0].position);
  assert.equal(updatedOrders.data.activeFkColumnId, 'public.orders.user_id');
});

test('shares one routing snapshot and selectively replaces connected edges during a drag', () => {
  assert.equal(typeof graph.updateFlowEdgesDuringDrag, 'function');

  const dragSchema = {
    version: 1,
    tables: [],
    relationships: [
      schema.relationships[0],
      {
        id: 'audit-team',
        source: {
          tableId: 'public.audit',
          columnIds: ['public.audit.team_id'],
          cardinality: '*',
        },
        target: {
          tableId: 'public.teams',
          columnIds: ['public.teams.id'],
          cardinality: '1',
        },
      },
    ],
    warnings: [],
  };
  const initialNodes = [
    node('public.orders', 0),
    node('public.users', 500),
    node('public.audit', 0),
    node('public.teams', 500),
  ];
  const movedNodes = initialNodes.map((flowNode) => (
    flowNode.id === 'public.orders'
      ? { ...flowNode, position: { x: 200, y: 40 } }
      : flowNode
  ));
  const initial = createFlowEdges(dragSchema, initialNodes, 'settled');
  const current = [{ ...initial[0], selected: true }, initial[1]];

  assert.equal(initial[0].data.routingNodes, initialNodes);
  assert.equal(initial[1].data.routingNodes, initialNodes);

  const dragged = graph.updateFlowEdgesDuringDrag(
    dragSchema,
    movedNodes,
    current,
    new Set(['public.orders']),
  );

  const connected = dragged.find(({ id }) => id === 'orders-user');
  const unrelated = dragged.find(({ id }) => id === 'audit-team');
  assert.notEqual(connected, current[0]);
  assert.equal(connected.selected, true);
  assert.equal(connected.data.routingMode, 'adaptive');
  assert.equal(connected.data.routingNodes, movedNodes);
  assert.equal(unrelated, current[1]);

  const focused = graph.updateFlowEdgesDuringDrag(
    dragSchema,
    movedNodes,
    dragged,
    new Set(['public.orders']),
    {
      relationshipIds: new Set(['orders-user']),
      endpointColumnIds: new Set(),
    },
  );
  assert.equal(focused.find(({ id }) => id === 'orders-user').data.focusState, 'focused');
  assert.notEqual(focused.find(({ id }) => id === 'audit-team'), unrelated);
  assert.equal(focused.find(({ id }) => id === 'audit-team').data.focusState, 'dimmed');
  assert.equal(focused.find(({ id }) => id === 'audit-team').data.routingNodes, initialNodes);

  const finalNodes = initialNodes.map((flowNode) => (
    flowNode.id === 'public.orders'
      ? { ...flowNode, position: { x: 900, y: 40 } }
      : flowNode
  ));
  const settledConnected = createFlowEdges(dragSchema, finalNodes, 'settled')
    .find(({ id }) => id === 'orders-user');
  assert.equal(settledConnected.sourceHandle, 'source:left:public.orders.user_id');
  assert.equal(settledConnected.targetHandle, 'target:right:public.users.id');
  assert.equal(settledConnected.data.routingMode, 'settled');
});
