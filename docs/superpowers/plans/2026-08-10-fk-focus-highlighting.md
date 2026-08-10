# FK Focus Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transient, accessible FK focus so column clicks highlight every connected relationship, edge clicks highlight one relationship, and unrelated edges recede without changing routing or persisted data.

**Architecture:** Keep schema-to-focus calculation in a new pure `fk-focus.ts` module. `ErdCanvas` owns one focus value and derives node/edge presentation from it; `TableNode` and `FkEdge` render that presentation without owning relationship state. All changes stay in `@dbml-canvas/renderer`, so the browser, VS Code, and IntelliJ receive the same behavior through their existing shared bundles.

**Tech Stack:** TypeScript 5.8, React 19, React Flow 12 (`@xyflow/react`), Node test runner, server-side React markup tests, CSS custom properties.

## Global Constraints

- Use the approved balanced-focus style: focused edges use the accent color and a modest halo; unrelated edges remain visible at exactly 16% opacity.
- Column activation focuses every relationship containing that stable column ID; edge activation focuses only the clicked stable relationship ID.
- Empty-pane click and an unconsumed Escape clear focus; a new focus replaces the old focus.
- Enter and Space activate a focused column row.
- Note editing, settings, detail popovers, table dragging, adaptive routing, obstacle routing, and route fallback must retain their current behavior.
- FK focus is transient renderer state and must never enter DBML, layout JSON, browser storage, or host messages.
- Do not add runtime or test dependencies.
- All shell commands must be prefixed with `rtk` per `/Users/changhyeonkim/.codex/RTK.md`.

---

## File structure

- Create `packages/renderer/src/fk-focus.ts`: pure focus creation, reconciliation, and presentation derivation.
- Create `packages/renderer/test/fk-focus.test.mjs`: schema-level focus behavior, composite/self/parallel/stale cases.
- Modify `packages/renderer/src/fk-routing.ts`: add edge presentation state to `FkEdgeData`.
- Modify `packages/renderer/src/graph.ts`: carry focus-derived node and edge metadata without changing schema/layout contracts.
- Modify `packages/renderer/src/TableNode.tsx`: activate focus from column rows and render chosen/related row states.
- Modify `packages/renderer/src/FkEdge.tsx`: render focused halo, primary stroke, dimming, and label presentation independently from path routing.
- Modify `packages/renderer/src/ErdCanvas.tsx`: own focus lifecycle and connect column, edge, pane, Escape, schema, and drag events.
- Modify `packages/renderer/src/styles.css`: balanced-focus transitions and light/dark theme-aware states.
- Modify renderer tests beside the unit being changed; do not create host-specific feature implementations.

---

### Task 1: Pure FK focus model

**Files:**
- Create: `packages/renderer/src/fk-focus.ts`
- Create: `packages/renderer/test/fk-focus.test.mjs`
- Modify: `packages/renderer/src/index.ts`

**Interfaces:**
- Consumes: `ErdSchema` and stable relationship/column IDs from `@dbml-canvas/core`.
- Produces:
  - `FkFocus`
  - `FkFocusPresentation`
  - `createColumnFkFocus(schema, columnId): FkFocus | undefined`
  - `createEdgeFkFocus(schema, relationshipId): FkFocus | undefined`
  - `reconcileFkFocus(schema, focus): FkFocus | undefined`
  - `deriveFkFocusPresentation(schema, focus): FkFocusPresentation`
  - `getFkEdgeFocusState(presentation, relationshipId): FkFocusState`

- [ ] **Step 1: Write the failing pure-model tests**

Create a fixture with a composite `orders-account` relationship, two parallel relationships sharing `orders.owner_id`, a self-reference, and an unrelated column. Assert exact stable ordering and deduplication:

```js
const columnFocus = createColumnFkFocus(schema, 'public.orders.owner_id');
assert.deepEqual(columnFocus, {
  kind: 'column',
  columnId: 'public.orders.owner_id',
  relationshipIds: ['orders-owner', 'orders-approver'],
});

const composite = createColumnFkFocus(schema, 'public.orders.tenant_id');
assert.deepEqual(composite.relationshipIds, ['orders-account']);

const presentation = deriveFkFocusPresentation(schema, composite);
assert.deepEqual([...presentation.endpointColumnIds], [
  'public.orders.tenant_id',
  'public.orders.account_id',
  'public.accounts.tenant_id',
  'public.accounts.id',
]);
assert.equal(presentation.activeColumnId, 'public.orders.tenant_id');
assert.equal(getFkEdgeFocusState(presentation, 'orders-account'), 'focused');
assert.equal(getFkEdgeFocusState(presentation, 'orders-owner'), 'dimmed');

assert.equal(createColumnFkFocus(schema, 'public.orders.memo'), undefined);
assert.equal(createEdgeFkFocus(schema, 'missing'), undefined);
assert.equal(reconcileFkFocus(schemaWithoutOwner, columnFocus), undefined);
```

Also assert that edge focus has one relationship, self-reference endpoint IDs are deduplicated, and no focus derives `idle` for every edge.

- [ ] **Step 2: Run the new test to verify RED**

Run: `rtk npm run build -w @dbml-canvas/renderer && rtk node --test packages/renderer/test/fk-focus.test.mjs`

Expected: FAIL because `dist/fk-focus.js` or its exports do not exist.

- [ ] **Step 3: Implement the pure focus module**

Use these public types and deterministic schema-order traversal:

```ts
import type { ErdSchema } from '@dbml-canvas/core';

export type FkFocus =
  | { kind: 'column'; columnId: string; relationshipIds: string[] }
  | { kind: 'edge'; relationshipId: string; relationshipIds: [string] };

export type FkFocusState = 'idle' | 'focused' | 'dimmed';

export interface FkFocusPresentation {
  relationshipIds: ReadonlySet<string>;
  endpointColumnIds: ReadonlySet<string>;
  activeColumnId?: string;
}
```

`createColumnFkFocus` must scan `schema.relationships` once and include a relation when either endpoint `columnIds.includes(columnId)`. `createEdgeFkFocus` must return undefined for unknown IDs. `reconcileFkFocus` must recompute column focus from the current schema and validate edge focus against the current schema. `deriveFkFocusPresentation` must collect every member column on both endpoints of focused relationships into insertion-ordered sets. With no focus, `getFkEdgeFocusState` returns `idle`; otherwise it returns `focused` for a member ID and `dimmed` for every other ID.

Export the module from `packages/renderer/src/index.ts`.

- [ ] **Step 4: Run focused tests and typecheck to verify GREEN**

Run: `rtk npm run test -w @dbml-canvas/renderer && rtk npm run typecheck -w @dbml-canvas/renderer`

Expected: all renderer tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the focus model**

```bash
rtk git add packages/renderer/src/fk-focus.ts packages/renderer/src/index.ts packages/renderer/test/fk-focus.test.mjs
rtk git commit -m "feat(renderer): model FK focus state"
```

---

### Task 2: Carry focus presentation through graph data

**Files:**
- Modify: `packages/renderer/src/fk-routing.ts`
- Modify: `packages/renderer/src/graph.ts`
- Modify: `packages/renderer/test/fk-routing.test.mjs`
- Modify: `packages/renderer/test/table-node-layout.test.mjs`

**Interfaces:**
- Consumes: `FkFocusPresentation`, `FkFocusState`, and `getFkEdgeFocusState` from Task 1.
- Produces:
  - `FkEdgeData.focusState: FkFocusState`
  - `TableNodeData.activeFkColumnId?: string`
  - `TableNodeData.relatedFkColumnIds?: readonly string[]`
  - `TableNodeData.onFkColumnFocus?: (columnId: string) => void`
  - extended `createFlowNodes(..., fkPresentation?, onFkColumnFocus?)`
  - extended `createFlowEdges(..., fkPresentation?)`

- [ ] **Step 1: Write failing graph metadata assertions**

Extend the existing graph tests with a focus presentation containing `orders-user` and its two endpoint columns:

```js
const presentation = {
  relationshipIds: new Set(['orders-user']),
  endpointColumnIds: new Set(['public.orders.user_id', 'public.users.id']),
  activeColumnId: 'public.orders.user_id',
};
const onFkColumnFocus = () => {};
const nodes = createFlowNodes(schema, layout, undefined, undefined, presentation, onFkColumnFocus);
assert.equal(nodes[0].data.activeFkColumnId, 'public.orders.user_id');
assert.deepEqual(nodes[0].data.relatedFkColumnIds, ['public.orders.user_id']);
assert.equal(nodes[0].data.onFkColumnFocus, onFkColumnFocus);

const edges = createFlowEdges(schema, nodes, 'settled', presentation);
assert.equal(edges.find(({ id }) => id === 'orders-user').data.focusState, 'focused');
assert.equal(edges.find(({ id }) => id === 'orders-team').data.focusState, 'dimmed');
assert.equal(createFlowEdges(schema)[0].data.focusState, 'idle');
```

Update existing deep equality expectations for `FkEdgeData` to include `focusState: 'idle'`.

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `rtk npm run test -w @dbml-canvas/renderer`

Expected: FAIL because graph factories do not expose focus metadata.

- [ ] **Step 3: Extend graph contracts minimally**

Add `focusState` to `FkEdgeData`. Extend `TableNodeData` with the three transient fields above. Add optional trailing parameters to both graph factories so existing consumers remain source-compatible. Filter `presentation.endpointColumnIds` to each table's own column order before assigning `relatedFkColumnIds`; do not pass global sets into every node. Assign the exact `onFkColumnFocus` callback without wrapping it per row. Use `getFkEdgeFocusState` for every edge.

- [ ] **Step 4: Run renderer tests and typecheck**

Run: `rtk npm run test -w @dbml-canvas/renderer && rtk npm run typecheck -w @dbml-canvas/renderer`

Expected: all renderer tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit graph presentation metadata**

```bash
rtk git add packages/renderer/src/fk-routing.ts packages/renderer/src/graph.ts packages/renderer/test/fk-routing.test.mjs packages/renderer/test/table-node-layout.test.mjs
rtk git commit -m "feat(renderer): derive FK focus presentation"
```

---

### Task 3: Add accessible column focus interaction and row states

**Files:**
- Modify: `packages/renderer/src/TableNode.tsx`
- Modify: `packages/renderer/src/styles.css`
- Modify: `packages/renderer/test/table-node-layout.test.mjs`

**Interfaces:**
- Consumes: `TableNodeData.activeFkColumnId`, `relatedFkColumnIds`, and `onFkColumnFocus` from Task 2.
- Produces:
  - `isFkFocusActivationKey(key: string): boolean`
  - `.is-fk-active` and `.is-fk-related` row states
  - column mouse and keyboard activation without breaking detail popovers.

- [ ] **Step 1: Write failing keyboard, markup, and CSS tests**

Add assertions for the exported key helper and render a table node with active/related focus data:

```js
assert.equal(isFkFocusActivationKey('Enter'), true);
assert.equal(isFkFocusActivationKey(' '), true);
assert.equal(isFkFocusActivationKey('Escape'), false);

assert.match(markup, /class="dbml-column-row is-fk-active"/);
assert.match(markup, /class="dbml-column-row is-fk-related"/);
assert.match(markup, /aria-label="Focus FK relationships for members\.owner_id"/);
assert.match(css, /\.dbml-column-row\.is-fk-active\s*\{[^}]*box-shadow:/s);
assert.match(css, /\.dbml-column-row\.is-fk-related\s*\{[^}]*background:/s);
assert.match(css, /transition:[^;]*background-color 140ms/s);
```

Use two columns so the selected row and another related endpoint row can be asserted independently.

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `rtk npm run test -w @dbml-canvas/renderer`

Expected: FAIL because the helper, state classes, and CSS do not exist.

- [ ] **Step 3: Implement column activation and local Escape ownership**

Add:

```ts
export function isFkFocusActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}
```

For each row, compute `active` and `related` from node data. On click, call `event.stopPropagation()` then `onFkColumnFocus?.(column.id)`. On Enter/Space, call `preventDefault`, `stopPropagation`, and the same callback. Add the descriptive `aria-label` only when the callback exists.

Refine the article Escape handler: settings, editing, pinned details, or an open detail consume Escape, close local UI, and stop propagation. When no local UI is open, do not stop Escape so `ErdCanvas` can clear FK focus. Keep existing detail opening, saving, and blur timers unchanged.

Add theme-aware styles using `color-mix(in srgb, var(--dbml-accent) 12%, var(--dbml-surface))` for related rows and 20% for the active row. The active row gets `inset 3px 0 var(--dbml-accent)`. Transition background color, box shadow, and color for 140ms. Preserve `:hover` and `:focus-visible` visibility.

- [ ] **Step 4: Run renderer tests and typecheck**

Run: `rtk npm run test -w @dbml-canvas/renderer && rtk npm run typecheck -w @dbml-canvas/renderer`

Expected: all renderer tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit column interaction**

```bash
rtk git add packages/renderer/src/TableNode.tsx packages/renderer/src/styles.css packages/renderer/test/table-node-layout.test.mjs
rtk git commit -m "feat(renderer): focus FK paths from columns"
```

---

### Task 4: Render balanced focused and dimmed FK edges

**Files:**
- Modify: `packages/renderer/src/FkEdge.tsx`
- Modify: `packages/renderer/src/styles.css`
- Modify: `packages/renderer/test/fk-edge.test.mjs`

**Interfaces:**
- Consumes: `FkEdgeData.focusState` from Task 2 and the existing `resolveFkRoute` result.
- Produces: `getFkEdgeVisualProps(focusState, baseStyle?)` for deterministic primary, halo, label, and label-background presentation.

- [ ] **Step 1: Write failing visual-props and CSS tests**

Test the helper independently from smart pathfinding:

```js
const focused = getFkEdgeVisualProps('focused', { strokeWidth: 1.5 });
assert.deepEqual(focused.primaryStyle, {
  strokeWidth: 3,
  stroke: 'var(--dbml-accent)',
  opacity: 1,
});
assert.deepEqual(focused.haloStyle, {
  strokeWidth: 9,
  stroke: 'var(--dbml-accent)',
  opacity: 0.14,
});
assert.equal(focused.labelStyle.fill, 'var(--dbml-accent)');

const dimmed = getFkEdgeVisualProps('dimmed', { strokeWidth: 1.5 });
assert.equal(dimmed.primaryStyle.opacity, 0.16);
assert.equal(dimmed.haloStyle, undefined);

const idle = getFkEdgeVisualProps('idle', { strokeWidth: 1.5 });
assert.deepEqual(idle.primaryStyle, { strokeWidth: 1.5 });
```

Read `styles.css` and assert a 140ms transition class exists for FK paths and labels.

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `rtk npm run test -w @dbml-canvas/renderer`

Expected: FAIL because `getFkEdgeVisualProps` is not exported.

- [ ] **Step 3: Implement route-independent edge presentation**

Keep `resolveFkRoute` unchanged. Add a pure helper returning primary, optional halo, label, and label-background styles. Merge caller styles only for idle presentation; focused and dimmed states must override stroke width/opacity while preserving unrelated properties such as dash arrays.

In `FkEdge`, render a label-free halo `BaseEdge` before the primary edge only when focused. Give the halo an inert interaction width and `aria-hidden` treatment supported by `BaseEdge`; keep the primary edge ID and interaction width so React Flow selection remains functional. Apply focus classes and the helper's label styles to the primary edge. Use existing label content and route coordinates.

Add 140ms transitions for stroke, stroke width, opacity, fill, and label background. Do not animate path geometry.

- [ ] **Step 4: Run renderer tests and typecheck**

Run: `rtk npm run test -w @dbml-canvas/renderer && rtk npm run typecheck -w @dbml-canvas/renderer`

Expected: all renderer tests pass, including all obstacle/fallback tests, and TypeScript exits 0.

- [ ] **Step 5: Commit edge presentation**

```bash
rtk git add packages/renderer/src/FkEdge.tsx packages/renderer/src/styles.css packages/renderer/test/fk-edge.test.mjs
rtk git commit -m "feat(renderer): highlight focused FK edges"
```

---

### Task 5: Connect the focus lifecycle in the shared canvas

**Files:**
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `packages/renderer/test/color-mode.test.mjs`
- Modify: `packages/renderer/test/fk-focus.test.mjs`

**Interfaces:**
- Consumes: Task 1 focus helpers, Task 2 graph parameters, and React Flow edge/pane handlers.
- Produces:
  - `transitionFkFocus(schema, focus, event): FkFocus | undefined`
  - shared canvas wiring for column, edge, pane, Escape, and schema events.

- [ ] **Step 1: Write failing lifecycle reducer and initial-state tests**

Define reducer events in `fk-focus.ts` so interaction semantics are testable without a DOM:

```ts
type FkFocusEvent =
  | { type: 'column'; columnId: string }
  | { type: 'edge'; relationshipId: string }
  | { type: 'clear' }
  | { type: 'schema' };
```

Add tests:

```js
let focus = transitionFkFocus(schema, undefined, {
  type: 'column', columnId: 'public.orders.owner_id',
});
assert.deepEqual(focus.relationshipIds, ['orders-owner', 'orders-approver']);

focus = transitionFkFocus(schema, focus, {
  type: 'edge', relationshipId: 'orders-owner',
});
assert.deepEqual(focus.relationshipIds, ['orders-owner']);

assert.equal(transitionFkFocus(schema, focus, { type: 'clear' }), undefined);
assert.equal(transitionFkFocus(schemaWithoutOwner, focus, { type: 'schema' }), undefined);
```

Extend `createInitialFlowState` assertions so initial edges have `focusState: 'idle'` and initial nodes have no transient active column.

- [ ] **Step 2: Run renderer tests to verify RED**

Run: `rtk npm run test -w @dbml-canvas/renderer`

Expected: FAIL because the lifecycle reducer and canvas-derived metadata are not connected.

- [ ] **Step 3: Implement the reducer and canvas state**

Add `transitionFkFocus` to `fk-focus.ts`; delegate column, edge, clear, and schema events to the already-tested helpers.

In `ErdCanvasInner`:

```ts
const [fkFocus, setFkFocus] = useState<FkFocus>();
const fkPresentation = useMemo(
  () => deriveFkFocusPresentation(schema, fkFocus),
  [fkFocus, schema],
);
```

Create stable callbacks for column focus, edge click, pane click, and wrapper Escape. Column/edge handlers call `transitionFkFocus`; pane click and an Escape that reaches the wrapper dispatch `clear`. Add a schema effect that dispatches `schema` reconciliation.

Pass `fkPresentation` and the column callback to every `createFlowNodes` call. Pass `fkPresentation` to every `createFlowEdges` call. Add `onEdgeClick` and `onPaneClick` to React Flow and `onKeyDown` to the existing `.dbml-canvas` wrapper. Do not add `tabIndex` to the canvas wrapper; Escape arrives by bubbling from the currently focused React Flow or column element.

Keep focus unchanged in drag-start and drag-stop callbacks. Preserve React Flow's generic selected IDs exactly as the current node/edge refresh effects do.

- [ ] **Step 4: Run renderer tests and typecheck**

Run: `rtk npm run test -w @dbml-canvas/renderer && rtk npm run typecheck -w @dbml-canvas/renderer`

Expected: all renderer tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit shared canvas integration**

```bash
rtk git add packages/renderer/src/ErdCanvas.tsx packages/renderer/src/fk-focus.ts packages/renderer/test/color-mode.test.mjs packages/renderer/test/fk-focus.test.mjs
rtk git commit -m "feat(renderer): connect FK focus lifecycle"
```

---

### Task 6: Cross-host regression and distribution verification

**Files:**
- Modify only if a verification command exposes a concrete regression.

**Interfaces:**
- Consumes: the completed shared renderer feature.
- Produces: fresh evidence that web, VS Code, and IntelliJ package the same focus behavior.

- [ ] **Step 1: Run all repository tests**

Run: `rtk npm test`

Expected: legal, core, renderer, web sandbox, host webview, and VS Code suites all pass with zero failures.

- [ ] **Step 2: Run production web and VS Code builds**

Run: `rtk npm run build && rtk npm run build:vscode`

Expected: TypeScript, Vite, and the VS Code host bundle exit 0. Existing Vite chunk-size warnings are non-fatal.

- [ ] **Step 3: Build the IntelliJ plugin with JDK 21**

From `apps/intellij-plugin`, run:

```bash
rtk /bin/zsh -lc 'JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew build --no-daemon'
```

Expected: `BUILD SUCCESSFUL`; `copyWebview` packages the rebuilt shared host webview.

- [ ] **Step 4: Inspect final repository state**

Run: `rtk git diff --check && rtk git status --short && rtk git log --oneline main..HEAD`

Expected: no whitespace errors, no generated build artifacts staged, and only intentional commits on the feature branch.

- [ ] **Step 5: Request a read-only code review**

Review the range from the design commit to `HEAD` against `docs/superpowers/specs/2026-08-10-fk-focus-highlighting-design.md`. Fix every Critical or Important finding with a failing regression test first, then repeat Steps 1–4.

