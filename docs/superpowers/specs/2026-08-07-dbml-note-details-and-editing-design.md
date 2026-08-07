# DBML Note Details and Editing Design

## Goal

Keep table rows compact while exposing DBML schema details on demand. Users can
inspect table and column metadata, edit DBML `Note` values from the canvas, and
choose one of five table colors without maintaining a second memo system.

This design also corrects duplicated parameterized types such as
`varchar(255)(255)` and replaces abbreviated constraint labels with a clearer
compact set.

## Source of Truth

- The `.dbml` file is the only source of truth for table and column notes.
- The `memo` property is removed from `NodeLayout`, layout parsing, annotation
  updates, renderer controls, and serialized layout data.
- No compatibility or migration path is retained for layout-backed memos because
  the feature has not been distributed. Unknown `memo` properties in an old JSON
  file are discarded the next time layout data is parsed and saved.
- Table color remains portable visual metadata in `<schema>.dbml.layout.json`.

## Compact Table Rows

Each column row shows only the following constraint labels, in this order:

1. `PK`
2. `FK`
3. `UNIQUE`

Multiple applicable labels are shown together. `AI` is removed from the compact
row. Foreign-key status is derived from relationship endpoints rather than stored
as duplicate schema state. For many-to-one relationships, only the referencing
column receives `FK`; a referenced primary key does not. For one-to-one
relationships, the non-primary endpoint is treated as the foreign key when that
distinction exists. If DBML does not identify an owning side, neither endpoint is
guessed as `FK`; the relationship remains visible without a potentially false
constraint label.

The core DBML adapter normalizes parameterized types. If the parser returns both
`type_name: "varchar(255)"` and `args: "255"`, the adapter returns
`varchar(255)` once. It still appends arguments when the type name does not
already contain them.

## Table Header Interaction

- Hovering the table-name header for about 200 ms opens a read-only detail card.
- Moving directly between the header and card keeps the card open. Leaving both
  closes it after a short grace period.
- The card contains the table name, DBML table `Note`, and DBML indexes.
- Each index shows its name when present, ordered columns or expressions, and
  whether it is unique or primary.
- Missing notes and indexes have compact empty states rather than blank sections.
- The table header includes a settings button. Clicking it opens a pinned popover
  containing the existing five theme-aware color choices and reset action only.
  Arbitrary/custom colors are out of scope.
- Header controls use React Flow interaction guard classes so clicks, wheel input,
  and text selection do not drag or pan the canvas.

## Column Interaction

- Hovering a column row for about 200 ms opens a read-only detail card anchored to
  that row. Entering a column suppresses the table-header card.
- The card shows column name, normalized type, DBML column `Note`, default value,
  index membership, and applicable constraints.
- Detailed constraints use full labels: `PRIMARY KEY`, `FOREIGN KEY`, `UNIQUE`,
  `AUTO INCREMENT`, and `NOT NULL`.
- Relationship-derived foreign-key details identify the referenced table and
  columns when available.
- Empty optional sections are omitted.

## Note Editing

- A detail card is read-only while merely hovered.
- Clicking `Edit note` pins the card and opens a textarea with Save and Cancel.
- Saving replaces an existing DBML `Note` or inserts a new one when absent.
- Clearing and saving removes the DBML `Note` syntax.
- User text is escaped into valid DBML without rewriting unrelated source text.
- A stale edit is rejected if the expected target no longer matches the current
  document; the canvas reloads the latest document instead of overwriting it.

The shared protocol sends a semantic note-edit request containing the target
kind, stable table/column ID, expected source identity, and new note value. Each
host applies the smallest text edit to its current document:

- The browser sandbox updates its controlled DBML source.
- VS Code uses `WorkspaceEdit`, preserving editor undo/redo and dirty-document
  behavior.
- IntelliJ uses a write command against the current document, preserving native
  undo/redo and editor synchronization.

After a successful edit, the existing document-change path reparses DBML and
refreshes the shared renderer. The webview never overwrites an entire file from a
stale source snapshot.

## Schema Model Additions

The stable core model gains only metadata needed by all hosts and renderers:

- table indexes with names, ordered members, uniqueness, primary status, and
  optional notes;
- column default display values;
- note-specific source ranges or insertion anchors required for minimal edits.

Relationship records remain the canonical source for foreign-key derivation.
Layout data continues to contain positions, viewport state, and table colors only.

## Visual and Accessibility Rules

- Cards and settings popovers use the shared light/dark theme variables.
- Cards prefer the side with available viewport space and remain inside the
  canvas bounds.
- Buttons and editable controls are keyboard reachable and have descriptive
  accessible names.
- Hover-only information is also reachable by keyboard focus. Escape closes a
  pinned card or settings popover.
- Cards use restrained shadows and borders so they remain readable without
  visually overpowering relationship lines.

## Error Handling

- Invalid DBML after a note edit is not written.
- Host write failures are returned to the webview and shown near the pinned card.
- Parser metadata that cannot be mapped is omitted with a warning; it does not
  prevent the rest of the ERD from rendering.
- Concurrent source changes cause a refresh-and-retry prompt rather than a blind
  overwrite.

## Verification

- Core tests cover type normalization, index/default mapping, note edit creation,
  replacement, deletion, escaping, and stale-target rejection.
- Renderer tests cover compact labels, FK derivation, card data, hover/focus
  behavior, five-color settings, and removal of layout memo controls.
- Host protocol tests cover semantic edit request validation.
- VS Code and IntelliJ tests cover minimal editor writes and undo-compatible host
  integration at their practical test boundaries.
- Full JavaScript tests and type checks must pass.
- The IntelliJ plugin source may be compiled for verification, but no installable
  plugin ZIP is built in this change.

## Non-Goals

- Editing table or column names, types, indexes, defaults, or relationships.
- Custom colors or a color picker.
- Rich text or Markdown notes.
- Retaining or migrating layout-backed memos.
- Reproducing every dbdiagram.io sidebar or enum inspector in this phase.
- Packaging or installing an IntelliJ plugin distribution.
