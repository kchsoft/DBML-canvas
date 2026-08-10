# FK Drag Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep IntelliJ, VS Code, and browser table dragging responsive by updating only FK edges connected to moved tables and freezing MiniMap node geometry until release.

**Architecture:** `ErdCanvas` owns one transient drag snapshot and passes routing-node snapshots through FK edge data instead of making every edge subscribe to the complete React Flow node store. Pure graph helpers merge newly created connected adaptive edges into the existing edge array while preserving unrelated identities. A memoized custom MiniMap SVG node reads a drag snapshot from context, so its visible node rectangles remain fixed until the drag ends.

**Tech Stack:** TypeScript, React 19, React Flow 12.11.2, Node test runner, npm workspaces, Vite host webview, Gradle IntelliJ plugin packaging.

## Global Constraints

- Implement the behavior only in `@dbml-canvas/renderer`; all hosts consume the shared result.
- Do not change DBML parsing, host bridge messages, or layout sidecar version 1.
- Keep FK focus, selection, labels, handles, and per-edge smart-route fallback intact.
- Keep the MiniMap visible during dragging; freeze its node positions until drag stop.
- Run smart A* routing only after the drag completes, never per pointer update.
- Prefix every shell command with `rtk`.

---

### Task 1: Canvas-owned FK routing snapshots

**Files:**
- Modify: `packages/renderer/src/fk-routing.ts`
- Modify: `packages/renderer/src/graph.ts`
- Test: `packages/renderer/test/fk-routing.test.mjs`

**Interfaces:**
- Produces: `FkEdgeData.routingNodes: readonly FkGeometryNode[]`.
- Produces: `updateFlowEdgesDuringDrag(schema, nodes, currentEdges, movedNodeIds, fkPresentation?): FkFlowEdge[]`.
- Consumes: stable relationship source/target IDs and existing `createFlowEdges` output.

- [ ] **Step 1: Write failing tests for routing snapshots and selective edge identity**

Add a three-table/two-relationship fixture and assertions equivalent to:

```js
import * as graph from '../dist/graph.js';

assert.equal(typeof graph.updateFlowEdgesDuringDrag, 'function');
const initial = createFlowEdges(graphSchema, initialNodes, 'settled');
assert.equal(initial[0].data.routingNodes, initial[1].data.routingNodes);

const dragged = updateFlowEdgesDuringDrag(
  graphSchema,
  movedNodes,
  initial,
  new Set(['public.orders']),
);

assert.notEqual(dragged.find(({ id }) => id === 'orders-user'), initial[0]);
assert.equal(dragged.find(({ id }) => id === 'audit-team'), initial[1]);
assert.equal(dragged.find(({ id }) => id === 'orders-user').data.routingMode, 'adaptive');
```

Also assert that selected state survives replacement of a connected edge and
that focus-only changes clone only the edge whose focus state changed.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="routing snapshot|selective drag" packages/renderer/test/fk-routing.test.mjs
```

Expected: FAIL at the `typeof` assertion because
`updateFlowEdgesDuringDrag` does not exist. Using the namespace import keeps
the RED result as an assertion failure rather than an ESM import error.

- [ ] **Step 3: Add routing nodes to FK edge data**

Extend the data contract in `fk-routing.ts`:

```ts
export interface FkEdgeData extends Record<string, unknown> {
  routingMode: FkRoutingMode;
  routingNodes: readonly FkGeometryNode[];
  selfReference: boolean;
  focusState: FkFocusState;
}
```

In `createFlowEdges`, reuse one `nodes` array reference for all edges produced
by the invocation. Do not clone routing nodes per relationship.

- [ ] **Step 4: Implement the selective drag merge helper**

In `graph.ts`, add:

```ts
export function updateFlowEdgesDuringDrag(
  schema: ErdSchema,
  nodes: FkGeometryNode[],
  currentEdges: FkFlowEdge[],
  movedNodeIds: ReadonlySet<string>,
  fkPresentation?: FkFocusPresentation,
): FkFlowEdge[];
```

Index relationships by ID once per invocation. For an edge whose source or
target is moved, build an adaptive replacement from current geometry and copy
its `selected` flag. For an unrelated edge, return the same object unless its
derived `focusState` changed; in that case clone only `data` while retaining its
frozen `routingNodes` and `routingMode`.

- [ ] **Step 5: Run focused and renderer tests and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
rtk git add packages/renderer/src/fk-routing.ts packages/renderer/src/graph.ts packages/renderer/test/fk-routing.test.mjs
rtk git commit -m "perf(renderer): update only connected FK edges while dragging"
```

---

### Task 2: Remove per-edge full-node store subscriptions

**Files:**
- Modify: `packages/renderer/src/FkEdge.tsx`
- Modify: `packages/renderer/test/fk-edge.test.mjs`

**Interfaces:**
- Consumes: `FkEdgeData.routingNodes` from Task 1.
- Produces: `FkEdge` route resolution without `useStore` or `areFkRoutingNodesEqual`.

- [ ] **Step 1: Replace the equality-helper test with a failing edge-data routing test**

Use `createFlowEdges` with a named `routingNodes` array and assert
`edge.data.routingNodes === routingNodes`. Add this source contract assertion:

```js
const source = await readFile(new URL('../src/FkEdge.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(source, /\buseStore\b/);
assert.doesNotMatch(source, /areFkRoutingNodesEqual/);
```

Name the test `FK edges consume canvas routing snapshots without subscribing to all nodes`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="canvas routing snapshots" packages/renderer/test/fk-edge.test.mjs
```

Expected: FAIL because `FkEdge.tsx` still imports and invokes `useStore`.

- [ ] **Step 3: Consume routing nodes from edge data**

Remove `useStore`, `TableFlowNode`, and `areFkRoutingNodesEqual`. Resolve using:

```ts
const routingNodes = props.data?.routingNodes ?? [];
const routingMode = props.data?.routingMode ?? 'settled';
```

Keep `routingNodes` in the `useMemo` dependency list. Do not change path
validation, focus visuals, labels, or smart-route fallback.

- [ ] **Step 4: Run focused and renderer tests and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS with no source references to the removed
full-node subscription.

- [ ] **Step 5: Commit Task 2**

```bash
rtk git add packages/renderer/src/FkEdge.tsx packages/renderer/test/fk-edge.test.mjs
rtk git commit -m "perf(renderer): route FK edges from canvas snapshots"
```

---

### Task 3: Integrate the drag session in ErdCanvas

**Files:**
- Create: `packages/renderer/src/fk-drag-session.ts`
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Create: `packages/renderer/test/fk-drag-session.test.mjs`

**Interfaces:**
- Produces: `FkDragSession` with `movedNodeIds` and `frozenNodes`.
- Produces: `startFkDragSession(nodes, draggedNodes): FkDragSession`.
- Produces: `reconcileFkDragSession(session, schema): FkDragSession | undefined`.
- Consumes: `updateFlowEdgesDuringDrag` from Task 1.

- [ ] **Step 1: Write failing pure drag-session tests**

Cover one dragged node, multiple dragged nodes, and schema removal:

```js
const dragModule = await import('../dist/fk-drag-session.js').catch(() => ({}));
assert.equal(typeof dragModule.startFkDragSession, 'function');

const session = startFkDragSession(allNodes, [allNodes[0]]);
assert.deepEqual([...session.movedNodeIds], ['public.orders']);
assert.equal(session.frozenNodes, allNodes);

assert.equal(
  reconcileFkDragSession(session, schemaWithoutOrders),
  undefined,
);
```

Verify the helper stores node geometry by reference at start and never mutates
the caller's node array or set.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="FK drag session" packages/renderer/test/fk-drag-session.test.mjs
```

Expected: FAIL at the `typeof` assertion because the drag-session module does
not exist; the guarded dynamic import keeps RED as a test failure, not a module
loader error.

- [ ] **Step 3: Implement the pure drag-session model**

Use this contract:

```ts
export interface FkDragSession {
  movedNodeIds: ReadonlySet<string>;
  frozenNodes: readonly TableFlowNode[];
}
```

`startFkDragSession` derives IDs from React Flow's `draggedNodes` callback
argument and falls back to the active node when that list is empty.
`reconcileFkDragSession` returns `undefined` if any moved node ID no longer
exists in `schema.tables`.

- [ ] **Step 4: Add a failing ErdCanvas source integration test**

Add assertions to `fk-drag-session.test.mjs` that `ErdCanvas.tsx` wires
`onNodeDragStart`, `onNodeDrag`, and `onNodeDragStop`, invokes
`updateFlowEdgesDuringDrag` only with an active session, and clears the session
on schema/layout replacement.

Run the same focused command and verify it fails because the canvas still uses
the global `routingMode` transition effect.

- [ ] **Step 5: Replace global dragging mode with a drag session**

In `ErdCanvas.tsx`:

```ts
const [fkDragSession, setFkDragSession] = useState<FkDragSession>();
```

At drag start, create the session from current nodes and the callback's dragged
nodes. While the session is active, the routing effect calls
`updateFlowEdgesDuringDrag`; otherwise it performs the existing complete
settled rebuild. On drag stop, clear the session before emitting the final
layout. On schema or layout replacement, clear or reconcile the session before
rebuilding the graph.

Remove the canvas-level `routingMode` state and `transitionFkRoutingMode` calls.
Do not add `onLayoutChange` calls during pointer movement.

- [ ] **Step 6: Run focused and renderer tests and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS; unrelated edge identities stay stable across
node movement and settled routes rebuild after session removal.

- [ ] **Step 7: Commit Task 3**

```bash
rtk git add packages/renderer/src/ErdCanvas.tsx packages/renderer/src/fk-drag-session.ts packages/renderer/test/fk-drag-session.test.mjs
rtk git commit -m "perf(renderer): manage FK routing as a drag session"
```

---

### Task 4: Freeze MiniMap node geometry during dragging

**Files:**
- Create: `packages/renderer/src/DragStableMiniMapNode.tsx`
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Create: `packages/renderer/test/drag-stable-minimap.test.mjs`

**Interfaces:**
- Consumes: `FkDragSession.frozenNodes` from Task 3.
- Produces: `MiniMapDragSnapshotProvider` and `DragStableMiniMapNode` compatible with React Flow `MiniMapNodeProps`.
- Produces: `getMiniMapNodeRect(props, snapshot): { x; y; width; height }` for pure testing.

- [ ] **Step 1: Write failing snapshot rectangle tests**

Test live and frozen geometry:

```js
const miniMapModule = await import('../dist/DragStableMiniMapNode.js').catch(() => ({}));
assert.equal(typeof miniMapModule.getMiniMapNodeRect, 'function');

assert.deepEqual(getMiniMapNodeRect(liveProps, undefined), {
  x: 420, y: 90, width: 340, height: 160,
});
assert.deepEqual(getMiniMapNodeRect(liveProps, frozenById), {
  x: 80, y: 90, width: 340, height: 160,
});
```

Also render `DragStableMiniMapNode` under the provider and assert the SVG rect
stays at the frozen coordinates, remains visible, and switches to live
coordinates after the provider snapshot is removed.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="MiniMap drag snapshot" packages/renderer/test/drag-stable-minimap.test.mjs
```

Expected: FAIL at the `typeof` assertion because the custom node module does
not exist; the guarded dynamic import keeps RED as an assertion failure.

- [ ] **Step 3: Implement the snapshot-backed SVG node**

Create a context holding a read-only map of node rectangles. Implement a
memoized SVG `<rect>` compatible with `MiniMapNodeProps`. Preserve default
classes, selection class, color, stroke, border radius, shape rendering, and
click behavior. Its pure rectangle resolver uses snapshot coordinates when an
entry exists and current props otherwise.

The memo comparator may ignore geometry prop changes while context supplies a
snapshot, but context changes at drag start and stop must force a render. Do not
copy or modify React Flow package source.

- [ ] **Step 4: Wire the custom node into the existing MiniMap**

Wrap the existing MiniMap with `MiniMapDragSnapshotProvider` and pass:

```tsx
<MiniMap
  pannable
  zoomable
  nodeStrokeWidth={3}
  nodeComponent={DragStableMiniMapNode}
/>
```

Build the snapshot map only at drag start from `fkDragSession.frozenNodes` and
keep its identity stable during pointer moves. Clear it on drag stop, schema
replacement, layout replacement, and unmount.

- [ ] **Step 5: Run focused and renderer tests and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS and the MiniMap remains mounted in SSR markup.

- [ ] **Step 6: Commit Task 4**

```bash
rtk git add packages/renderer/src/DragStableMiniMapNode.tsx packages/renderer/src/ErdCanvas.tsx packages/renderer/test/drag-stable-minimap.test.mjs
rtk git commit -m "perf(renderer): freeze MiniMap nodes during table drag"
```

---

### Task 5: Full verification and packaged-host validation

**Files:**
- Modify only if verification reveals an in-scope defect.

**Interfaces:**
- Consumes: Tasks 1–4 complete behavior.
- Produces: verified shared renderer and rebuilt IDE artifacts.

- [ ] **Step 1: Run renderer and workspace verification**

```bash
rtk npm test -w @dbml-canvas/renderer
rtk npm test
rtk npm run typecheck
rtk npm run build
```

Expected: every command exits 0 with no unexpected warnings.

- [ ] **Step 2: Build the VS Code package**

```bash
rtk npm run build:vscode
rtk npm run package -w dbml-canvas-vscode
```

Expected: the current-version VSIX is generated and contains the rebuilt shared
host webview.

- [ ] **Step 3: Build the IntelliJ plugin with JDK 21**

From `apps/intellij-plugin`, run:

```bash
rtk env JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew build --no-daemon
rtk env JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew buildPlugin --no-daemon
```

Expected: Gradle exits 0 and the plugin ZIP contains the newly built webview.

- [ ] **Step 4: Inspect the packaged bundles**

List VSIX and IntelliJ ZIP contents and compare packaged webview asset hashes to
`apps/host-webview/dist`. Expected: names and bytes match the current build.

- [ ] **Step 5: Perform available interaction smoke tests**

Use a dense schema with both connected and unrelated FK edges. Confirm that the
connected line follows the table, unrelated lines and MiniMap nodes remain
fixed during movement, and all smart routes update after release. Record a
browser performance trace when a browser backend is available. If Browser or
IntelliJ GUI execution is unavailable, report that limitation explicitly.

- [ ] **Step 6: Review the final diff and commit any verification fix**

```bash
rtk git diff --check
rtk git status --short
```

Preserve the user's untracked `todo.txt`. If verification required no product
change, do not create an empty commit.
