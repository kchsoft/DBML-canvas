# Table Annotations and Canvas Preferences Design

> The layout-backed memo portion of this design is superseded by
> `2026-08-07-dbml-note-details-and-editing-design.md`. Table colors and canvas
> preferences remain current.

## Goal

Let users assign one of five theme-aware colors and a memo to each table, manually switch the hosted canvas between light and dark mode, and reduce Control-wheel zoom sensitivity to 70% of the current macOS behavior.

## Layout Data

Table annotations are portable project data and belong in `<schema>.dbml.layout.json`:

```json
{
  "version": 1,
  "nodes": {
    "public.member": {
      "x": 80,
      "y": 120,
      "color": "blue",
      "memo": "Authentication aggregate root"
    }
  }
}
```

- Allowed color tokens are `blue`, `green`, `yellow`, `red`, and `purple`.
- Missing color means DBML header color, then the default theme color.
- Empty memos are removed from serialized layout data.
- Layout parsing ignores invalid color values and preserves valid memo strings.

## Table Editing UI

- Selecting a table shows a compact React Flow `NodeToolbar` above it.
- The toolbar contains five color swatches, a reset control, and a memo control.
- Color changes save immediately through the existing layout change callback.
- The memo control opens a small textarea with Save and Cancel actions.
- Tables with memos show a note indicator in the header. Hovering it previews the memo through an accessible tooltip; clicking it opens the editor.
- Toolbar controls use `nodrag`, `nopan`, and `nowheel` classes so editing never moves the canvas or table.

## Theme Behavior

- Palette tokens map to separate light and dark CSS values rather than storing raw colors.
- The shared IDE webview shows a light/dark button in the canvas top-right corner.
- The first load follows the host IDE theme. A manual choice overrides it and is stored locally for that webview user, not in project layout JSON.
- Host theme messages continue to update the canvas when no manual preference exists.
- The browser sandbox keeps its existing theme control and uses the same theme-aware table palette.

## Trackpad Zoom

- Plain two-finger scrolling continues to pan freely.
- Control-wheel and macOS pinch gestures zoom around the pointer position.
- Their wheel delta is multiplied by `0.7` before applying the same exponential zoom curve used by React Flow.
- The resulting zoom remains clamped to the existing `0.1`–`2.5` range.
- React Flow's built-in Control/pinch zoom is disabled to prevent double handling; other viewport controls remain unchanged.

## Verification

- Core tests cover annotation updates, validation, pruning, and serialization.
- Renderer tests cover palette data flow, annotation controls, and the 70% zoom calculation.
- Host webview tests cover theme preference resolution and persistence-safe behavior.
- Full JavaScript tests and type checks pass.
- No IntelliJ plugin ZIP is built in this change.

## Non-Goals

- Arbitrary user-entered colors.
- Rich-text or Markdown memos.
- Storing theme preference in layout JSON.
- Building or installing a new IntelliJ distribution in this phase.
