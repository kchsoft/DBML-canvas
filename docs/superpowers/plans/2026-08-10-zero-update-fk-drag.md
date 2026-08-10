# Zero-Update FK Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate routing-driven FK edge state updates from table-drag pointer frames while retaining live connected paths and one final settled smart-route rebuild.

**Architecture:** A pure routing lifecycle owns one stable snapshot containing the node geometry and active drag session. The snapshot changes at drag start, remains referentially identical across pointer frames, and changes once at drag stop; `ErdCanvas` makes its edge effect depend on that snapshot. React Flow continues updating connected custom-edge endpoint props, so adaptive paths follow moving nodes without changing the edge array.

**Tech Stack:** TypeScript, React 19, React Flow 12.11.2, Node test runner, npm workspaces, Vite host webview, Gradle IntelliJ plugin packaging.

## Global Constraints

- Implement only in `@dbml-canvas/renderer`; browser, VS Code, and IntelliJ consume the shared renderer.
- Do not change DBML parsing, host messages, or layout sidecar version 1.
- Do not run routing-driven `setEdges` work or full-node geometry comparison during pointer-move updates.
- Keep FK handles fixed during the drag and recalculate them after release.
- Preserve FK focus, selection, labels, adaptive fallback, multi-node dragging, and the static MiniMap snapshot.
- Preserve the user's untracked `todo.txt`.
- Prefix every shell command with `rtk`.

---

### Task 1: Model routing as a stable drag lifecycle

**Files:**
- Modify: `packages/renderer/src/fk-drag-session.ts`
- Modify: `packages/renderer/test/fk-drag-session.test.mjs`

**Interfaces:**
- Produces: `FkRoutingSnapshot { nodes: TableFlowNode[]; dragSession?: FkDragSession }`.
- Produces: `updateFkRoutingSnapshot(current, nodes, dragSession): FkRoutingSnapshot`.
- Moves: the geometry-equivalence rule from `ErdCanvas` into the lifecycle helper.

- [ ] **Step 1: Write the failing lifecycle test**

Add a test using real snapshot objects and literal positions. The production
mutation it catches is returning a new routing snapshot when only live node
positions change inside the same drag session:

```js
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
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="routing snapshot changes only" packages/renderer/test/fk-drag-session.test.mjs
```

Expected: FAIL at the `typeof` assertion because
`updateFkRoutingSnapshot` does not exist.

- [ ] **Step 3: Add settled-state geometry cases while still RED**

Extend the test with these independently derived cases:

```js
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
```

These catch the opposite mutations: rebuilding for presentation-only node
changes and failing to rebuild when measured routing geometry changes.

- [ ] **Step 4: Implement the minimal routing lifecycle**

In `fk-drag-session.ts`, define:

```ts
export interface FkRoutingSnapshot {
  nodes: TableFlowNode[];
  dragSession?: FkDragSession;
}

export function updateFkRoutingSnapshot(
  current: FkRoutingSnapshot | undefined,
  nodes: TableFlowNode[],
  dragSession: FkDragSession | undefined,
): FkRoutingSnapshot;
```

Implement these exact transitions:

1. If `dragSession` exists and `current?.dragSession === dragSession`, return
   `current` before comparing any nodes.
2. If a new drag session exists, return `{ nodes: dragSession.frozenNodes,
   dragSession }`.
3. If the previous snapshot held a drag session and the new session is absent,
   return `{ nodes }`.
4. Outside a drag, return `current` when IDs, positions, and measured sizes are
   equivalent; otherwise return `{ nodes }`.

Move `areFkRoutingNodesEqual` from `ErdCanvas.tsx` into this module as a private
helper. It compares array length, IDs, positions, and measured width/height in
order and does not inspect selection or presentation data.

- [ ] **Step 5: Run focused and renderer tests and verify GREEN**

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: every renderer test passes.

- [ ] **Step 6: Commit Task 1**

```bash
rtk git add packages/renderer/src/fk-drag-session.ts packages/renderer/test/fk-drag-session.test.mjs
rtk git commit -m "perf(renderer): stabilize FK routing drag lifecycle"
```

---

### Task 2: Drive ErdCanvas edges from the stable snapshot

**Files:**
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `packages/renderer/test/fk-edge.test.mjs`
- Modify: `packages/renderer/test/fk-routing.test.mjs`

**Interfaces:**
- Consumes: `updateFkRoutingSnapshot` from Task 1.
- Consumes: `updateFlowEdgesDuringDrag(schema, snapshot.nodes, currentEdges, snapshot.dragSession.movedNodeIds, fkPresentation?)`.
- Produces: an edge effect keyed by `FkRoutingSnapshot`, schema, and focus presentation rather than live React Flow nodes.

- [ ] **Step 1: Add endpoint-driven adaptive-path characterization**

The framework boundary assumption is that React Flow supplies changing endpoint
props while stable edge data remains mounted. Add this narrow test to
`fk-edge.test.mjs`:

```js
test('adaptive FK paths follow endpoint props without new routing nodes', () => {
  const before = resolveFkRoute(params, nodes, 'adaptive');
  const after = resolveFkRoute({
    ...params,
    sourceX: params.sourceX + 120,
    sourceY: params.sourceY + 40,
  }, nodes, 'adaptive');

  assert.notEqual(after.path, before.path);
  assert.equal(before.kind, 'adaptive');
  assert.equal(after.kind, 'adaptive');
});
```

Run it before the integration edit. It is expected to pass because it
characterizes an existing dependency behavior; Task 1's observed RED is the
test-first proof for the new lifecycle behavior.

- [ ] **Step 2: Replace the canvas routing ref with the lifecycle snapshot**

Import `updateFkRoutingSnapshot`, create one ref, and update it during render:

```ts
const fkRoutingSnapshotRef = useRef<FkRoutingSnapshot>();
fkRoutingSnapshotRef.current = updateFkRoutingSnapshot(
  fkRoutingSnapshotRef.current,
  nodes,
  fkDragSession,
);
const fkRoutingSnapshot = fkRoutingSnapshotRef.current;
```

Remove the local `areFkRoutingNodesEqual` function and the old
`routingNodesRef` block. In the edge effect:

- When `fkRoutingSnapshot.dragSession` exists, call
  `updateFlowEdgesDuringDrag` with `fkRoutingSnapshot.nodes` and its moved IDs.
- Otherwise call `createFlowEdges` with `fkRoutingSnapshot.nodes` in settled
  mode and preserve selected IDs as today.
- Depend on `fkRoutingSnapshot`, `fkPresentation`, `schema`, and `setEdges`.

Because Task 1 returns the same snapshot object for every pointer frame in one
session, those frames cannot retrigger the effect. A focus transition may still
update presentation once, which is intentional.

- [ ] **Step 3: Verify final handle recalculation behavior**

Extend the drag test in `fk-routing.test.mjs` using a literal final geometry
where `public.orders` crosses to the right of `public.users`. Assert that
`createFlowEdges(dragSchema, finalNodes, 'settled')` returns:

```js
assert.equal(settledConnected.sourceHandle, 'source:left:public.orders.user_id');
assert.equal(settledConnected.targetHandle, 'target:right:public.users.id');
assert.equal(settledConnected.data.routingMode, 'settled');
```

This catches a missing settled rebuild or accidentally frozen handle choice.

- [ ] **Step 4: Run renderer verification and inspect the diff**

```bash
rtk npm test -w @dbml-canvas/renderer
rtk npm run typecheck -w @dbml-canvas/renderer
rtk npm run build -w @dbml-canvas/renderer
rtk git diff --check
```

Expected: every command exits 0. Inspect the complete task diff and verify:

```text
drag start   -> snapshot changes; connected edges become adaptive once
pointer move -> snapshot identity stays fixed; edge effect does not run
drag stop    -> snapshot changes; all edges rebuild settled once
```

- [ ] **Step 5: Commit Task 2**

```bash
rtk git add packages/renderer/src/ErdCanvas.tsx packages/renderer/test/fk-edge.test.mjs packages/renderer/test/fk-routing.test.mjs
rtk git commit -m "perf(renderer): avoid FK edge updates on drag frames"
```

---

### Task 3: Full verification and IntelliJ 0.1.5 package validation

**Files:**
- Modify only when an in-scope defect is first reproduced by a failing test.

**Interfaces:**
- Consumes: the shared renderer output from Tasks 1 and 2.
- Produces: verified browser/IDE bundles and a clean IntelliJ 0.1.5 ZIP.

- [ ] **Step 1: Run all automated workspace checks**

```bash
rtk npm test
rtk npm run typecheck
rtk npm run build
```

Expected: every command exits 0 with no new warnings.

- [ ] **Step 2: Perform an independent final review**

Read the complete diff from the design commit. Check schema/layout
cancellation, focus transitions, edge selection, multi-node dragging, MiniMap
snapshot cleanup, and the start/move/stop invariants above. Any defect must
receive its own observed RED before correction.

- [ ] **Step 3: Build a clean IntelliJ plugin with JDK 21**

From `apps/intellij-plugin`, run:

```bash
rtk env JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew clean buildPlugin --no-daemon
```

Expected: Gradle exits 0 and creates
`build/distributions/dbml-canvas-intellij-0.1.5.zip`.

- [ ] **Step 4: Inspect packaged assets**

List the ZIP, extract its webview asset names, and compare SHA-256 hashes with
`apps/host-webview/dist`. Expected: packaged HTML, CSS, JavaScript, and source
map exactly match the current production build and contain no stale assets.

- [ ] **Step 5: Perform available interaction smoke testing**

Use a dense schema and confirm that connected FK paths follow the table,
unrelated FK paths and the MiniMap snapshot remain fixed, and settled routes
update after release. If no browser backend or IntelliJ GUI runtime is
available, report that limitation explicitly and do not claim a visual pass.

- [ ] **Step 6: Record final status**

```bash
rtk git status --short --branch
rtk git log -5 --oneline
```

Confirm only the user's pre-existing `todo.txt` remains in the main checkout
and report final test counts, package path, size, and SHA-256.
