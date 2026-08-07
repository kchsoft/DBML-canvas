# React Flow Color Mode Design

## Goal

Make React Flow controls and other built-in UI readable in dark mode by explicitly passing the active host theme into the shared ERD renderer.

## Root Cause

DBML Canvas changes its own CSS variables through `data-theme`, but `ReactFlow` currently receives no `colorMode`. React Flow therefore remains in its default light mode while surrounding DBML UI uses dark colors, producing mismatched built-in control colors.

## Architecture

- Add an optional `colorMode` property to `ErdCanvasProps` using React Flow's exported `ColorMode` type.
- Preserve the current light-mode behavior when the property is omitted.
- Pass `colorMode` directly to `ReactFlow` so React Flow owns the styling of its controls, minimap, and other built-in surfaces.
- Keep the existing DBML CSS variables for product-specific colors. The explicit React Flow mode and DBML theme tokens are complementary.

## Host Integration

- Web sandbox: pass its existing `theme` state to `ErdCanvas`.
- Shared IDE webview: store the latest `host/set-theme` value in React state, continue applying it to `document.documentElement.dataset.theme`, and pass it to `ErdCanvas`.
- VS Code and IntelliJ adapters: no protocol change because both already send `host/set-theme` with `light` or `dark`.

## Compatibility

- Existing renderer consumers that omit `colorMode` remain in light mode.
- The public renderer type uses React Flow's `ColorMode`, leaving room for future `system` support without inventing a parallel theme type.
- No changes to DBML parsing, ERD layout persistence, mouse interaction, or IDE file handling.

## Verification

- Renderer, web sandbox, shared webview, and VS Code host type-check.
- Full production build succeeds.
- Existing automated tests remain green.
- Manual dark-mode check confirms the zoom-in, zoom-out, and fit-view icons are visible in both the web sandbox and an IDE webview.
