# Zero-Update FK Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate routing-driven FK edge state updates from table-drag pointer frames while retaining live connected paths and one final settled smart-route rebuild.

**Architecture:** A pure drag-session selector exposes the frozen drag-start node array while a session is active and the live measured array otherwise. `ErdCanvas` uses that stable reference as the routing effect dependency, switches connected edges to adaptive mode once at drag start, lets React Flow update their endpoint props during movement, and rebuilds all settled edges once when the session ends.

**Tech Stack:** TypeScript, React 19, React Flow 12.11.2, Node test runner, npm workspaces, Vite host webview, Gradle IntelliJ plugin packaging.

## Global Constraints

- Implement only in `@dbml-canvas/renderer`; browser, VS Code, and IntelliJ consume the shared renderer.
- Do not change DBML parsing, host messages, or layout sidecar version 1.
- Do not run routing-driven `setEdges` work during pointer-move node updates.
- Keep FK handles fixed during the drag and recalculate them after release.
- Preserve FK focus, selection, labels, adaptive fallback, multi-node dragging, and the static MiniMap snapshot.
- Preserve the user's untracked `todo.txt`.
- Prefix every shell command with `rtk`.

---

### Task 1: Stable FK routing input for a drag session

**Files:**
- Modify: `packages/renderer/src/fk-drag-session.ts`
- Modify: `packages/renderer/test/fk-drag-session.test.mjs`

**Interfaces:**
- Consumes: `FkDragSession.frozenNodes` and the current `TableFlowNode[]`.
- Produces: `selectFkRoutingNodes(nodes, session): TableFlowNode[]`.

- [ ] **Step 1: Write the failing reference-stability test**

Add this focused behavior to `fk-drag-session.test.mjs`:

```js
test('FK routing nodes stay frozen for an active drag session', () => {
  assert.equal(typeof dragModule.selectFkRoutingNodes, 'function');

  const frozenNodes = [node('public.orders'), node('public.users', 500)];
  const session = dragModule.startFkDragSession(
    frozenNodes,
    frozenNodes[0],
    [frozenNodes[0]],
  );
  const movedNodes = [
    { ...frozenNodes[0], position: { x: 240, y: 40 } },
    frozenNodes[1],
  ];

  assert.equal(dragModule.selectFkRoutingNodes(movedNodes, session), frozenNodes);
  assert.equal(dragModule.selectFkRoutingNodes(movedNodes, undefined), movedNodes);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="routing nodes stay frozen" packages/renderer/test/fk-drag-session.test.mjs
```

Expected: FAIL at the `typeof` assertion because `selectFkRoutingNodes` is not
exported.

- [ ] **Step 3: Implement the minimal selector**

Add to `fk-drag-session.ts`:

```ts
export function selectFkRoutingNodes(
  nodes: TableFlowNode[],
  session: FkDragSession | undefined,
): TableFlowNode[] {
  return session?.frozenNodes ?? nodes;
}
```

Change `FkDragSession.frozenNodes` from `readonly TableFlowNode[]` to
`TableFlowNode[]` so the selector remains compatible with the existing graph
interfaces without copying. Keep the function pure and preserve the caller's
exact array references.

- [ ] **Step 4: Run focused and renderer tests and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
```

Expected: every renderer test passes.

- [ ] **Step 5: Commit Task 1**

```bash
rtk git add packages/renderer/src/fk-drag-session.ts packages/renderer/test/fk-drag-session.test.mjs
rtk git commit -m "perf(renderer): freeze FK routing input during drag"
```

---

### Task 2: Remove pointer-frame edge updates from ErdCanvas

**Files:**
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `packages/renderer/test/fk-drag-session.test.mjs`
- Modify: `packages/renderer/test/fk-routing.test.mjs`
- Modify: `packages/renderer/test/fk-edge.test.mjs`

**Interfaces:**
- Consumes: `selectFkRoutingNodes` from Task 1.
- Consumes: `updateFlowEdgesDuringDrag(schema, nodes, currentEdges, movedNodeIds, fkPresentation?)` exactly once per drag-session or presentation transition.
- Produces: an edge-routing effect whose node dependency is the frozen snapshot during drag and the current measured nodes outside drag.

- [ ] **Step 1: Write the failing canvas lifecycle regression**

Replace the existing source-level assertion named
`ErdCanvas selectively updates edges only while an FK drag session is active`
with assertions that require an explicitly stable routing input:

```js
test('ErdCanvas keeps its edge routing dependency stable during pointer movement', async () => {
  const source = await readFile(new URL('../src/ErdCanvas.tsx', import.meta.url), 'utf8');

  assert.match(source, /selectFkRoutingNodes\(routingNodesRef\.current, fkDragSession\)/);
  assert.match(source, /if \(!fkDragSession && !areFkRoutingNodesEqual/);
  assert.match(source, /updateFlowEdgesDuringDrag\([\s\S]*fkRoutingNodes[\s\S]*fkDragSession\.movedNodeIds/);
  assert.match(source, /\[fkDragSession, fkPresentation, fkRoutingNodes, schema, setEdges\]/);
  assert.doesNotMatch(source, /\[fkDragSession, fkPresentation, routingNodes, schema, setEdges\]/);
});
```

Retain the existing assertions for drag start, drag stop, multi-node layout
persistence, and removal of the old global `routingMode` state.

- [ ] **Step 2: Run the focused lifecycle test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test --test-name-pattern="edge routing dependency stable" packages/renderer/test/fk-drag-session.test.mjs
```

Expected: FAIL because `ErdCanvas` currently compares live nodes and depends on
the resulting `routingNodes` reference on every drag frame.

- [ ] **Step 3: Freeze the canvas routing dependency during a drag**

Import `selectFkRoutingNodes` and replace the current routing-node block with:

```ts
const routingNodesRef = useRef<TableFlowNode[]>(nodes);
if (
  !fkDragSession
  && !areFkRoutingNodesEqual(routingNodesRef.current, nodes)
) {
  routingNodesRef.current = nodes;
}
const fkRoutingNodes = selectFkRoutingNodes(
  routingNodesRef.current,
  fkDragSession,
);
```

In the edge effect, pass `fkRoutingNodes` to both
`updateFlowEdgesDuringDrag` and `createFlowEdges`, and use exactly these
dependencies:

```ts
[fkDragSession, fkPresentation, fkRoutingNodes, schema, setEdges]
```

During a pointer frame, `nodes` may change but `fkDragSession` and
`fkRoutingNodes` do not, so React does not run this effect or call `setEdges`.
On drag stop, `fkDragSession` becomes undefined, the ref captures final nodes,
and the same effect performs one settled rebuild.

- [ ] **Step 4: Add a stable-edge identity regression**

Extend the selective routing test in `fk-routing.test.mjs` so its adaptive
result is reused without another call while only the node collection changes:

```js
const pointerFrameEdges = dragged;
assert.equal(pointerFrameEdges.find(({ id }) => id === 'orders-user'), connected);
assert.equal(pointerFrameEdges.find(({ id }) => id === 'audit-team'), unrelated);
```

Then verify separately that a final `createFlowEdges` call with nodes moved
past the opposite table recalculates the source and target handles and sets
`routingMode` to `settled`.

- [ ] **Step 5: Verify adaptive endpoint-driven paths without edge-data changes**

Extend `fk-edge.test.mjs` with two `resolveFkRoute` calls that share the same
nodes and adaptive mode but use different endpoint coordinates:

```js
const before = resolveFkRoute(params, nodes, 'adaptive');
const after = resolveFkRoute({
  ...params,
  sourceX: params.sourceX + 120,
  sourceY: params.sourceY + 40,
}, nodes, 'adaptive');

assert.notEqual(after.path, before.path);
```

Run the focused test before production changes if it is added before Step 3.
It may already pass because endpoint-driven adaptive routing exists; in that
case it is characterization coverage, while the lifecycle test remains the
required observed RED for the production change.

- [ ] **Step 6: Run renderer tests, typecheck, and build and verify GREEN**

Run:

```bash
rtk npm test -w @dbml-canvas/renderer
rtk npm run typecheck -w @dbml-canvas/renderer
rtk npm run build -w @dbml-canvas/renderer
```

Expected: every command exits 0.

- [ ] **Step 7: Review the task diff and commit Task 2**

Run:

```bash
rtk git diff --check
rtk git diff -- packages/renderer/src packages/renderer/test
```

Confirm there is no routing-driven `setEdges` dependency on live node changes
while `fkDragSession` exists, then commit:

```bash
rtk git add packages/renderer/src/ErdCanvas.tsx packages/renderer/test/fk-drag-session.test.mjs packages/renderer/test/fk-routing.test.mjs packages/renderer/test/fk-edge.test.mjs
rtk git commit -m "perf(renderer): avoid FK edge updates on drag frames"
```

---

### Task 3: Full verification and IntelliJ 0.1.5 package validation

**Files:**
- Modify only if an in-scope verification defect is reproduced with a failing test first.

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

- [ ] **Step 2: Review the final renderer diff independently**

Read the complete diff from the design commit and check these invariants:

```text
drag start  -> one connected-edge adaptive replacement
pointer move -> node updates only; no routing-driven setEdges
drag stop   -> one complete settled edge rebuild and one layout persistence
```

Also check schema/layout cancellation, focus transitions, edge selection,
multi-node dragging, and MiniMap snapshot cleanup.

- [ ] **Step 3: Build a clean IntelliJ plugin with JDK 21**

From `apps/intellij-plugin`, run:

```bash
rtk env JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew clean buildPlugin --no-daemon
```

Expected: Gradle exits 0 and creates
`build/distributions/dbml-canvas-intellij-0.1.5.zip`.

- [ ] **Step 4: Inspect packaged host-webview assets**

List the ZIP, extract its webview asset names, and compare their SHA-256 hashes
with `apps/host-webview/dist`. Expected: the packaged HTML, CSS, JavaScript, and
source map are exactly the current production build with no stale assets.

- [ ] **Step 5: Perform available interaction smoke testing**

Use a dense schema and confirm that a connected FK follows the dragged table,
unrelated FK paths and the MiniMap snapshot remain fixed, and all settled routes
update after release. If no browser backend or IntelliJ GUI runtime is
available, report that limitation explicitly and do not claim a visual pass.

- [ ] **Step 6: Record final status**

Run:

```bash
rtk git status --short --branch
rtk git log -5 --oneline
```

Confirm only the user's pre-existing untracked `todo.txt` remains and report
the final test counts, package path, size, and SHA-256.
