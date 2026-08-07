# Resizable Web Split Pane Design

## Goal

Allow desktop users of the web sandbox to resize the boundary between the DBML source editor and the ERD canvas. Preserve the chosen source-pane width across page reloads without changing the shared renderer or IDE adapters.

## Scope

- Apply only to `apps/web-sandbox`.
- Keep the current stacked layout below 850px and disable resizing there.
- Do not change DBML parsing, ERD layout persistence, VS Code integration, or IntelliJ integration.

## Interaction

- Place a vertical separator between the source pane and canvas.
- Give the separator an approximately 8px pointer target while keeping the visible rule visually thin.
- Dragging the separator horizontally resizes the source pane.
- Constrain the source pane to a minimum of 260px and a maximum of 70% of the workspace width.
- Double-clicking the separator restores the default width of 34%.
- The separator is keyboard focusable. Left and right arrow keys adjust the source width in fixed increments.
- Use the column-resize cursor and a visible hover, focus, and active state.

## State and Persistence

- Store the desktop source-pane width in pixels in `localStorage` under a web-sandbox-specific key.
- Validate stored values before use. Missing, non-finite, or non-positive values fall back to the 34% default.
- Clamp every finite stored width to the current workspace bounds so a value saved on a larger display cannot make the pane unusable on a smaller display.
- Mobile stacked layout does not overwrite the saved desktop width.

## Components and Data Flow

- `App` owns the source-pane width state because it owns the web sandbox layout.
- Pointer-down captures the pointer and records drag movement relative to the workspace bounds.
- Width changes update the CSS grid column through an inline CSS custom property.
- Completed changes are persisted to `localStorage`.
- React Flow remains unchanged and responds to the resized canvas container through its existing size observation.

## Accessibility

- Render the handle with `role="separator"`, vertical orientation, and current/minimum/maximum values.
- Support keyboard resizing with the left and right arrow keys.
- Provide a visible focus indicator and prevent accidental text selection while dragging.

## Error Handling

- Ignore malformed persisted values.
- Clamp pointer and keyboard input to valid bounds.
- Release dragging state on pointer completion or cancellation.

## Verification

- The web sandbox type-checks and builds.
- Dragging changes both pane widths without breaking the ERD canvas.
- The width remains after reload.
- Minimum and maximum constraints hold.
- Double-click restores 34%.
- Arrow keys resize the focused separator.
- Below 850px the panes remain stacked and the separator is hidden.
- Existing DBML parsing and layout tests continue to pass.
