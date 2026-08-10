# FK Drag Performance Design

## Summary

Optimize the shared ERD renderer so dragging one table does not rebuild and
rerender every FK relationship on every pointer update. During a drag, only
relationships directly connected to the active table follow it with the
existing inexpensive adaptive route. Unrelated relationship routes and the
MiniMap node positions remain at their drag-start snapshot. Releasing the table
applies the final positions and performs one complete settled smart-route
recalculation.

The behavior is implemented only in `@dbml-canvas/renderer`, so the browser
sandbox, VS Code extension, and IntelliJ plugin receive the same optimization.

## Goals

- Keep the actively dragged table responsive as relationship count grows.
- Update every FK directly connected to the dragged table during the drag.
- Avoid rebuilding or rerendering unrelated FK relationships per pointer move.
- Keep the MiniMap visible but freeze its node positions during the drag.
- Recompute the complete obstacle-aware routing result once after drag stop.
- Preserve FK focus, selection, labels, handles, and layout persistence.

## Non-goals

- Incremental obstacle invalidation for settled A* paths.
- Web Worker routing.
- Host-specific JCEF flags or IntelliJ-only rendering behavior.
- Changes to DBML parsing, host messages, or the layout sidecar format.
- Removing or permanently disabling the MiniMap.

## Selected approach

Use a drag-session snapshot owned by `ErdCanvas`.

At drag start, capture the routing geometry and MiniMap node positions. Record
the active table ID and switch its directly connected relationships to adaptive
routing. While node-change events move the active table, derive a drag-time edge
set by preserving unrelated edge objects and updating only connected edge
objects. `FkEdge` must not subscribe independently to the complete React Flow
node array while the canvas is in this drag path.

At drag stop, clear the drag session, apply the final node geometry, and rebuild
the full edge set in settled mode. Smart A* routing therefore runs once for the
completed layout rather than once per pointer movement.

This approach is preferred over continuing to recreate every adaptive edge
because it removes the dominant per-frame work. It is preferred over hiding all
edges or the MiniMap because the user retains relationship context throughout
the interaction.

## Architecture

### Drag session

`ErdCanvas` owns transient drag-session state containing:

- the active table ID;
- the node geometry snapshot from drag start;
- the current geometry of the active table; and
- the MiniMap snapshot used until the session ends.

The session is renderer-only state. It is never emitted through `onLayoutChange`
or written to the layout sidecar.

Only one table is treated as active because React Flow node dragging is a
single-pointer interaction in the current canvas. If selection semantics cause
multiple node positions to change, all changed nodes are included in the
drag-time geometry update so edge endpoints remain correct.

### Relationship partitioning

A pure helper partitions relationships using their stable source and target
table IDs. A relationship is connected when either endpoint belongs to the set
of nodes whose geometry changed during the current drag session.

Connected edges use current endpoint geometry and adaptive `smoothstep`
routing. Unrelated edges retain their drag-start objects and route geometry.
Focus or selection changes are still applied without discarding the frozen
route geometry.

### FK node access

Node geometry needed for route resolution is supplied from the canvas-level
routing snapshot. Individual `FkEdge` components no longer subscribe to or scan
the complete React Flow node array. Settled smart routing continues to receive
all measured nodes because unrelated tables remain routing obstacles.

### MiniMap

The MiniMap stays mounted during dragging. It receives the drag-start node
snapshot until the drag session ends, preventing its representation of the
active node from repainting on each pointer update. On drag stop it receives the
final live nodes in the same render cycle as settled routing.

If the MiniMap implementation cannot accept an independent node collection
without forking React Flow internals, the renderer will use a memoized custom
MiniMap node projection or a CSS-contained overlay driven by the snapshot. It
must not hide the MiniMap or mutate persisted node state.

## Data flow

### Drag start

1. Capture current measured routing nodes and MiniMap positions.
2. Record the active table ID.
3. Partition FK relationships into connected and unrelated groups.
4. Switch connected relationships to adaptive routing.
5. Preserve unrelated edge route inputs and objects.

### Pointer movement

1. React Flow updates the moved node position.
2. Update current geometry only for nodes changed in the drag session.
3. Recreate only connected adaptive edges.
4. Keep unrelated route geometry and MiniMap positions at the snapshot.
5. Do not emit layout persistence during the pointer movement.

### Drag stop

1. Apply the final node position to the existing layout update flow.
2. End the drag session and release the MiniMap snapshot.
3. Rebuild every FK edge in settled mode from final measured geometry.
4. Run smart routing once per edge, with existing per-edge adaptive fallback.

### Cancellation and external changes

- A schema or layout replacement ends any active drag session before rebuilding
  nodes and edges.
- If the active table disappears, the session is cancelled and the remaining
  graph is rebuilt normally.
- Unmounting the canvas discards the transient session without persistence.

## Testing

### Pure behavior tests

- Partition connected and unrelated relationships for one moved table.
- Include every relationship when both endpoints or multiple selected nodes
  move.
- Preserve unrelated edge object identities across pointer updates.
- Recreate connected adaptive edges with current endpoint geometry.
- Rebuild all settled edges after drag stop.
- Cancel a drag snapshot safely when the schema removes the active table.

### Renderer integration tests

- Dragging one table in a multi-table fixture does not recreate an unrelated FK
  edge.
- A connected FK follows the active table during pointer movement.
- The MiniMap remains visible and its projected node position stays frozen
  until drag stop.
- FK focus and selection changes remain visible during a drag.
- Layout persistence occurs once on drag stop and retains the version 1 shape.

### End-to-end verification

- Run renderer tests, workspace tests, typecheck, and production builds.
- Build the shared host webview and both plugin packages that consume it.
- Inspect a dense FK fixture in a browser performance trace when a browser is
  available, comparing scripting and render work before and after the change.
- Smoke-test drag behavior in IntelliJ JCEF when an IDE runtime is available;
  otherwise report the unavailable visual check without claiming it passed.

## Acceptance criteria

- During a table drag, only FK edges connected to changed tables update their
  route geometry.
- Unrelated FK paths and MiniMap positions remain visually stable until release.
- Releasing the table produces correct obstacle-aware settled paths for the
  complete graph.
- FK focus, selection, navigation, and layout persistence behave as before.
- The implementation is shared by browser, VS Code, and IntelliJ and introduces
  no schema, bridge, or layout-format change.
