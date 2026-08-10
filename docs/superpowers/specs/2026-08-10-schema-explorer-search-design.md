# Schema Explorer Search Design

## Summary

Dense DBML diagrams make it difficult to locate a table or column by scanning
the canvas. Add a schema explorer to the shared renderer. A magnifying-glass
control opens a floating right-side drawer that lists every table, supports
ascending or descending name sorting, expands tables to show their columns,
and filters both levels with case-insensitive substring matching.

Selecting a result moves the canvas to its table and leaves a clear search
highlight on the chosen table or column. The highlight remains until another
result is selected or the drawer closes. Because the feature is implemented in
`@dbml-canvas/renderer`, the browser sandbox, VS Code extension, and IntelliJ
plugin receive the same behavior without host-specific implementations.

## Goals

- Make tables and columns discoverable without manually scanning a diagram.
- Provide SQL `LIKE '%query%'`-style matching anywhere in a name.
- Keep the complete schema browsable before a query is entered.
- Move and zoom the canvas to a selected search result.
- Distinguish search selection from existing FK focus while allowing both to
  remain visible.
- Preserve a usable overlay in both light and dark themes and at narrow host
  widths.
- Keep all behavior transient; do not change DBML, layout data, or host
  messages.

## Non-goals

- Fuzzy, tokenized, regular-expression, or schema-qualified search.
- Sorting columns independently from their DBML declaration order.
- Persisting the query, sort direction, expanded tables, or selection between
  sessions.
- Editing, creating, or deleting tables and columns from the explorer.
- Replacing the minimap or React Flow controls.
- Adding separate implementations to the web, VS Code, or IntelliJ hosts.

## Selected approach

Add an independent `SchemaExplorer` to the shared renderer, backed by pure
search-model helpers and a dedicated search-selection state in `ErdCanvas`.

This is preferred over React Flow's generic `selected` flags because search
selection has its own lifecycle, must identify an individual column, and must
coexist with FK focus. It is preferred over host-specific sidebars because all
three products already embed the same renderer and should not drift in search
semantics or styling.

## Interaction design

### Opening and closing

- A magnifying-glass button sits at the upper-right edge of the canvas.
- Activating it opens a floating drawer over the canvas. The drawer is 320px
  wide with 12px top, right, and bottom insets; its width is capped at
  `calc(100% - 64px)` on narrow canvases. The canvas does not resize or
  relayout.
- The search input receives focus when the drawer opens.
- Activating the trigger again, the drawer close button, or Escape closes the
  drawer.
- Closing clears the query and the current search selection/highlight. Sort
  direction and manual expansion state survive close/reopen for the current
  renderer lifetime, but none of these values are persisted across reloads.
- The drawer and trigger use React Flow's `nodrag`, `nopan`, and `nowheel`
  utility classes so pointer and wheel interaction stays inside the explorer.

### Browse mode

- With an empty query, all tables are shown as a vertical list.
- The default order is table name ascending. One control toggles ascending and
  descending order.
- Sorting compares table names case-insensitively and uses stable schema order
  as the deterministic tie-breaker.
- Sorting applies only to tables. Columns always retain DBML declaration order.
- A table row acts as an expansion control. Activating it reveals or hides all
  of that table's columns and also navigates the canvas to the table.

### Search mode

- Leading and trailing whitespace is removed from the query. A whitespace-only
  query behaves like an empty query.
- Names match when their case-insensitive text contains the entire normalized
  query at any position. No wildcard characters need to be entered.
- A table remains in the result list when its table name or at least one of its
  column names matches.
- A table-name match highlights every non-overlapping matching substring in
  the displayed table name.
- When any column in a table matches, that table auto-expands and displays all
  of its columns so the result retains context. Only matching column names are
  marked.
- A table that matches only by table name does not auto-expand.
- Manual expansion still applies to table-only matches. Search-driven
  auto-expansion is derived from the current query and does not overwrite the
  user's manual expansion set.
- If no table or column matches, the drawer shows `검색 결과가 없습니다.` and
  retains the search input and sort control.

### Result navigation and selection

- Activating a table row uses React Flow's viewport API to center and fit that
  table at a readable zoom, then applies a table-level search highlight.
- Activating a column row navigates to the containing table and applies a
  stronger highlight to that specific column row.
- A new table or column selection replaces the previous search selection.
- Search selection remains visible while the drawer stays open, including
  after the query changes, as long as the selected schema entity still exists.
  It is not required to remain in the filtered result set.
- Closing the drawer clears search selection. Opening it again starts without
  a selected result.
- Navigation does not change node positions, call `onLayoutChange`, or write a
  layout sidecar.

## Architecture

### Pure search model

A renderer helper module, `schema-explorer.ts`, owns behavior that does not
require React:

- normalize a raw query;
- perform case-insensitive substring matching and derive markable text ranges;
- sort tables ascending or descending with deterministic tie-breaking;
- derive visible tables and per-table table/column match information; and
- determine which result tables are auto-expanded by column matches.

The helper returns stable table and column IDs alongside display names. UI and
canvas selection therefore never depend on list indexes or rendered text.

### Explorer component

`SchemaExplorer.tsx` owns drawer-local UI state:

- open/closed state;
- raw query text;
- ascending/descending sort direction; and
- manually expanded table IDs.

It receives the current `ErdSchema` and callbacks for table and column result
activation. Matching fragments render with semantic `<mark>` elements while
the accessible name remains understandable as a complete table or column
name.

### Canvas integration

`ErdCanvas` owns the transient result selection because it coordinates
viewport movement and table-node presentation:

```ts
type SchemaSearchSelection =
  | { kind: 'table'; tableId: string }
  | { kind: 'column'; tableId: string; columnId: string };
```

On result activation, `ErdCanvas` resolves the live React Flow node and calls a
viewport helper such as `fitView` with only that node and padding appropriate
for the floating drawer. If a node is not yet measured, navigation waits for or
uses the next available measured node rather than inventing coordinates.

The selection is passed through `createFlowNodes` to `TableNode`. Schema
replacement reconciles it against stable IDs: a removed table clears either
selection kind, and a removed column clears a column selection. Drawer-local
manual expansions are similarly pruned when tables disappear.

### Presentation-state separation

Search presentation and FK focus remain separate inputs:

- FK focus continues to control relationship edges, selected FK columns, and
  related endpoint columns.
- Schema search controls one selected table or one selected column.
- Search selection never clears FK focus, and FK interaction never closes the
  explorer or clears search selection.
- `TableNode` composes both class sets when a searched column also participates
  in the current FK focus.

This avoids overloading the React Flow node selection state or the existing
`FkFocus` model.

## Visual design

The drawer is a compact utility surface rather than a second application
sidebar.

- It floats above the canvas with a theme-aware surface, border, restrained
  shadow, and rounded left corners.
- The header keeps search and sort controls visible while the result list
  scrolls independently through the remaining vertical space.
- Table rows have a disclosure chevron, table icon, name, and column count.
  Column rows are indented and visually quieter.
- Hover, keyboard focus, expanded, and selected states are visually distinct.
- Matching name fragments use `<mark>` with a subtle warm amber tint.
- The canvas search selection uses the same amber family: a table gets a
  visible outline/header accent and a column gets an inset marker plus row
  background.
- Existing FK focus retains its purple/accent treatment. When both states apply
  to one column, the amber search marker and FK tint/weight remain separately
  recognizable.
- Transitions are short and restrained; the feature does not pulse, animate
  continuously, or dim the entire canvas.
- At narrow widths, the drawer width is capped so a usable portion of the
  diagram remains visible.

## Accessibility

- The magnifying-glass trigger is a real button with an accessible label,
  `aria-expanded`, and a relationship to the drawer.
- The drawer has a labelled landmark/dialog-like region without trapping focus;
  users can still return to the canvas.
- Search, sort, close, table, and column interactions use native form controls
  or buttons.
- Enter and Space activate table and column results. Escape closes the drawer
  unless an inner control has a more immediate dismissible state.
- Table buttons expose `aria-expanded` and identify their child column region.
- Sort direction is announced in its accessible label and visible tooltip.
- Match marking is not the only indication that a result exists; filtering and
  expansion provide structural cues.
- Canvas search selection uses both color and shape/weight changes.
- Keyboard focus rings remain visible in light and dark modes.

## Error and edge-case behavior

- Duplicate table or column display names remain independent because stable
  IDs drive expansion and selection.
- Empty table and column names, if present in a malformed model, do not crash
  matching and render using the existing model fallback behavior.
- Case matching uses JavaScript's locale-independent `toLowerCase()` behavior
  for deterministic results across hosts. Match fragments preserve the
  original display string, including Korean and other non-ASCII names.
- A schema update prunes missing expansion and selection IDs and recomputes the
  current result model.
- A selected entity may remain highlighted after it no longer matches an edited
  query, but removal from the schema clears it.
- A table with both a table-name match and column matches is auto-expanded,
  marks both levels, and appears only once.
- Query changes do not reorder columns or mutate manual expansion state.
- Viewport navigation failures are contained: the result stays selected and
  the drawer remains usable even if a live node cannot be resolved.

## Data flow

### Opening and browsing

1. The trigger opens the drawer and focuses the search input.
2. The pure model returns all tables in the selected sort direction.
3. A table activation toggles manual expansion and reports the table ID.
4. `ErdCanvas` stores table selection and centers the corresponding node.

### Searching

1. The user enters a raw query.
2. The helper trims and normalizes it for case-insensitive matching.
3. It retains tables matching by table name or any column name.
4. Column matches derive auto-expansion; manual expansion is unioned for
   rendering.
5. Match ranges render as `<mark>` fragments without altering source names.

### Selecting a column

1. The explorer reports stable table and column IDs.
2. `ErdCanvas` stores a column search selection.
3. It centers the containing table with drawer-aware padding.
4. `TableNode` renders the chosen row's search presentation in combination with
   any existing FK presentation.

### Closing and schema changes

Closing resets query and selection while retaining current-lifetime sort and
manual expansion preferences. Schema changes recompute matches, prune manual
expansion IDs, and validate canvas selection against the replacement schema.
No explorer state is serialized or sent to a host.

## Testing

### Pure helper tests

- Empty and whitespace-only queries return every table.
- Table and column matches are case-insensitive substrings at any position.
- Table-name-only matches stay collapsed unless manually expanded.
- Column matches retain the table, auto-expand it, show all columns, and mark
  only matching columns.
- A table matching at both levels appears once and marks both levels.
- Ascending and descending sorting is deterministic, while column declaration
  order remains unchanged.
- Match fragments cover all non-overlapping occurrences while preserving the
  original Korean or ASCII display text.
- Unknown IDs are pruned from manual expansions and selection reconciliation.

### Component and renderer tests

- The trigger exposes its open state and the input receives focus on open.
- Re-click, close, and Escape dismiss the drawer and clear search selection.
- Table and column buttons expose their expected accessible names and expansion
  relationships.
- Empty results render the agreed empty state.
- Matching fragments use `<mark>` and nonmatching context remains visible.
- Table activation toggles expansion, reports selection, and requests viewport
  navigation.
- Column activation reports both IDs and renders a persistent canvas row
  highlight.
- Search selection survives query edits but is replaced by a new result and
  cleared when the drawer closes or the entity is removed.
- Search and FK presentation classes can appear together without changing edge
  focus or routing.
- Explorer pointer/wheel events do not drag, pan, or zoom the canvas.

### Distribution verification

- Run renderer tests, the complete JavaScript/TypeScript suite, type checking,
  and production builds.
- Rebuild the shared host webview and VS Code extension.
- Build the IntelliJ plugin so its packaged resources include the updated
  shared webview.
- Smoke-test opening, searching, sorting, expansion, selection, navigation, and
  light/dark presentation in at least one browser host and one IDE-packaged
  webview.

## Compatibility

The feature changes only the shared renderer and its bundled presentation. The
core schema model, DBML parser, layout version, host protocol, browser storage,
VS Code host, and IntelliJ host remain unchanged. Existing diagrams require no
migration and open with the explorer closed and no search selection.
