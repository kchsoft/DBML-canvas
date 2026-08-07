# Architecture

## Design goals

1. Keep DBML as the only schema-editing source of truth.
2. Store visual intent in a small, deterministic, Git-friendly sidecar file.
3. Keep the rendering engine independent from each IDE.
4. Prevent `@dbml/core` model changes from leaking into the renderer.
5. Make every meaningful artifact readable and editable by coding agents.

## Package boundaries

### `@dbml-canvas/core`

Pure TypeScript without React or IDE APIs.

Responsibilities:

- Parse DBML through an adapter.
- Map external parser objects into `ErdSchema`.
- Generate stable IDs.
- Validate and merge layout data.
- Map Notes, indexes, defaults, and source ranges into stable schema metadata.
- Generate and validate minimal DBML Note text edits.
- Define host/webview messages.

### `@dbml-canvas/renderer`

React and React Flow only.

Responsibilities:

- Render tables, columns, and relationships.
- Handle node dragging, zooming, and panning.
- Emit updated layout state.
- Emit source-navigation requests.
- Derive compact PK/FK/UNIQUE labels and detailed relationship metadata.
- Emit semantic table/column Note edit requests.

It does not read or write files and does not know whether it runs in a browser, VS Code, or IntelliJ.

### `apps/host-webview`

Generic IDE-hosted React application.

Responsibilities:

- Receive DBML source and saved layout from a host.
- Parse and render them.
- Validate candidate Note edits by reparsing DBML.
- Send layout changes, source navigation, and revision-bound minimal Note edits back to the host.

### IDE adapters

VS Code and IntelliJ own only:

- Finding the active DBML file.
- Reading and writing the sidecar layout file.
- Watching source changes.
- Hosting the compiled webview.
- Opening a source location in the editor.
- Applying validated Note ranges through native editor write APIs so undo/redo and dirty-document behavior remain intact.

## Future parser support

The UI consumes `SchemaParser`, not `@dbml/core` directly. Additional adapters can be added without changing the renderer:

```text
SchemaParser
├── DbmlCoreSchemaParser
├── PrismaSchemaParser
├── SqlDdlSchemaParser
└── JpaMetadataParser
```

## Compatibility rule

The layout format belongs to DBML Canvas, not to React Flow. Never serialize React Flow's entire internal node object. Persist only positions, viewport state, and one of the five table color tokens. Notes belong in DBML and must never be duplicated into the layout sidecar.
