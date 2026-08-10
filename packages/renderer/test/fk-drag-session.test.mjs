import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dragModule = await import('../dist/fk-drag-session.js').catch(() => ({}));

const node = (id, x = 0) => ({
  id,
  type: 'table',
  position: { x, y: 0 },
  data: {},
});

test('FK drag session captures moved node ids and the frozen node snapshot', () => {
  assert.equal(typeof dragModule.startFkDragSession, 'function');

  const allNodes = [node('public.orders'), node('public.users', 500)];
  const activeNode = allNodes[0];
  const session = dragModule.startFkDragSession(allNodes, activeNode, [activeNode]);

  assert.deepEqual([...session.movedNodeIds], ['public.orders']);
  assert.equal(session.frozenNodes, allNodes);
  assert.deepEqual(allNodes.map(({ id }) => id), ['public.orders', 'public.users']);

  const multi = dragModule.startFkDragSession(allNodes, activeNode, allNodes);
  assert.deepEqual([...multi.movedNodeIds], ['public.orders', 'public.users']);

  const fallback = dragModule.startFkDragSession(allNodes, activeNode, []);
  assert.deepEqual([...fallback.movedNodeIds], ['public.orders']);
});

test('FK drag session is cancelled when a moved table disappears', () => {
  assert.equal(typeof dragModule.reconcileFkDragSession, 'function');

  const allNodes = [node('public.orders'), node('public.users', 500)];
  const session = dragModule.startFkDragSession(allNodes, allNodes[0], [allNodes[0]]);
  const completeSchema = {
    version: 1,
    tables: [{ id: 'public.orders' }, { id: 'public.users' }],
    relationships: [],
    warnings: [],
  };
  const schemaWithoutOrders = {
    ...completeSchema,
    tables: [{ id: 'public.users' }],
  };

  assert.equal(dragModule.reconcileFkDragSession(session, completeSchema), session);
  assert.equal(dragModule.reconcileFkDragSession(session, schemaWithoutOrders), undefined);
  assert.equal(dragModule.reconcileFkDragSession(undefined, completeSchema), undefined);
});

test('ErdCanvas selectively updates edges only while an FK drag session is active', async () => {
  const source = await readFile(new URL('../src/ErdCanvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[fkDragSession, setFkDragSession\]/);
  assert.match(source, /startFkDragSession\(nodes, node, draggedNodes\)/);
  assert.match(source, /updateFlowEdgesDuringDrag\(/);
  assert.match(source, /fkDragSession\.movedNodeIds/);
  assert.match(source, /onNodeDragStart=\{handleNodeDragStart\}/);
  assert.match(source, /onNodeDragStop=\{handleNodeDragStop\}/);
  assert.doesNotMatch(source, /const \[routingMode, setRoutingMode\]/);
  assert.doesNotMatch(source, /transitionFkRoutingMode/);
});
