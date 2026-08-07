import assert from 'node:assert/strict';
import test from 'node:test';
import { createFlowNodes } from '../dist/graph.js';

const schema = {
  version: 1,
  tables: [{
    id: 'public.member',
    schema: 'public',
    name: 'member',
    displayName: 'member',
    columns: [],
  }],
  relationships: [],
  warnings: [],
};

test('passes portable annotations and updates through table node data', () => {
  let update;
  const nodes = createFlowNodes(
    schema,
    {
      version: 1,
      nodes: {
        'public.member': { x: 10, y: 20, color: 'green' },
      },
    },
    (tableId, position, patch) => {
      update = { tableId, position, patch };
    },
  );

  assert.deepEqual(nodes[0].data.layout, {
    x: 10,
    y: 20,
    color: 'green',
  });

  nodes[0].data.onAnnotationChange({ color: 'red' });
  assert.deepEqual(update, {
    tableId: 'public.member',
    position: { x: 10, y: 20 },
    patch: { color: 'red' },
  });
});
