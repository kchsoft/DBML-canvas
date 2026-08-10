# Enum Values in Column Hover Details

## Goal

When a user hovers or keyboard-focuses a column whose DBML type resolves to an
enum, show the enum's allowed values and each value's optional DBML note in the
existing column detail card. The feature must behave identically in the browser,
VS Code, and IntelliJ because all three hosts use the shared core model and React
renderer.

## Scope

- Parse DBML enum definitions into the stable `ErdSchema` model.
- Preserve enum value order and optional notes.
- Associate an enum-typed column with its resolved enum definition.
- Add an `Allowed values` section to the existing column hover/focus card.
- Keep normal columns and unresolved custom types unchanged.

This feature does not add enum editing, schema editing, nested value tooltips, or
a separate enum inspector.

## Data Model

Add stable enum types to `@dbml-canvas/core`:

- `ErdEnumValue`: `name` and optional `note`.
- `ErdEnum`: stable `id`, schema name, enum name, display name, and ordered
  values.
- `ErdSchema.enums`: every parsed enum in schema order.
- `ErdColumn.enumId`: present only when `@dbml/core` resolved the field to an
  enum.

Enum IDs use the same schema-qualified convention as tables. The adapter must
use the parser's resolved enum association rather than guessing from a type
string. This preserves correctness for schema-qualified enums and avoids
misclassifying custom scalar types that happen to share a name.

Malformed or incomplete parser objects are handled defensively: unnamed enum
definitions and unnamed values are skipped and recorded as schema warnings. A
column without a valid resolved enum remains a normal column.

## Renderer Data Flow

`createSchemaDetails` builds an enum lookup from `ErdSchema.enums`. A column
detail receives an optional immutable enum summary containing its display name
and ordered values. `TableNode` continues using the existing delayed
hover/focus popover; it requires no second hover target or independent state.

`DetailsCard` renders an `Allowed values` section only when the column has a
resolved enum with at least one value. Every value is a compact list row:

- The value name is rendered as monospace code.
- An optional note is rendered as muted supporting text in the same row,
  wrapping below the value on narrow or long content.
- Source order is preserved.

The value list has a bounded height and scrolls internally when necessary. The
card keeps its current width, theme variables, left/right placement, keyboard
focus behavior, and light/dark mode support. This avoids a hover-inside-hover
interaction and keeps the UI consistent with existing Defaults, References, and
Indexes sections.

## Visual Direction

The detail card remains a quiet technical inspector. Enum values use a thin
vertical rhythm, code-colored value labels, and low-emphasis notes separated by
space rather than decorative badges. The one distinguishing element is a subtle
accent rail on the enum value list, visually connecting the allowed values to
the column's type without competing with FK focus highlighting.

## Accessibility and Interaction

- The existing mouse hover and keyboard focus triggers both reveal the same
  content.
- The section uses a heading and semantic list.
- Notes are visible directly; users do not need another pointer hover.
- Scrolling the list remains contained by the existing `nowheel` popover.
- Existing Escape, pinning, note editing, and FK click behavior remain intact.

## Testing

- Core adapter tests verify enum definitions, value order, notes, qualified
  identity, and column association.
- Schema detail tests verify resolved enums are attached only to enum columns.
- Renderer tests verify the semantic `Allowed values` list, value names, notes,
  and bounded-list styling.
- Existing renderer and host tests guard hover/focus, FK highlighting, and note
  editing behavior.
- Final verification runs the full JavaScript test suite, web and VS Code builds,
  and the IntelliJ Gradle build.

## Success Criteria

Hovering or focusing an enum column shows every allowed value and its optional
note in the existing detail card, in DBML declaration order, across all three
hosts. Non-enum columns show no enum section, and existing column/FK interactions
continue to work unchanged.
