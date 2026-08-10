import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialFlowState, ErdCanvas } from '../dist/ErdCanvas.js';

const schema = {
  version: 1,
  tables: [],
  relationships: [],
  warnings: [],
};

const layout = { version: 1, nodes: {} };

test('forwards dark color mode to React Flow', () => {
  const markup = renderToStaticMarkup(createElement(ErdCanvas, {
    schema,
    layout,
    colorMode: 'dark',
    showMiniMap: false,
  }));

  assert.match(markup, /class="react-flow dark"/);
});

test('creates the initial FK graph in settled routing mode', () => {
  const graphSchema = {
    version: 1,
    tables: [
      {
        id: 'public.orders',
        name: 'orders',
        schema: 'public',
        columns: [{ id: 'public.orders.user_id', name: 'user_id', type: 'int' }],
        indexes: [],
      },
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [{ id: 'public.users.id', name: 'id', type: 'int' }],
        indexes: [],
      },
    ],
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
  const state = createInitialFlowState(graphSchema, {
    version: 1,
    nodes: {
      'public.orders': { x: 500, y: 0 },
      'public.users': { x: 0, y: 0 },
    },
  });

  assert.equal(state.nodes.length, 2);
  assert.equal(state.edges.length, 1);
  assert.equal(state.edges[0].type, 'fk');
  assert.deepEqual(state.edges[0].data, {
    routingMode: 'settled',
    selfReference: false,
    focusState: 'idle',
  });
});
