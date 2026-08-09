# Adaptive FK Edge Routing Design

## Summary

DBML Canvas currently attaches every relationship from a right-side source
handle to a left-side target handle and delegates the path to React Flow's
`smoothstep` edge. The attachment sides remain fixed even when users rearrange
tables, and a path may pass through unrelated tables.

Replace that behavior with adaptive column endpoints and obstacle-aware FK
routing in the shared renderer. While a table is being dragged, connected edges
use an inexpensive adaptive `smoothstep` route. When the drag ends, an A*-based
smart edge computes an orthogonal route around table nodes. If smart routing
cannot produce a path, only that relationship falls back to the adaptive
`smoothstep` route.

## Goals

- Keep every relationship attached to its actual source and target column rows.
- Select left or right column endpoints from the current relative table
  positions instead of the DBML relationship direction.
- Route settled FK edges around all table nodes with a small safety margin.
- Keep dragging responsive by using adaptive `smoothstep` edges until the drag
  stops.
- Fail locally and visibly: one unroutable edge falls back without affecting
  other edges or the canvas.
- Apply the behavior consistently in the browser sandbox, VS Code extension,
  and IntelliJ plugin through `@dbml-canvas/renderer`.
- Preserve DBML as the schema source of truth and preserve the version 1 layout
  sidecar format.

## Non-goals

- Moving or automatically laying out tables.
- Persisting computed routes or React Flow edge internals in the layout sidecar.
- Minimizing edge-to-edge crossings or separating all shared edge segments.
- Adding bridge/hop rendering at line crossings.
- Manual bend-point or relationship route editing.
- Adding Web Worker routing before measurements show that settled-route
  calculation is a bottleneck.

## Selected approach

Use `@tisoap/react-flow-smart-edge` with the existing React Flow v12 renderer.
The package supplies grid-based A* node avoidance and React Flow custom-edge
integration. DBML Canvas continues to own endpoint selection, routing mode
transitions, labels, visual styling, and fallback behavior.

This is preferred over an in-house A* implementation because it delivers the
required obstacle avoidance without adding a new routing subsystem to maintain.
ELK and libavoid were rejected for the first iteration because they add broader
layout or WASM/worker lifecycle concerns than this fixed-node edge-routing
feature needs.

References:

- React Flow routing overview: <https://reactflow.dev/learn/layouting/layouting>
- React Flow Smart Edge: <https://github.com/tisoap/react-flow-smart-edge>
- React Flow floating-edge example:
  <https://reactflow.dev/examples/edges/floating-edges>

## Architecture

### Package boundaries

`@dbml-canvas/core` remains unchanged. Relationships, stable IDs, cardinality,
layout positions, table colors, and viewport state keep their current models.

`@dbml-canvas/renderer` owns all new behavior:

- render left and right source/target handles for every column;
- choose visual endpoint sides from current node geometry;
- render the adaptive drag route;
- render the settled obstacle-aware route;
- fall back per edge when routing fails; and
- preserve the current relationship label and styling contract.

`apps/web-sandbox` and `apps/host-webview` consume the changed renderer without
feature-specific logic. VS Code serves the rebuilt host-webview bundle. The
IntelliJ Gradle build copies that same rebuilt bundle into plugin resources.
Neither IDE host gains an independent routing implementation or protocol
change.

### Renderer components

1. **Column handles**

   Each column row exposes visually coincident source and target handles on both
   the left and right sides. IDs encode relationship role, column ID, and side
   so an edge can retain DBML source/target semantics while choosing either
   visual side. Handles remain non-connectable and keep the current unobtrusive
   appearance.

2. **Endpoint selection helper**

   A pure helper receives source and target node rectangles and returns the
   preferred left/right side pair. It evaluates the valid side combinations
   with deterministic costs for initial distance and backward travel. Stable
   tie-breaking prevents routes from flickering when tables are vertically
   aligned or nearly centered on the same x-coordinate. Source/target meaning is
   never swapped; only their visual handle IDs change.

3. **Adaptive fallback edge**

   The fallback uses the selected column handles and React Flow's smooth-step
   path. It is the active renderer while any table drag is in progress and the
   per-relationship fallback when settled smart routing returns no path or
   fails.

4. **Obstacle-aware FK edge**

   A shared custom edge calls React Flow Smart Edge's low-level path API inside
   a guarded route resolver. It treats every table node as an obstacle expanded
   by a 16px safety margin. The selected route favors short paths with fewer
   bends and preserves existing FK label content, label styling, stroke width,
   and selection behavior. A missing result or thrown error returns the
   adaptive path from the same resolver instead of escaping edge rendering.

5. **Routing-mode state**

   `ErdCanvas` records whether a node drag is active. Drag start switches FK
   edges to adaptive mode. Node position updates continue to refresh their
   endpoints without running A*. Drag stop persists the node position through
   the existing layout callback and switches the canvas back to settled smart
   routing. Loading a schema or layout also produces settled smart routes after
   React Flow has measured the nodes.

## Data flow

### Initial load and schema changes

1. Core parses DBML into the unchanged `ErdSchema`.
2. `createFlowNodes` applies the saved table layout.
3. `createFlowEdges` retains relationship IDs, table IDs, column IDs, labels,
   and cardinalities as edge data rather than fixing one handle side forever.
4. Once React Flow has measured node dimensions, endpoint selection resolves
   the concrete left/right column handles.
5. The obstacle-aware edge computes and renders the settled path.

### Table dragging

1. Drag start sets the routing mode to `dragging`.
2. Adaptive edges follow the current node positions with `smoothstep` paths.
3. Drag stop writes the final table position through the existing layout flow.
4. Routing mode returns to `settled`, which recomputes obstacle-aware paths for
   the resulting node geometry.

No route coordinates are serialized. Reopening the diagram deterministically
recomputes them from schema relationships and saved table positions.

## Routing rules and edge cases

- Left/right endpoint choice is based on current geometry, not whether an
  endpoint is the DBML source or target.
- A settled path must not intersect the safety-expanded rectangle of an
  unrelated table.
- The source and target tables are excluded as obstacles only where required to
  let the route leave or enter the selected handles.
- Self-referencing relationships use opposite sides of the same column/table
  and render as an exterior loop. If smart routing cannot form that loop, the
  adaptive self-loop is used.
- Multiple relationships between the same tables retain distinct column-row
  endpoints. Shared intermediate path segments are allowed in this iteration.
- Near-vertical table arrangements use deterministic side selection rather
  than adding top/bottom ports, because FK endpoints must continue to identify
  their column rows.
- An empty or invalid smart route falls back only for that edge.
- Unexpected smart-router exceptions are contained by the FK edge boundary;
  they do not clear other edges or block table interaction.

## Performance

Obstacle-aware routing runs after drag completion, initial node measurement,
schema changes, and saved layout changes. It does not run for every pointer move
during dragging. This bounds the first iteration's main-thread work while
keeping visual feedback continuous.

Do not add worker infrastructure speculatively. If validation on a large schema
shows visible settled-route delay, the chosen library's batch Web Worker mode
is the planned extension point without changing the schema or layout contracts.

## Compatibility and distribution

- Add the selected smart-edge package only to the renderer workspace.
- Confirm its React Flow v12 peer range against the repository's pinned
  `@xyflow/react` version before installation.
- Regenerate `THIRD_PARTY_NOTICES.txt` and keep the legal-notices test passing.
- Rebuild the shared host webview before packaging either IDE integration.
- No host message, DBML parser, layout version, or migration change is required.

## Verification

### Unit tests

- Endpoint selection chooses facing sides for left-to-right and right-to-left
  table arrangements.
- Vertical and equal-distance cases use stable tie-breaking.
- Source and target semantic roles remain unchanged when sides change.
- Self-references choose opposite sides.
- Drag start and drag stop select adaptive and settled routing modes,
  respectively.
- Missing or failed smart routes select the adaptive fallback for only the
  affected relationship.

### Renderer integration tests

- A three-table fixture places an unrelated table between relationship
  endpoints and verifies that the settled route does not intersect its expanded
  rectangle.
- The same fixture verifies responsive adaptive routing during a drag.
- Relationship labels, cardinality text, stroke styling, and column-specific
  handle IDs remain present.
- Multiple FK relationships between the same tables retain their own column
  endpoints.

### End-to-end build checks

- Run the repository JavaScript/TypeScript tests and build.
- Build the VS Code extension with the rebuilt shared webview.
- Build the IntelliJ plugin so the rebuilt webview is copied into plugin
  resources.
- Confirm the legal-notices test includes the new dependency.
- Manually inspect the example schema in the browser sandbox and both IDE hosts:
  drag a table across another table, observe adaptive routing while dragging,
  and verify obstacle avoidance after release.
- Confirm the saved layout still contains only positions, table colors, and
  viewport state.

## Acceptance criteria

The feature is complete when all three hosts render the same column-accurate FK
connections, settled paths avoid unrelated table rectangles, dragging remains
responsive through adaptive paths, individual routing failures visibly fall
back, and no persisted schema or layout contract changes.
