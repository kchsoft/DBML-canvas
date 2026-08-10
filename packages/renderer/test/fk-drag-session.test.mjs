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

test('FK routing snapshot changes only at drag boundaries', () => {
  assert.equal(typeof dragModule.updateFkRoutingSnapshot, 'function');

  const initialNodes = [node('public.orders'), node('public.users', 500)];
  const settled = dragModule.updateFkRoutingSnapshot(
    undefined,
    initialNodes,
    undefined,
  );
  const session = dragModule.startFkDragSession(
    initialNodes,
    initialNodes[0],
    [initialNodes[0]],
  );
  const started = dragModule.updateFkRoutingSnapshot(settled, initialNodes, session);
  const movedNodes = [
    { ...initialNodes[0], position: { x: 240, y: 40 } },
    initialNodes[1],
  ];
  const pointerFrame = dragModule.updateFkRoutingSnapshot(started, movedNodes, session);
  const stopped = dragModule.updateFkRoutingSnapshot(pointerFrame, movedNodes, undefined);

  assert.notEqual(started, settled);
  assert.equal(started.nodes, initialNodes);
  assert.equal(pointerFrame, started);
  assert.notEqual(stopped, pointerFrame);
  assert.equal(stopped.nodes, movedNodes);
  assert.equal(stopped.dragSession, undefined);

  const presentationOnlyNodes = initialNodes.map((flowNode) => ({
    ...flowNode,
    selected: !flowNode.selected,
  }));
  assert.equal(
    dragModule.updateFkRoutingSnapshot(settled, presentationOnlyNodes, undefined),
    settled,
  );

  const measuredNodes = initialNodes.map((flowNode) => ({
    ...flowNode,
    measured: { width: 340, height: 160 },
  }));
  const measured = dragModule.updateFkRoutingSnapshot(settled, measuredNodes, undefined);
  assert.notEqual(measured, settled);
  assert.equal(measured.nodes, measuredNodes);
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

test('FK drag stop persists every dragged node in one layout update', () => {
  assert.equal(typeof dragModule.updateDraggedNodesLayout, 'function');

  const layout = {
    version: 1,
    nodes: {
      'public.orders': { x: 0, y: 0, color: 'blue' },
      'public.users': { x: 500, y: 0 },
    },
  };
  const draggedNodes = [
    { ...node('public.orders'), position: { x: 120, y: 80 } },
    { ...node('public.users'), position: { x: 640, y: 120 } },
  ];
  const updated = dragModule.updateDraggedNodesLayout(layout, draggedNodes);

  assert.deepEqual(updated.nodes['public.orders'], { x: 120, y: 80, color: 'blue' });
  assert.deepEqual(updated.nodes['public.users'], { x: 640, y: 120 });
  assert.equal(layout.nodes['public.orders'].x, 0);
});

test('layout feedback preserves measurements only for unchanged schema tables', () => {
  assert.equal(typeof dragModule.preserveFlowNodeMeasurements, 'function');

  const table = { id: 'public.orders' };
  const current = [{
    ...node('public.orders'),
    measured: { width: 340, height: 160 },
    width: 340,
    height: 160,
    data: { table },
  }];
  const sameSchema = [{
    ...node('public.orders', 240),
    data: { table },
  }];
  const replacedSchema = [{
    ...node('public.orders', 240),
    data: { table: { id: 'public.orders' } },
  }];

  const preserved = dragModule.preserveFlowNodeMeasurements(current, sameSchema);
  assert.deepEqual(preserved[0].measured, { width: 340, height: 160 });
  assert.equal(preserved[0].width, 340);
  assert.deepEqual(preserved[0].position, { x: 240, y: 0 });

  const reset = dragModule.preserveFlowNodeMeasurements(current, replacedSchema);
  assert.equal(reset[0].measured, undefined);
  assert.equal(reset[0].width, undefined);
});

test('ErdCanvas selectively updates edges only while an FK drag session is active', async () => {
  const source = await readFile(new URL('../src/ErdCanvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[fkDragSession, setFkDragSession\]/);
  assert.match(source, /startFkDragSession\(nodes, node, draggedNodes\)/);
  assert.match(source, /updateDraggedNodesLayout\(/);
  assert.match(source, /preserveFlowNodeMeasurements\(current, nextNodes\)/);
  assert.match(source, /updateFlowEdgesDuringDrag\(/);
  assert.match(source, /fkDragSession\.movedNodeIds/);
  assert.match(source, /onNodeDragStart=\{handleNodeDragStart\}/);
  assert.match(source, /onNodeDragStop=\{handleNodeDragStop\}/);
  assert.doesNotMatch(source, /const \[routingMode, setRoutingMode\]/);
  assert.doesNotMatch(source, /transitionFkRoutingMode/);
});
