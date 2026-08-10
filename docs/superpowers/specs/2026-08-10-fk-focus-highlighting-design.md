# FK Focus Highlighting Design

## Summary

DBML Canvas diagrams can contain enough relationships that a user cannot easily
follow one foreign-key path through the canvas. Add a transient focus mode to
the shared renderer. Clicking a column highlights every relationship that uses
that column; clicking an FK edge highlights only that relationship. Related
endpoint columns remain visible as anchors while unrelated edges recede.

The selected visual direction is **balanced focus**: focused paths use the
theme accent with a modest halo, unrelated paths remain present at 16% opacity,
and involved columns receive a quiet accent tint. The behavior ships through
the same renderer to the browser sandbox, VS Code, and IntelliJ.

## Goals

- Make one FK or every FK connected to a column easy to trace.
- Preserve enough surrounding context that users do not lose their place.
- Give column clicks and edge clicks one consistent focus lifecycle.
- Support keyboard activation and dismissal without disrupting Note editing.
- Keep FK focus transient; do not change DBML or the layout sidecar.
- Preserve adaptive endpoint selection, obstacle routing, and route fallback.

## Non-goals

- Persisting relationship selections between sessions.
- Selecting entire relationship neighborhoods recursively through other tables.
- Adding relationship editing, deletion, or manual route controls.
- Assigning a unique permanent color to every FK.
- Highlighting all relationships belonging to an entire table.
- Changing the parser, host bridge, or layout schema.

## Selected approach

`ErdCanvas` owns one explicit FK focus state. This is preferred over relying on
React Flow's generic `selected` flags because a single column may focus several
edges and several endpoint columns at once. It is preferred over CSS-only DOM
selection because schema relationship membership belongs in testable renderer
data rather than selectors tied to markup structure.

The focus state distinguishes intent while retaining a common set of focused
relationships:

```ts
type FkFocus =
  | { kind: 'column'; columnId: string; relationshipIds: string[] }
  | { kind: 'edge'; relationshipId: string; relationshipIds: [string] };
```

Only one focus exists at a time. A new column or edge replaces it. Clicking the
empty canvas or pressing Escape clears it.

## Architecture

### Relationship focus helpers

A pure renderer helper derives focus information from `ErdSchema`:

- find every relationship whose source or target `columnIds` contains a chosen
  column ID;
- return stable relationship IDs in schema order;
- derive the set of all source and target column IDs belonging to the focused
  relationships; and
- prune a focus when schema changes remove its originating column or all of its
  relationships.

A composite FK is considered connected to each member column on both ends.
Clicking any member focuses that relationship. If the chosen column has no FK,
the current focus is cleared rather than leaving a stale highlight visible.

### Canvas state and events

`ErdCanvas` stores `FkFocus | undefined` alongside the existing routing mode.
It supplies a column-focus callback and focus-derived column state through
`createFlowNodes`. It supplies edge presentation state through
`createFlowEdges`.

Event behavior is explicit:

1. A column click or keyboard activation stops the node click from becoming a
   competing table selection, then focuses every relationship connected to the
   column.
2. An FK edge click focuses only that edge.
3. Clicking the empty React Flow pane clears FK focus.
4. Escape clears FK focus when a column Note editor or other local editor has
   not consumed the key.
5. Schema replacement prunes invalid focus before presentation is derived.
6. Node dragging changes routing mode as it does today without clearing focus.

Focus changes never call `onLayoutChange` and never enter host messages.

### Node presentation

Each `TableFlowNode` receives the minimum transient presentation data needed by
`TableNode`:

- the actively chosen column ID, when focus originated from a column;
- the set of endpoint column IDs belonging to focused relationships; and
- a callback that requests column focus.

`TableNode` marks a chosen column separately from a related endpoint column.
The existing detail hover/focus behavior remains intact. A focused column row
supports mouse click and Enter/Space activation. Escape continues to close
local settings, details, or editing UI first; only an unconsumed Escape reaches
the canvas focus handler.

### Edge presentation

`FkEdgeData` gains a presentation state independent from routing mode:

```ts
type FkFocusState = 'idle' | 'focused' | 'dimmed';
```

With no active focus every edge is `idle`. With active focus, matching edge IDs
are `focused` and every other edge is `dimmed`. `FkEdge` continues to resolve
the same smart or adaptive path before applying focus styling. A route failure
therefore still falls back locally and remains highlightable.

## Visual design

The balanced-focus style uses existing theme variables and works in light and
dark color modes.

- A focused edge uses the accent color at 3px and renders a low-opacity wider
  underlay as a halo.
- A dimmed edge keeps its geometry and hit area but renders at 16% opacity.
- Idle edges preserve current relationship styling.
- The selected column receives the strongest row tint and a 3px inset accent
  marker.
- Other endpoint columns of focused relationships receive a lighter tint.
- Focused edge labels use stronger text contrast and a clearer surface fill.
- Stroke, opacity, label, and row-state changes transition in about 140ms.
- The invisible interaction width remains wider than the visible stroke so
  narrow FK lines stay easy to click.

The design does not use animated pulses, neon glow, or per-FK colors. These
would add distraction in dense diagrams and reduce long-session readability.

## Accessibility

- Focusable column rows expose a descriptive label that includes the table and
  column name.
- Enter and Space trigger the same focus action as click.
- Focused and related column states are represented by more than color: the
  selected row has an inset marker and focused edges change stroke weight.
- Escape dismisses transient FK focus without overriding keystrokes consumed by
  Note editing or settings controls.
- The feature does not remove dimmed edges from the accessibility tree or make
  their interaction target smaller.

## Error and edge-case behavior

- A column with no relationship clears the prior focus.
- A self-reference focuses one edge and marks every source/target member column
  on its table; duplicate column IDs are deduplicated.
- Parallel relationships remain independent when an edge is clicked and are
  jointly focused only when the chosen column actually participates in both.
- Composite relationships mark every member column at both endpoints.
- A schema update that removes an edge or originating column clears or prunes
  focus instead of retaining unknown IDs.
- Missing node measurements and smart-routing failures do not affect focus
  calculation because focus is based on schema IDs, not route geometry.

## Data flow

### Column activation

1. `TableNode` reports its stable column ID to `ErdCanvas`.
2. A pure helper finds relationships containing that column.
3. No matches clears focus; matches create a column focus.
4. Node and edge presentation is re-derived from the same focus.
5. Focused edges retain their current adaptive or settled routes.

### Edge activation

1. React Flow reports the stable edge ID to `ErdCanvas`.
2. The canvas creates an edge focus containing only that relationship.
3. Both endpoint member-column sets and all edge focus states are re-derived.

### Dismissal and schema changes

Pane click or unconsumed Escape sets focus to undefined. On schema changes, a
pure pruning helper validates the current focus against stable schema IDs. No
focus value is serialized or sent to a host.

## Testing

### Pure helper tests

- A column maps to every source/target relationship that contains it.
- Composite FK member columns map to the same relationship.
- Endpoint column derivation includes all members and deduplicates IDs.
- A column with no FK yields no relationship IDs.
- Removed relationships and columns prune stale focus deterministically.

### Renderer tests

- Column click focuses all connected edges and both endpoint column sets.
- Edge click focuses one edge even when parallel relationships exist.
- Empty-pane click and Escape clear focus.
- Enter and Space activate column focus.
- Focused, dimmed, selected-column, and related-column classes/styles render.
- Note editing and existing detail popovers retain their event behavior.
- Smart routing, adaptive dragging, local fallback, labels, and self-references
  retain their existing regression coverage.

### Distribution verification

- Run all JavaScript/TypeScript tests and the production build.
- Build the VS Code extension after rebuilding the shared host webview.
- Build the IntelliJ plugin so Gradle copies the same webview bundle.

## Compatibility

All behavior lives in `@dbml-canvas/renderer`. The core model, DBML parser,
layout version, host messages, browser storage, VS Code host, and IntelliJ host
remain unchanged. Existing diagrams open without migration and begin in the
idle presentation state.
