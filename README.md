# DBML Canvas

DBML Canvas is an early MVP for a Git-native, AI-readable ERD workflow.

- `schema.dbml` is the source of truth for the database structure.
- `schema.dbml.layout.json` stores only visual positions, table colors, and viewport state.
- The renderer is shared by the browser sandbox, VS Code webview, and the JetBrains JCEF host.
- DBML remains the schema source of truth. The canvas edits only table and column `Note` values; all other schema changes stay in the text editor.

## Current state

Implemented:

- `@dbml/core` adapter using the `dbmlv2` parser
- Stable internal `ErdSchema` model
- Portable layout model and merge/prune helpers
- React Flow renderer with draggable table nodes, column handles, relationships, zoom, pan, minimap, and source navigation callbacks
- Hover detail cards for table Notes, indexes, column defaults, constraints, foreign-key targets, and enum values with optional value notes
- Five theme-aware table colors stored in the portable layout sidecar
- Safe DBML table/column Note editing with native VS Code and IntelliJ undo/redo
- Browser sandbox with DBML editing and local layout persistence
- Shared host webview for IDE integration
- VS Code preview extension scaffold with project-side layout JSON persistence
- IntelliJ Tool Window/JCEF plugin scaffold

Not implemented yet:

- Route editing for relationship lines
- Multiple named views
- Multi-file DBML projects
- VS Code Marketplace publishing (packaging works via `npm run package -w dbml-canvas-vscode`; not yet published)
- IntelliJ Marketplace publishing/signing
- A polished parser error model across all DBML syntax errors

## Run the browser sandbox

```bash
npm install
npm run dev
```

Then open the URL printed by Vite.

## Build everything JavaScript/TypeScript

```bash
npm run build
```

## VS Code extension

```bash
npm run build:vscode
```

Open `apps/vscode-extension` in VS Code and run the Extension Development Host. Open a `.dbml` file and execute:

```text
DBML Canvas: Open Preview
```

The extension writes layout data beside the DBML file:

```text
schema.dbml
schema.dbml.layout.json
```

To build a distributable `.vsix`:

```bash
cd apps/vscode-extension
npm run package
```

This produces `dbml-canvas-vscode-<version>.vsix`. Publish with `npm run publish` (requires `vsce login thinkgrowstudio` first, using a Marketplace Personal Access Token).

## IntelliJ plugin

First build the shared host webview:

```bash
npm run build:webview
```

Then copy the generated files into the plugin resources and run the plugin:

```bash
cd apps/intellij-plugin
./gradlew runIde
```

The plugin build uses JDK 21 and targets IntelliJ IDEA 2025.3 (`253`) or later. The Gradle build includes a task that copies `apps/host-webview/dist` into plugin resources before processing resources, so rebuild the webview after frontend changes.

To package an installable plugin:

```bash
./gradlew buildPlugin
```

The plugin ZIP is written to `apps/intellij-plugin/build/distributions/`. In IntelliJ IDEA, open **Settings → Plugins**, use the gear menu, and select **Install Plugin from Disk**.

## Layout format

```json
{
  "version": 1,
  "nodes": {
    "public.member": { "x": 80, "y": 120, "color": "blue" },
    "public.answer": { "x": 520, "y": 120 }
  },
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

Table IDs are deterministic and use `schema.table`. Columns use `schema.table.column`.

## Architecture

```text
@dbml/core
    ↓ DbmlCoreSchemaParser
ErdSchema (our stable model)
    ↓ applyLayout
React renderer
    ↓ HostBridge messages
Web / VS Code / IntelliJ
```

A ready-to-open example is available in [`examples/schema.dbml`](examples/schema.dbml).

See [`docs/architecture.md`](docs/architecture.md) for boundaries and extension points and [`VALIDATION.md`](VALIDATION.md) for the checks completed in this environment.
