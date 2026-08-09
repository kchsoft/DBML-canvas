# Adaptive FK Edge Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render column-accurate FK lines that avoid unrelated tables after a drag, use lightweight adaptive routes while dragging, and fall back per edge when A* routing fails in Web, VS Code, and IntelliJ.

**Architecture:** Keep schema and layout contracts unchanged and implement the feature entirely in `@dbml-canvas/renderer`. Four role-aware handles per column allow left/right endpoint selection, a focused `FkEdge` component calls React Flow Smart Edge's low-level orthogonal A* API, and `ErdCanvas` switches all relationships between adaptive and settled routing modes around node drags.

**Tech Stack:** TypeScript 5.8, React 19, `@xyflow/react` 12.11.2, `@tisoap/react-flow-smart-edge` 4.13.1, Node test runner, npm workspaces, IntelliJ Gradle/JCEF host

## Global Constraints

- Keep DBML as the only schema-editing source of truth.
- Keep layout sidecar version 1 limited to table positions, table colors, and viewport state; never persist computed edge paths or React Flow internals.
- Implement routing once in `@dbml-canvas/renderer`; Web, VS Code, and IntelliJ must consume the same renderer/webview bundle.
- Preserve relationship IDs, DBML source/target semantics, column-row endpoints, labels, cardinality text, stroke styling, and selection state.
- Use left/right column handles only; do not add top/bottom handles that lose the column-row attachment.
- Use a 16px obstacle margin, orthogonal A* routing, and rounded 5px corners for settled paths.
- Use adaptive React Flow `smoothstep` paths during a drag and settled smart paths after release.
- Fall back only the affected relationship when smart routing returns `Error`; do not fail the canvas or other relationships.
- Keep self-references deterministic with source-right and target-left endpoints.
- Do not add automatic table layout, route persistence, manual bend points, edge-hop rendering, edge-to-edge crossing minimization, or Web Worker routing.
- Pin `@tisoap/react-flow-smart-edge` to `4.13.1`; its peer ranges are `@xyflow/react >=12`, `react >=18`, and `react-dom >=18`.

---

## File Structure

- Create `packages/renderer/src/fk-routing.ts`: shared routing types, handle ID construction, deterministic endpoint-side selection, and drag-mode transition helper.
- Create `packages/renderer/src/FkEdge.tsx`: adaptive path construction, guarded Smart Edge route resolution, and `BaseEdge` rendering.
- Create `packages/renderer/test/fk-routing.test.mjs`: handle IDs, side selection, graph edge metadata, self-reference, and routing-mode transition tests.
- Create `packages/renderer/test/fk-edge.test.mjs`: adaptive/smart/fallback route resolution and real obstacle-avoidance tests.
- Modify `packages/renderer/src/TableNode.tsx`: render source and target handles on both sides of every column.
- Modify `packages/renderer/src/graph.ts`: create typed FK edges from current node geometry and routing mode.
- Modify `packages/renderer/src/ErdCanvas.tsx`: register `FkEdge`, track drag routing mode, and refresh endpoint handles from current node geometry without losing edge selection.
- Modify `packages/renderer/src/index.ts`: export focused FK routing APIs needed by tests and consumers.
- Modify `packages/renderer/src/styles.css`: position coincident role-aware handles without changing their appearance.
- Modify `packages/renderer/package.json` and `package-lock.json`: add Smart Edge 4.13.1.
- Modify `test/legal-notices.test.mjs` and regenerate `THIRD_PARTY_NOTICES.txt`: verify and record the MIT runtime dependency.

---

### Task 1: Smart Edge Dependency and Legal Notice

**Files:**
- Modify: `packages/renderer/package.json`
- Modify: `package-lock.json`
- Modify: `test/legal-notices.test.mjs`
- Regenerate: `THIRD_PARTY_NOTICES.txt`

**Interfaces:**
- Consumes: repository npm workspaces and `scripts/generate-third-party-notices.mjs`.
- Produces: exact runtime dependency `@tisoap/react-flow-smart-edge@4.13.1` available to renderer TypeScript and an automated MIT-license notice assertion.

- [ ] **Step 1: Add the failing legal-notice assertion**

Add this assertion after the existing `@xyflow/react` assertion in `test/legal-notices.test.mjs`:

```js
assert.match(notices, /@tisoap\/react-flow-smart-edge 4\.13\.1/);
assert.match(notices, /Custom React Flow Edge that never intersects with other nodes|MIT License/i);
```

- [ ] **Step 2: Run the legal test and verify the new assertion fails**

Run:

```bash
rtk npm run test:legal
```

Expected: FAIL because generated notices do not yet contain `@tisoap/react-flow-smart-edge 4.13.1`.

- [ ] **Step 3: Install the exact renderer dependency**

Run:

```bash
rtk npm install @tisoap/react-flow-smart-edge@4.13.1 -w @dbml-canvas/renderer
```

Confirm `packages/renderer/package.json` contains:

```json
"@tisoap/react-flow-smart-edge": "4.13.1"
```

Confirm npm does not report an incompatible peer dependency against `@xyflow/react` 12.11.2 or React 19.2.8.

- [ ] **Step 4: Regenerate third-party notices**

Run:

```bash
rtk npm run legal:notices
```

Expected: `THIRD_PARTY_NOTICES.txt` gains the Smart Edge 4.13.1 MIT section and retains all previous notices.

- [ ] **Step 5: Run dependency and legal verification**

Run:

```bash
rtk npm run test:legal
rtk npm run typecheck -w @dbml-canvas/renderer
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the dependency boundary**

```bash
rtk git add packages/renderer/package.json package-lock.json test/legal-notices.test.mjs THIRD_PARTY_NOTICES.txt
rtk git commit -m "chore(renderer): add smart edge routing dependency"
```

---

### Task 2: Adaptive Column Handles and Edge Metadata

**Files:**
- Create: `packages/renderer/src/fk-routing.ts`
- Create: `packages/renderer/test/fk-routing.test.mjs`
- Modify: `packages/renderer/src/TableNode.tsx`
- Modify: `packages/renderer/src/graph.ts`
- Modify: `packages/renderer/src/styles.css`
- Modify: `packages/renderer/src/index.ts`

**Interfaces:**
- Consumes: `TableFlowNode`, `ErdSchema.relationships`, React Flow `Position`, and measured node widths when available.
- Produces: `FkRoutingMode`, `FkRoutingEvent`, `FkHandleSide`, `FkEdgeData`, `makeFkHandleId(role, side, columnId)`, `chooseFkHandleSides(sourceNode, targetNode)`, `transitionFkRoutingMode(mode, event)`, and `createFlowEdges(schema, nodes, routingMode)`.

- [ ] **Step 1: Write failing routing and graph tests**

Create `packages/renderer/test/fk-routing.test.mjs` with tests equivalent to:

```js
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
```

Add a schema with `orders.user_id -> users.id`, call
`createFlowEdges(schema, [ordersNode, usersNode], 'settled')`, and assert:

```js
assert.equal(edge.type, 'fk');
assert.equal(edge.source, 'public.orders');
assert.equal(edge.target, 'public.users');
assert.equal(edge.sourceHandle, 'source:left:public.orders.user_id');
assert.equal(edge.targetHandle, 'target:right:public.users.id');
assert.deepEqual(edge.data, { routingMode: 'settled', selfReference: false });
assert.equal(edge.label, '* : 1');
```

- [ ] **Step 2: Run the renderer test and verify missing modules/signatures fail**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `fk-routing.js` and the new `createFlowEdges` signature do not exist.

- [ ] **Step 3: Implement focused routing types and helpers**

Create `packages/renderer/src/fk-routing.ts` with these public contracts:

```ts
import { Position, type Edge, type Node } from '@xyflow/react';

export type FkRoutingMode = 'adaptive' | 'settled';
export type FkRoutingEvent = 'drag-start' | 'drag-stop';
export type FkHandleSide = 'left' | 'right';
export type FkHandleRole = 'source' | 'target';

export interface FkEdgeData extends Record<string, unknown> {
  routingMode: FkRoutingMode;
  selfReference: boolean;
}

export type FkFlowEdge = Edge<FkEdgeData, 'fk'>;
export type FkGeometryNode = Pick<Node, 'id' | 'position' | 'measured'>;

export function makeFkHandleId(
  role: FkHandleRole,
  side: FkHandleSide,
  columnId: string,
): string {
  return `${role}:${side}:${columnId}`;
}

function horizontalCenter(node: FkGeometryNode): number {
  return node.position.x + (node.measured?.width ?? 0) / 2;
}

export function chooseFkHandleSides(
  source: FkGeometryNode,
  target: FkGeometryNode,
): { source: FkHandleSide; target: FkHandleSide } {
  if (source.id === target.id || horizontalCenter(source) <= horizontalCenter(target)) {
    return { source: 'right', target: 'left' };
  }
  return { source: 'left', target: 'right' };
}

export function handlePosition(side: FkHandleSide): Position {
  return side === 'left' ? Position.Left : Position.Right;
}

export function transitionFkRoutingMode(
  mode: FkRoutingMode,
  event: FkRoutingEvent,
): FkRoutingMode {
  return event === 'drag-start' ? 'adaptive' : 'settled';
}
```

The unused `mode` parameter is intentional for an explicit reducer contract;
write it as `_mode` if TypeScript reports it.

- [ ] **Step 4: Render four role-aware handles per column**

Replace the two fixed handles in `TableNode.tsx` with a local helper that emits
both roles for each side:

```tsx
const columnHandles = (
  columnId: string,
  side: FkHandleSide,
  position: Position,
) => (['source', 'target'] as const).map((role) => (
  <Handle
    key={`${role}:${side}`}
    id={makeFkHandleId(role, side, columnId)}
    type={role}
    position={position}
    className={`dbml-column-handle is-${side} is-${role}`}
    isConnectable={false}
  />
));
```

Render `columnHandles(column.id, 'left', Position.Left)` before the row content
and `columnHandles(column.id, 'right', Position.Right)` after it. Keep both
role handles visually coincident. Add CSS selectors that ensure the paired
handles share the same side coordinate and do not change the existing 7px
appearance.

- [ ] **Step 5: Create FK edges from current geometry**

Change `createFlowEdges` in `graph.ts` to:

```ts
export function createFlowEdges(
  schema: ErdSchema,
  nodes: FkGeometryNode[],
  routingMode: FkRoutingMode,
): FkFlowEdge[]
```

Build a node lookup, choose sides per relationship, and return:

```ts
{
  id: relationship.id,
  source: relationship.source.tableId,
  target: relationship.target.tableId,
  ...(sourceColumnId ? {
    sourceHandle: makeFkHandleId('source', sides.source, sourceColumnId),
  } : {}),
  ...(targetColumnId ? {
    targetHandle: makeFkHandleId('target', sides.target, targetColumnId),
  } : {}),
  type: 'fk',
  data: {
    routingMode,
    selfReference: relationship.source.tableId === relationship.target.tableId,
  },
  label,
  labelStyle: { fontSize: 11 },
  style: { strokeWidth: 1.5 },
}
```

If node geometry is missing, use deterministic right-source/left-target sides.
If a participating column ID is absent, preserve the current conditional
omission of that handle ID rather than manufacturing an invalid column handle.

- [ ] **Step 6: Export the routing module and run focused tests**

Add to `packages/renderer/src/index.ts`:

```ts
export * from './fk-routing.js';
```

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: the new helper/edge tests PASS; existing renderer tests that call the
old `createFlowEdges(schema)` signature may fail only until their fixtures are
updated in this step to pass nodes and `'settled'`.

- [ ] **Step 7: Commit adaptive endpoint selection**

```bash
rtk git add packages/renderer/src/fk-routing.ts packages/renderer/src/TableNode.tsx packages/renderer/src/graph.ts packages/renderer/src/styles.css packages/renderer/src/index.ts packages/renderer/test/fk-routing.test.mjs
rtk git commit -m "feat(renderer): select adaptive FK endpoints"
```

---

### Task 3: Obstacle-Aware FK Edge with Local Fallback

**Files:**
- Create: `packages/renderer/src/FkEdge.tsx`
- Create: `packages/renderer/test/fk-edge.test.mjs`
- Modify: `packages/renderer/src/index.ts`

**Interfaces:**
- Consumes: `FkEdgeData`, React Flow `EdgeProps`, current `TableFlowNode[]`, `getSmartEdge`, `pathfindingAStarNoDiagonal`, and `svgDrawSmoothStepLinePath`.
- Produces: `FkRoute`, `resolveFkRoute(params, nodes, routingMode, smartResolver?)`, and `FkEdge(props)` registered in Task 4.

- [ ] **Step 1: Write failing adaptive, smart, and fallback tests**

Create `packages/renderer/test/fk-edge.test.mjs`. Define standard horizontal
edge parameters with `Position.Right` and `Position.Left`, then assert:

```js
const adaptive = resolveFkRoute(params, nodes, 'adaptive', () => {
  throw new Error('smart routing must not run while dragging');
});
assert.equal(adaptive.kind, 'adaptive');
assert.match(adaptive.path, /^M/);

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

const fallback = resolveFkRoute(
  params,
  nodes,
  'settled',
  () => new Error('No path found'),
);
assert.equal(fallback.kind, 'adaptive');
assert.match(fallback.path, /^M/);
```

Also pass a resolver that throws and assert the result is adaptive, so errors
from either the package return contract or unexpected integration code remain
local to the edge.

- [ ] **Step 2: Write the failing real obstacle test**

Use the actual Smart Edge resolver with source and target nodes on opposite
sides of a measured obstacle node. Call `resolveFkRoute` in settled mode and
assert `kind === 'smart'`. For every consecutive pair in `route.points`, assert
the segment does not enter the obstacle rectangle expanded by 16px. Use source
and target coordinates outside that rectangle and require every segment to be
horizontal or vertical.

Add a self-reference case whose source uses the right-side column coordinate
and target uses the left-side coordinate of the same measured node. Assert the
settled resolver returns a non-empty smart or adaptive SVG path and never drops
the relationship.

- [ ] **Step 3: Run the new test and verify the missing module fails**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `FkEdge.js` does not exist.

- [ ] **Step 4: Implement the guarded route resolver**

Create `packages/renderer/src/FkEdge.tsx` with stable options:

```ts
const SMART_EDGE_OPTIONS = Object.freeze({
  gridRatio: 10,
  nodePadding: 16,
  generatePath: pathfindingAStarNoDiagonal,
  drawEdge: svgDrawSmoothStepLinePath({ borderRadius: 5 }),
});
```

Define:

```ts
export interface FkRoute {
  kind: 'adaptive' | 'smart';
  path: string;
  labelX: number;
  labelY: number;
  points: number[][];
}

export type SmartRouteResolver = typeof getSmartEdge;
```

`resolveFkRoute` first obtains React Flow's adaptive tuple:

```ts
const [path, labelX, labelY] = getSmoothStepPath({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  borderRadius: 5,
  offset: 16,
});
```

Return this adaptive route immediately in adaptive mode. In settled mode call
the injected resolver, defaulting to `getSmartEdge`, with current nodes and
`SMART_EDGE_OPTIONS`. Return adaptive on an `Error` result or caught exception;
otherwise map `svgPathString`, center coordinates, and points to `FkRoute`.

- [ ] **Step 5: Render labels and styles through React Flow `BaseEdge`**

Implement `FkEdge(props: EdgeProps<FkFlowEdge>)` using
`useNodes<TableFlowNode>()`, `resolveFkRoute`, and:

```tsx
return (
  <BaseEdge
    id={props.id}
    path={route.path}
    labelX={route.labelX}
    labelY={route.labelY}
    label={props.label}
    labelStyle={props.labelStyle}
    labelShowBg={props.labelShowBg}
    labelBgStyle={props.labelBgStyle}
    labelBgPadding={props.labelBgPadding}
    labelBgBorderRadius={props.labelBgBorderRadius}
    style={props.style}
    markerStart={props.markerStart}
    markerEnd={props.markerEnd}
    interactionWidth={props.interactionWidth}
  />
);
```

Read the routing mode from `props.data?.routingMode ?? 'settled'`. Do not log
route failures because fallback is expected behavior and repeated edges would
spam IDE consoles.

- [ ] **Step 6: Export and verify the focused edge module**

Add to `packages/renderer/src/index.ts`:

```ts
export * from './FkEdge.js';
```

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
rtk npm run typecheck -w @dbml-canvas/renderer
```

Expected: all focused tests and typecheck PASS.

- [ ] **Step 7: Commit obstacle-aware routing**

```bash
rtk git add packages/renderer/src/FkEdge.tsx packages/renderer/src/index.ts packages/renderer/test/fk-edge.test.mjs
rtk git commit -m "feat(renderer): route FK edges around tables"
```

---

### Task 4: Drag Lifecycle and Shared Canvas Integration

**Files:**
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `packages/renderer/test/fk-routing.test.mjs`
- Modify: `packages/renderer/test/color-mode.test.mjs`

**Interfaces:**
- Consumes: `FkEdge`, `createFlowEdges(schema, nodes, routingMode)`, `transitionFkRoutingMode`, React Flow `OnNodeDrag`, and existing portable layout callbacks.
- Produces: one shared canvas behavior used unchanged by browser sandbox, VS Code host webview, and IntelliJ host webview.

- [ ] **Step 1: Add failing lifecycle and initial-mode assertions**

Extend `fk-routing.test.mjs` to assert both events are idempotent and explicit:

```js
assert.equal(transitionFkRoutingMode('adaptive', 'drag-start'), 'adaptive');
assert.equal(transitionFkRoutingMode('settled', 'drag-stop'), 'settled');
```

Export this exact helper from `ErdCanvas.tsx`:

```ts
export function createInitialFlowState(
  schema: ErdSchema,
  layout: ErdLayout,
  onAnnotationChange?: TableAnnotationChangeHandler,
  onEditNote?: TableNoteEditHandler,
) {
  const nodes = createFlowNodes(schema, layout, onAnnotationChange, onEditNote);
  return { nodes, edges: createFlowEdges(schema, nodes, 'settled') };
}
```

Extend `color-mode.test.mjs` with a two-table relationship schema and assert the
helper's only edge has `type === 'fk'` and
`data.routingMode === 'settled'`, while retaining the existing dark color-mode
SSR assertion.

- [ ] **Step 2: Run focused tests and verify canvas integration fails**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `ErdCanvas` still calls the old edge factory and has no
`fk` edge registration or drag mode.

- [ ] **Step 3: Register the custom edge and initialize settled edges**

In `ErdCanvas.tsx`:

```ts
const edgeTypes = { fk: FkEdge };
```

Initialize nodes and edges together so callbacks are present on initial nodes:

```ts
const initialFlow = useMemo(
  () => createInitialFlowState(
    schema,
    layout,
    handleAnnotationChange,
    onEditNote,
  ),
  [handleAnnotationChange, layout, onEditNote, schema],
);
const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>(initialFlow.nodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
```

Pass `edgeTypes={edgeTypes}` to `<ReactFlow>` and keep `useEdgesState` so React
Flow edge selection changes remain controlled.

- [ ] **Step 4: Add routing mode and drag handlers**

Add:

```ts
const [routingMode, setRoutingMode] = useState<FkRoutingMode>('settled');

const handleNodeDragStart: OnNodeDrag<TableFlowNode> = useCallback(() => {
  setRoutingMode((mode) => transitionFkRoutingMode(mode, 'drag-start'));
}, []);
```

At the start of the existing drag-stop callback, transition back to settled;
retain the existing `updateNodeLayout` call exactly:

```ts
setRoutingMode((mode) => transitionFkRoutingMode(mode, 'drag-stop'));
emitLayout(updateNodeLayout(latestLayout.current, node.id, node.position));
```

Pass `onNodeDragStart={handleNodeDragStart}` and the existing enhanced
`onNodeDragStop` to React Flow.

- [ ] **Step 5: Refresh handles and route mode from current node geometry**

Add an effect keyed by `nodes`, `routingMode`, and `schema` that rebuilds edges
while preserving current selection:

```ts
useEffect(() => {
  setEdges((current) => {
    const selected = new Set(
      current.filter((edge) => edge.selected).map((edge) => edge.id),
    );
    return createFlowEdges(schema, nodes, routingMode).map((edge) => ({
      ...edge,
      ...(selected.has(edge.id) ? { selected: true } : {}),
    }));
  });
}, [nodes, routingMode, schema, setEdges]);
```

Remove the old `setEdges(createFlowEdges(schema))` call from the schema/layout
effect so it cannot overwrite geometry-aware handles. Keep the node recreation,
table selection preservation, layout synchronization, annotation callbacks,
and note-edit callbacks unchanged.

- [ ] **Step 6: Run renderer tests and build**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
rtk npm run build -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS and TypeScript emits the FK modules without
cycles or generic type errors.

- [ ] **Step 7: Commit shared canvas integration**

```bash
rtk git add packages/renderer/src/ErdCanvas.tsx packages/renderer/test/fk-routing.test.mjs packages/renderer/test/color-mode.test.mjs
rtk git commit -m "feat(renderer): switch FK routing around table drags"
```

---

### Task 5: Cross-Host Verification and Regression Gate

**Files:**
- Verify: `apps/web-sandbox`
- Verify: `apps/host-webview`
- Verify: `apps/vscode-extension`
- Verify: `apps/intellij-plugin`
- Verify: `examples/schema.dbml` and its existing layout sidecar, if present

**Interfaces:**
- Consumes: the completed shared renderer and generated host-webview bundle.
- Produces: evidence that Web, VS Code, and IntelliJ build the same FK behavior without schema, protocol, or layout migrations.

- [ ] **Step 1: Run the full JavaScript/TypeScript regression suite**

Run:

```bash
rtk npm test
rtk npm run build
```

Expected: all core, renderer, web sandbox, host webview, VS Code, and legal tests
PASS; all workspace builds PASS.

- [ ] **Step 2: Build the VS Code distribution path**

Run:

```bash
rtk npm run build:vscode
```

Expected: the shared webview and VS Code host compile successfully with Smart
Edge included in the renderer bundle.

- [ ] **Step 3: Build the IntelliJ distribution path with JDK 21**

Run from `apps/intellij-plugin` with the repository's established JDK 21:

```bash
rtk /bin/zsh -lc 'JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew build --no-daemon'
```

Expected: Gradle copies the current `apps/host-webview/dist` assets into plugin
resources and the IntelliJ plugin build PASSes.

- [ ] **Step 4: Perform browser-sandbox visual verification**

Run:

```bash
rtk npm run dev
```

With `examples/schema.dbml` or an equivalent three-table DBML fixture:

1. Place an unrelated table between two FK endpoints.
2. Drag one endpoint table across the obstacle.
3. Confirm the affected line follows immediately with adaptive smooth-step
   routing during the drag.
4. Release the table and confirm the line becomes a rounded orthogonal route
   that remains at least 16px outside the unrelated table.
5. Move the source table across the target table and confirm endpoint handles
   switch sides without swapping FK semantics or labels.
6. Confirm a self-reference remains visible and multiple FKs retain their own
   column-row endpoints.

- [ ] **Step 5: Verify persistence remains unchanged**

Move a table and inspect the emitted/saved layout JSON. Assert it contains only:

```json
{
  "version": 1,
  "nodes": {
    "schema.table": { "x": 0, "y": 0, "color": "blue" }
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

The exact values may differ, but there must be no `edges`, `routes`,
`bendPoints`, or React Flow node/edge objects.

- [ ] **Step 6: Inspect the final diff and repository status**

Run:

```bash
rtk git diff --check
rtk git status --short
rtk git log -5 --oneline
```

Expected: no whitespace errors; only intentional source, test, dependency, and
notice changes are present. Preserve the user's pre-existing `todo.txt` and do
not stage `.superpowers/` visual-companion artifacts.

---

## Final Acceptance Checklist

- [ ] Every FK remains attached to its exact source and target column row.
- [ ] Left/right handles switch deterministically as tables exchange horizontal positions.
- [ ] Dragging uses adaptive smooth-step routes without invoking A* per pointer move.
- [ ] Releasing a table produces rounded orthogonal A* routes around unrelated table rectangles with 16px padding.
- [ ] A returned or thrown routing error falls back only that edge.
- [ ] Self-references remain visible and multiple FKs keep distinct endpoints.
- [ ] Relationship labels, cardinality, styling, and selection state are preserved.
- [ ] No DBML, host protocol, or layout sidecar migration is introduced.
- [ ] Web sandbox, host webview, VS Code, and IntelliJ builds pass.
- [ ] Third-party notices include Smart Edge 4.13.1 under the MIT license.
