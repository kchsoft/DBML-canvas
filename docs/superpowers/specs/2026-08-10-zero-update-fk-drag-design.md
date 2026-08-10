# Zero-Update FK Drag Design

## Summary

Remove FK edge-array updates from pointer-move frames. A drag session switches
only relationships connected to the dragged tables to adaptive routing once at
drag start. React Flow then supplies live endpoint coordinates to those stable
edge objects as nodes move. Drag stop rebuilds all relationships once in
settled smart-routing mode.

The change remains inside `@dbml-canvas/renderer`, so the browser sandbox,
VS Code extension, and IntelliJ plugin share the same behavior.

## Goals

- Call `setEdges` for routing at drag start and drag stop, never for individual
  pointer-move node updates.
- Keep connected FK lines visually attached to every dragged table.
- Preserve unrelated edge object identities and paths during the drag.
- Preserve FK focus, selection, labels, and the frozen MiniMap behavior.
- Recalculate handle sides and obstacle-aware A* paths once after drag stop.

## Non-goals

- Moving settled A* routing to a Web Worker.
- Reducing general JCEF SVG compositing or node rendering cost.
- Changing React Flow, DBML parsing, host messages, or layout persistence.
- Dynamically flipping left/right FK handles while the pointer is moving.

## Selected approach

At drag start, retain the existing drag-session snapshot and replace only
connected FK edges with adaptive edges. Their selected state and current focus
presentation are preserved. The source and target handle choices made at this
point remain fixed for the lifetime of the drag session.

During pointer movement, the canvas updates only React Flow nodes. It does not
derive a new FK edge array. React Flow's edge renderer supplies changing
`sourceX`, `sourceY`, `targetX`, and `targetY` props to each connected custom
edge; adaptive routing derives its path from those props and therefore follows
the dragged node without new edge data. The routing-node dependency exposed to
the canvas edge effect remains the drag-start snapshot, whose reference is
stable for the session.

At drag stop, the session is cleared and the latest measured node collection
becomes the routing input. The existing settled edge builder then selects final
handle sides and runs smart A* routing once for the complete graph. Existing
per-edge adaptive fallback remains unchanged.

This is preferred over animation-frame throttling because throttling retains
relationship filtering, connected-edge allocation, and a full `setEdges`
state update on recurring frames. It is preferred over a Worker because the
remaining interaction delay occurs while moving, whereas a Worker primarily
addresses the settled calculation after release.

## Data flow

### Drag start

1. Capture the current node and MiniMap snapshots.
2. Record all dragged node IDs in the drag session.
3. Create adaptive replacements only for FK edges connected to those IDs.
4. Freeze the selected handle sides and routing-node snapshot for the session.

### Pointer movement

1. React Flow updates node positions.
2. React Flow updates endpoint props for connected edge components.
3. `FkEdge` recomputes its inexpensive adaptive SVG path from those props.
4. `ErdCanvas` performs no routing-driven `setEdges` call.

### Drag stop

1. Clear the drag session and MiniMap snapshot.
2. Persist all dragged node positions once.
3. Rebuild all FK edges from final node measurements in settled mode.
4. Recalculate handle sides and run smart routing once per relationship.

## Exceptional transitions

- Schema or layout replacement cancels the drag session and performs the
  normal settled rebuild.
- FK focus changes during a drag may update edge presentation state once; they
  are not pointer-move routing updates.
- Edge selection changes remain owned by React Flow and survive the adaptive
  and settled replacements.
- If a moved table disappears, the existing session reconciliation cancels the
  session safely.

## Testing

- A pure routing-input helper returns the frozen snapshot throughout a drag and
  returns live nodes outside a drag.
- Connected edges switch to adaptive mode once at drag start and keep stable
  identities across later node-position updates.
- Adaptive paths change when endpoint props change even when edge data and its
  routing-node snapshot remain unchanged.
- Unrelated edges retain their objects and paths during the session.
- Clearing the session rebuilds settled edges with final handle sides.
- Multi-node dragging, FK selection/focus, MiniMap freezing, and one-time layout
  persistence retain their existing regression coverage.

## Acceptance criteria

- No routing-driven `setEdges` call occurs during pointer-move node updates.
- Connected FK paths follow dragged nodes using React Flow endpoint props.
- Handle sides remain stable while dragging and are correct after release.
- The final graph uses obstacle-aware settled routing with adaptive fallback.
- Renderer and workspace tests, typecheck, production builds, and the IntelliJ
  plugin package complete successfully.
