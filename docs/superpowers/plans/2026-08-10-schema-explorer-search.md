# Schema Explorer Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating, searchable schema explorer to the shared renderer that filters and sorts tables, expands matching columns, navigates to results, and persistently highlights the chosen table or column in web, VS Code, and IntelliJ.

**Architecture:** Keep matching, sorting, expansion derivation, and selection reconciliation in a pure `schema-explorer.ts` module. Render the trigger and drawer through a dedicated `SchemaExplorer.tsx` component, while `ErdCanvas` owns the cross-component search selection and viewport navigation. Pass search presentation into table nodes independently from FK focus so both states compose without changing the core schema, layout, or host protocols.

**Tech Stack:** TypeScript 5.8, React 19, `@xyflow/react` 12, Node's built-in test runner, `react-dom/server`, CSS custom properties, npm workspaces, Gradle/JDK 21 for the IntelliJ package.

## Global Constraints

- Implement the feature only in `@dbml-canvas/renderer`; web, VS Code, and IntelliJ consume the same bundled renderer.
- Use case-insensitive JavaScript `toLowerCase()` substring matching equivalent to SQL `LIKE '%query%'`; trim leading and trailing query whitespace.
- Default table order is ascending; the toggle switches between ascending and descending. Columns always remain in DBML declaration order.
- A column match keeps its table, auto-expands that table, displays all of its columns, and marks only matching column names.
- A table-name-only match stays collapsed unless the user manually expands it.
- The drawer floats over the canvas at 320px with 12px top/right/bottom insets and caps its width at `calc(100% - 64px)`.
- Closing clears the query and search selection but retains sort direction and manual expansions for the current renderer lifetime only.
- The selected table or column stays highlighted until another result is chosen, the drawer closes, or the schema removes the entity.
- Search presentation uses amber and remains independent from the existing purple FK focus presentation.
- Search navigation must not change node positions, call `onLayoutChange`, modify DBML, serialize explorer state, or change host messages.
- Use the exact empty-state copy `검색 결과가 없습니다.`.
- Do not add runtime or test dependencies.
- Prefix every repository command with `rtk` per the project instructions.

---

### Task 1: Pure schema search and selection model

**Files:**
- Create: `packages/renderer/src/schema-explorer.ts`
- Create: `packages/renderer/test/schema-explorer.test.mjs`
- Modify: `packages/renderer/src/index.ts`

**Interfaces:**
- Consumes: `ErdSchema`, `ErdTable`, and `ErdColumn` from `@dbml-canvas/core`.
- Produces: `SchemaSortDirection`, `TextMatchRange`, `SchemaExplorerColumnResult`, `SchemaExplorerTableResult`, `SchemaSearchSelection`, `normalizeSchemaQuery()`, `findTextMatchRanges()`, `buildSchemaExplorerResults()`, `reconcileExpandedTableIds()`, and `reconcileSchemaSearchSelection()`.

- [ ] **Step 1: Write failing tests for normalization, matching, sorting, and expansion derivation**

Create `packages/renderer/test/schema-explorer.test.mjs` with a schema whose original declaration order is `Teams`, `accounts`, `AuditLog`; give `accounts` the ordered columns `id`, `DisplayName`, `owner_id`, and give `Teams` the columns `id`, `account_id`. Assert all of these behaviors explicitly:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSchemaExplorerResults,
  findTextMatchRanges,
  normalizeSchemaQuery,
  reconcileExpandedTableIds,
  reconcileSchemaSearchSelection,
} from '../dist/schema-explorer.js';

test('normalizes whitespace and matches every case-insensitive substring', () => {
  assert.equal(normalizeSchemaQuery('  NAME  '), 'name');
  assert.deepEqual(findTextMatchRanges('DisplayNameName', 'name'), [
    { start: 7, end: 11 },
    { start: 11, end: 15 },
  ]);
  assert.deepEqual(findTextMatchRanges('고객이름', '이름'), [{ start: 2, end: 4 }]);
});

test('returns all tables sorted ascending or descending for an empty query', () => {
  assert.deepEqual(
    buildSchemaExplorerResults(schema, '   ', 'asc').map(({ table }) => table.id),
    ['public.accounts', 'public.AuditLog', 'public.Teams'],
  );
  assert.deepEqual(
    buildSchemaExplorerResults(schema, '', 'desc').map(({ table }) => table.id),
    ['public.Teams', 'public.AuditLog', 'public.accounts'],
  );
});

test('keeps table matches collapsed and auto-expands column matches with all columns', () => {
  const tableOnly = buildSchemaExplorerResults(schema, 'team', 'asc');
  assert.equal(tableOnly[0].autoExpanded, false);
  assert.deepEqual(tableOnly[0].tableMatchRanges, [{ start: 0, end: 4 }]);

  const columnMatch = buildSchemaExplorerResults(schema, 'owner', 'asc');
  assert.equal(columnMatch[0].table.id, 'public.accounts');
  assert.equal(columnMatch[0].autoExpanded, true);
  assert.deepEqual(columnMatch[0].columns.map(({ column }) => column.name), [
    'id', 'DisplayName', 'owner_id',
  ]);
  assert.deepEqual(columnMatch[0].matchingColumnIds, ['public.accounts.owner_id']);
});
```

Add separate assertions that a table matching at both table and column levels appears once, unmatched tables are absent, duplicate display names retain schema-order tie-breaking, missing table IDs are pruned from an expansion set, and table/column selections clear only when their referenced entity disappears.

- [ ] **Step 2: Run the renderer test command and verify the new test fails**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `dist/schema-explorer.js` does not exist or the named exports are missing.

- [ ] **Step 3: Implement the pure search model**

Create `packages/renderer/src/schema-explorer.ts` with these exact public types and signatures:

```ts
import type { ErdColumn, ErdSchema, ErdTable } from '@dbml-canvas/core';

export type SchemaSortDirection = 'asc' | 'desc';
export interface TextMatchRange { start: number; end: number }
export interface SchemaExplorerColumnResult {
  column: ErdColumn;
  matchRanges: TextMatchRange[];
}
export interface SchemaExplorerTableResult {
  table: ErdTable;
  tableMatchRanges: TextMatchRange[];
  columns: SchemaExplorerColumnResult[];
  matchingColumnIds: string[];
  autoExpanded: boolean;
}
export type SchemaSearchSelection =
  | { kind: 'table'; tableId: string }
  | { kind: 'column'; tableId: string; columnId: string };

export function normalizeSchemaQuery(query: string): string;
export function findTextMatchRanges(value: string, normalizedQuery: string): TextMatchRange[];
export function buildSchemaExplorerResults(
  schema: ErdSchema,
  query: string,
  direction: SchemaSortDirection,
): SchemaExplorerTableResult[];
export function reconcileExpandedTableIds(
  schema: ErdSchema,
  expandedTableIds: ReadonlySet<string>,
): Set<string>;
export function reconcileSchemaSearchSelection(
  schema: ErdSchema,
  selection: SchemaSearchSelection | undefined,
): SchemaSearchSelection | undefined;
```

Implement `findTextMatchRanges()` by searching the lowercased display string
from the previous match's `end`, returning non-overlapping original-string
slices. Implement sorting with a decorated schema index and direct `<`/`>`
comparison of lowercased table display names; use the schema index when the
comparison is zero. This keeps ordering independent from host locale. Build
every retained table result with every original column in declaration order,
marking match ranges only on matching columns.

Export the module from `packages/renderer/src/index.ts`:

```ts
export * from './schema-explorer.js';
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS, including the new normalization, sorting, column-context, and reconciliation cases.

- [ ] **Step 5: Commit the pure model**

```bash
rtk git add packages/renderer/src/schema-explorer.ts packages/renderer/src/index.ts packages/renderer/test/schema-explorer.test.mjs
rtk git commit -m "feat(renderer): add schema explorer search model"
```

---

### Task 2: Accessible explorer trigger and floating drawer

**Files:**
- Create: `packages/renderer/src/SchemaExplorer.tsx`
- Create: `packages/renderer/test/schema-explorer-component.test.mjs`
- Modify: `packages/renderer/src/index.ts`

**Interfaces:**
- Consumes: `buildSchemaExplorerResults()`, `reconcileExpandedTableIds()`, `SchemaSearchSelection`, and `SchemaSortDirection` from Task 1.
- Produces: `SchemaExplorer`, `SchemaExplorerPanel`, `SchemaExplorerProps`, and `SchemaExplorerPanelProps` for `ErdCanvas` and server-rendered component tests.

- [ ] **Step 1: Write failing server-rendered markup tests**

Create `packages/renderer/test/schema-explorer-component.test.mjs`. Render `SchemaExplorerPanel` with `renderToStaticMarkup()` using query `name`, ascending order, an expanded `accounts` table, and a selected `DisplayName` column. Assert the concrete contract:

```js
assert.match(markup, /id="dbml-schema-explorer"/);
assert.match(markup, /aria-label="Search tables and columns"/);
assert.match(markup, /value="name"/);
assert.match(markup, /aria-label="Sort tables descending"/);
assert.match(markup, /aria-expanded="true"/);
assert.match(markup, /<mark>name<\/mark>/i);
assert.match(markup, /aria-current="true"/);
assert.match(markup, /Display<mark>Name<\/mark>/);
```

Render a no-result model and assert `검색 결과가 없습니다.`. Render a column-match result with only one matching column and assert the other columns are still present in declaration order. Render the `SchemaExplorer` wrapper in its closed initial state and assert its trigger has `aria-controls="dbml-schema-explorer"` and `aria-expanded="false"`.

- [ ] **Step 2: Run the renderer tests and verify the component test fails**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `dist/SchemaExplorer.js` does not exist.

- [ ] **Step 3: Implement the stateless panel and stateful wrapper**

Create `packages/renderer/src/SchemaExplorer.tsx` with these public props:

```ts
export interface SchemaExplorerProps {
  schema: ErdSchema;
  selection?: SchemaSearchSelection;
  onSelectTable: (tableId: string) => void;
  onSelectColumn: (tableId: string, columnId: string) => void;
  onClose: () => void;
}

export interface SchemaExplorerPanelProps extends SchemaExplorerProps {
  query: string;
  sortDirection: SchemaSortDirection;
  expandedTableIds: ReadonlySet<string>;
  searchInputRef?: Ref<HTMLInputElement>;
  onQueryChange: (query: string) => void;
  onToggleSort: () => void;
  onToggleTable: (tableId: string) => void;
}
```

`SchemaExplorer` must own `open`, `query`, `sortDirection`, and
`expandedTableIds`. It creates the input ref, passes it as `searchInputRef`, and
focuses it in an effect after `open` becomes true. Closing sets `open` false,
clears only `query`, calls `onClose()`, and leaves sort/expansion state intact.
A schema effect replaces expansions with
`reconcileExpandedTableIds(schema, current)`.

Render the trigger as a native button with a small inline magnifying-glass SVG,
a dynamic `aria-label` (`Open schema explorer` or `Close schema explorer`),
`aria-expanded`, and `aria-controls="dbml-schema-explorer"`. Clicking it while
open must run the same close path as the drawer close button. When open, render
`SchemaExplorerPanel` inside a `section` with
`id="dbml-schema-explorer"`, `aria-label="Schema explorer"`, and classes
`dbml-schema-explorer nodrag nopan nowheel`.

In `SchemaExplorerPanel`:

- render a controlled search input labelled `Search tables and columns`;
- render a sort button whose accessible label and `title` name the action
  (`Sort tables descending` when currently ascending and vice versa);
- render a close button labelled `Close schema explorer`;
- build results from the pure helper;
- union `expandedTableIds` with each result's `autoExpanded` for display;
- render every table and column action as a native button, with a disclosure
  chevron and a small decorative table icon on table rows;
- set `aria-expanded` and `aria-controls` on table buttons;
- call both `onToggleTable(table.id)` and `onSelectTable(table.id)` on table activation;
- apply `aria-current="true"` to the selected table or column action;
- render match fragments by slicing the original string and wrapping ranges in `<mark>`; and
- close on an unprevented Escape from the panel.

Do not place the table action inside another button: use a row container with one table button and a separate count. Export both components and add:

```ts
export * from './SchemaExplorer.js';
```

to `packages/renderer/src/index.ts`.

- [ ] **Step 4: Run renderer tests and type checking**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
rtk npm run typecheck -w @dbml-canvas/renderer
```

Expected: all tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the explorer component**

```bash
rtk git add packages/renderer/src/SchemaExplorer.tsx packages/renderer/src/index.ts packages/renderer/test/schema-explorer-component.test.mjs
rtk git commit -m "feat(renderer): add schema explorer drawer"
```

---

### Task 3: Canvas navigation and independent table/column highlights

**Files:**
- Create: `packages/renderer/src/schema-navigation.ts`
- Create: `packages/renderer/test/schema-navigation.test.mjs`
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `packages/renderer/src/graph.ts`
- Modify: `packages/renderer/src/TableNode.tsx`
- Modify: `packages/renderer/src/index.ts`
- Modify: `packages/renderer/test/color-mode.test.mjs`
- Modify: `packages/renderer/test/table-node-layout.test.mjs`

**Interfaces:**
- Consumes: `SchemaExplorer`, `SchemaSearchSelection`, and `reconcileSchemaSearchSelection()` from Tasks 1-2; React Flow `fitView()`, `getViewport()`, and `setViewport()`.
- Produces: `navigateToSchemaTable()`, `SchemaNavigationApi`, search fields on `TableNodeData`, and an `ErdCanvas` integration that clears selection on drawer close while preserving FK focus.

- [ ] **Step 1: Write failing tests for viewport navigation and search presentation**

Create `packages/renderer/test/schema-navigation.test.mjs` with injected async spies:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { navigateToSchemaTable } from '../dist/schema-navigation.js';

test('fits one table then shifts it left by half the visible drawer width', async () => {
  const calls = [];
  const api = {
    fitView: async (options) => { calls.push(['fitView', options]); return true; },
    getViewport: () => ({ x: 40, y: 20, zoom: 1.1 }),
    setViewport: async (viewport, options) => {
      calls.push(['setViewport', viewport, options]);
      return true;
    },
  };
  await navigateToSchemaTable('public.accounts', 320, api);
  assert.deepEqual(calls[0][1].nodes, [{ id: 'public.accounts' }]);
  assert.deepEqual(calls[1][1], { x: -120, y: 20, zoom: 1.1 });
});
```

Extend `color-mode.test.mjs` so server-rendering `ErdCanvas` asserts the closed explorer trigger exists. Extend `table-node-layout.test.mjs` with a table-level search selection and a column-level search selection; assert `is-search-selected` appears on the table and chosen row, and assert an FK-active searched column contains both `is-fk-active` and `is-search-selected` in the same class attribute.

- [ ] **Step 2: Run the renderer tests and verify the new assertions fail**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because navigation and search presentation do not exist.

- [ ] **Step 3: Implement the injected navigation helper**

Create `packages/renderer/src/schema-navigation.ts`:

```ts
import type { Viewport } from '@xyflow/react';

export interface SchemaNavigationApi {
  fitView: (options: {
    nodes: { id: string }[];
    padding: number;
    maxZoom: number;
    duration: number;
  }) => Promise<boolean>;
  getViewport: () => Viewport;
  setViewport: (
    viewport: Viewport,
    options: { duration: number },
  ) => Promise<boolean>;
}

export async function navigateToSchemaTable(
  tableId: string,
  drawerWidth: number,
  api: SchemaNavigationApi,
): Promise<void> {
  const fitted = await api.fitView({
    nodes: [{ id: tableId }],
    padding: 0.35,
    maxZoom: 1.15,
    duration: 180,
  });
  if (!fitted) return;
  const viewport = api.getViewport();
  await api.setViewport(
    { ...viewport, x: viewport.x - drawerWidth / 2 },
    { duration: 120 },
  );
}
```

Export it from `packages/renderer/src/index.ts`. The false-return test must assert `setViewport` is not called.

- [ ] **Step 4: Carry search selection through graph data without replacing FK state**

Add these fields to `TableNodeData` in `graph.ts`:

```ts
searchSelectedTable?: boolean;
searchSelectedColumnId?: string;
```

Add an optional final `searchSelection?: SchemaSearchSelection` parameter to `createFlowNodes()`. Set `searchSelectedTable` when the selection is a table selection for that node, and set `searchSelectedColumnId` when it is a column selection for that node. Add:

```ts
export function applySchemaSearchSelectionToNodes(
  nodes: TableFlowNode[],
  selection: SchemaSearchSelection | undefined,
): TableFlowNode[];
```

This mapper must remove only the two search fields before reapplying the current selection, preserving `activeFkColumnId`, `relatedFkColumnIds`, callbacks, layout data, and React Flow's `selected` flag.

In `TableNode.tsx`, add `is-search-selected` to the article for table selection and to exactly one column row for column selection. Build row classes as an array or joined string so FK-active/FK-related and search-selected classes can coexist.

- [ ] **Step 5: Integrate the explorer, selection reconciliation, and navigation into `ErdCanvas`**

In `ErdCanvasInner`:

- destructure `fitView` alongside `getViewport` and `setViewport`;
- add `const [searchSelection, setSearchSelection] = useState<SchemaSearchSelection>();`;
- reconcile it in the existing schema-change effect with `reconcileSchemaSearchSelection(schema, current)`;
- pass it to every `createFlowNodes()` call;
- add an effect using `applySchemaSearchSelectionToNodes()` when only selection changes;
- render `<SchemaExplorer>` as a child of `<ReactFlow>` after `<Background>`;
- on table selection, set `{ kind: 'table', tableId }` and navigate;
- on column selection, set `{ kind: 'column', tableId, columnId }` and navigate to the containing table;
- on explorer close, set search selection to `undefined`; and
- compute the drawer width as `Math.max(0, Math.min(320, (canvasRef.current?.clientWidth ?? 384) - 64))` before navigation.

Prevent programmatic result navigation from persisting a layout viewport: use a `searchNavigationRef` counter. Increment before awaiting `navigateToSchemaTable()`, decrement in `finally`, and make `handleMoveEnd` return without calling `emitLayout()` while the counter is nonzero. Do not clear `fkFocus` in any explorer callback.

- [ ] **Step 6: Run the focused renderer tests and type checking**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
rtk npm run typecheck -w @dbml-canvas/renderer
```

Expected: all navigation, markup, graph, FK regression, and existing renderer tests PASS with no type errors.

- [ ] **Step 7: Commit canvas integration**

```bash
rtk git add packages/renderer/src/schema-navigation.ts packages/renderer/src/ErdCanvas.tsx packages/renderer/src/graph.ts packages/renderer/src/TableNode.tsx packages/renderer/src/index.ts packages/renderer/test/schema-navigation.test.mjs packages/renderer/test/color-mode.test.mjs packages/renderer/test/table-node-layout.test.mjs
rtk git commit -m "feat(renderer): navigate and highlight schema results"
```

---

### Task 4: Theme-aware visual design, regression verification, and packaged hosts

**Files:**
- Modify: `packages/renderer/src/styles.css`
- Modify: `packages/renderer/test/schema-explorer-component.test.mjs`
- Modify: `packages/renderer/test/table-node-layout.test.mjs`
- Verify generated output only: `apps/host-webview/dist/`, `apps/vscode-extension/dist/`, `apps/intellij-plugin/build/distributions/`

**Interfaces:**
- Consumes: stable class names from Tasks 2-3: `dbml-schema-explorer-trigger`, `dbml-schema-explorer`, `dbml-schema-explorer-*`, and `is-search-selected`.
- Produces: the final floating drawer, match, focus, table, and column presentation shared by every host.

- [ ] **Step 1: Add failing CSS contract assertions**

Extend the component and table-node tests by reading `src/styles.css` and asserting these concrete contracts:

```js
assert.match(css, /--dbml-search:\s*#[0-9a-f]{6}/i);
assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*position:\s*absolute/s);
assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*width:\s*min\(320px, calc\(100% - 64px\)\)/s);
assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*top:\s*12px/s);
assert.match(css, /\.dbml-schema-explorer-results\s*\{[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.dbml-schema-explorer mark\s*\{[^}]*background:/s);
assert.match(css, /\.dbml-table-node\.is-search-selected\s*\{[^}]*outline:/s);
assert.match(css, /\.dbml-column-row\.is-search-selected\s*\{[^}]*box-shadow:/s);
```

Also assert a visible `:focus-visible` rule covers the trigger and explorer buttons, and that the panel uses the `nodrag nopan nowheel` classes in markup.

- [ ] **Step 2: Run renderer tests and verify CSS assertions fail**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL on the missing search variables and explorer/search-selection rules.

- [ ] **Step 3: Implement the final visual system in `styles.css`**

Add light/dark custom properties with distinct amber values:

```css
:root {
  --dbml-search: #c87912;
  --dbml-search-soft: #fff1cf;
  --dbml-search-border: #e0a13d;
}

[data-theme='dark'] {
  --dbml-search: #f0ad4e;
  --dbml-search-soft: #49351a;
  --dbml-search-border: #b97922;
}
```

Make `.dbml-canvas` `position: relative`. Place the trigger at `top: 12px; right: 12px` above React Flow chrome. Place the panel at `top: 12px; right: 12px; bottom: 12px; width: min(320px, calc(100% - 64px)); z-index: 20`; use a grid with fixed header/search controls and `minmax(0, 1fr)` results, theme surface/border, rounded left corners, and restrained shadow.

Style table rows as strong single-line actions with disclosure rotation, name, and count. Indent columns, keep their names truncatable, and give hover, `aria-current`, and `:focus-visible` distinct states. Style `<mark>` with `--dbml-search-soft` and `--dbml-search` while inheriting font weight.

For canvas selection, give `.dbml-table-node.is-search-selected` a 2px amber outline and a header inset accent that remains visible over custom table colors. Give `.dbml-column-row.is-search-selected` an amber-tinted background and `inset 3px 0 var(--dbml-search)`. Put the search rule after FK row rules so the amber marker remains visible, but retain FK text/weight cues when both classes exist. Use 140ms transitions and no continuous animation.

- [ ] **Step 4: Run renderer tests, full tests, type checking, and production builds**

Run each command separately and require exit code 0:

```bash
rtk npm run test -w @dbml-canvas/renderer
rtk npm test
rtk npm run typecheck
rtk npm run build
```

Expected: all test suites PASS; TypeScript has no errors; core, renderer, browser sandbox, shared webview, and VS Code production bundles build successfully. Existing large-chunk warnings may remain warnings only.

- [ ] **Step 5: Build the IntelliJ plugin with JDK 21**

Run:

```bash
rtk /bin/zsh -lc 'JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew build --no-daemon'
```

from `apps/intellij-plugin`.

Expected: Gradle `BUILD SUCCESSFUL`; `build/distributions/dbml-canvas-intellij-0.1.5.zip` exists and contains the rebuilt shared webview. This feature does not bump the plugin version because `0.1.5` was already reserved for the current feature set on `main`.

- [ ] **Step 6: Perform visual smoke testing**

Run the browser sandbox:

```bash
rtk npm run dev -w @dbml-canvas/web-sandbox -- --host 127.0.0.1
```

At light and dark color modes, verify all of the following against a schema containing mixed-case table/column names and enough tables to scroll:

1. The trigger opens a 320px floating drawer and focuses search.
2. Empty search lists every table; sort toggles A-Z/Z-A without reordering columns.
3. A table-only match is marked but stays collapsed.
4. A column match auto-expands its table, shows all columns, and marks only matches.
5. Table and column selections navigate left of the drawer and persist.
6. A searched FK column shows both search and FK cues.
7. Close and Escape clear query/search highlight; reopen retains sort/manual expansion.
8. Keyboard focus, empty state, scrolling, and narrow-canvas width remain usable.

Stop the dev server after the check. Do not commit generated `dist/`, Gradle build output, or screenshots unless they are already tracked and intentionally changed.

- [ ] **Step 7: Commit visual implementation and test contracts**

```bash
rtk git add packages/renderer/src/styles.css packages/renderer/test/schema-explorer-component.test.mjs packages/renderer/test/table-node-layout.test.mjs
rtk git commit -m "feat(renderer): style schema explorer search"
```

- [ ] **Step 8: Run final clean-tree verification**

Run:

```bash
rtk git diff --check HEAD~4..HEAD
rtk git status --short
```

Expected: no whitespace errors and no tracked or untracked implementation artifacts in the feature worktree.
