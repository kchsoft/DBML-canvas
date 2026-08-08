# IntelliJ live DBML refresh — design

## Problem

`todo.txt` asks that editing a `.dbml` file update the ERD canvas immediately across
web, VS Code, and IntelliJ.

Current state per host:

- **web-sandbox** (`apps/web-sandbox`): already live. The `textarea` `onChange`
  updates in-memory `source` state, and a 350ms debounce re-parses and re-renders.
- **VS Code** (`apps/vscode-extension/src/extension.ts`): already live.
  `vscode.workspace.onDidChangeTextDocument` fires on every edit to the tracked
  document and immediately posts the full source to the webview, which reparses
  on every `host/load` message with no debounce of its own.
- **IntelliJ** (`apps/intellij-plugin/.../DbmlCanvasToolWindowFactory.kt`): **not
  live**. `HostMessageHandler.refresh()` is only called from
  `FileEditorManagerListener.selectionChanged` (switching tabs) and from
  `editNote()` after the canvas itself edits a Note. Typing DBML directly in the
  IntelliJ text editor does not update the tool window canvas until the user
  switches away from and back to the file.

This is the one real gap. The fix is scoped entirely to the IntelliJ plugin.

## Goal

Typing in an open `.dbml` file in IntelliJ updates the DBML Canvas tool window
within a short, imperceptible delay, without needing a tab switch or save.

## Non-goals

- No changes to web-sandbox or VS Code — both already satisfy the requirement.
- No change to the `refresh()` pipeline itself (file read → layout read → post
  `host/load` message) — only when it gets triggered.
- No change to Note-edit-triggered refresh or tab-switch-triggered refresh —
  both are preserved as-is.

## Design

All changes are in
`apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt`.

1. Add a `com.intellij.util.Alarm` (`Alarm.ThreadToUse.SWING_THREAD`) to
   `HostMessageHandler`, tied to the tool window's existing `disposable`.
2. Subscribe to IDE-wide document changes via
   `EditorFactory.getInstance().eventMulticaster.addDocumentListener(listener, disposable)`.
3. In `documentChanged(event)`, resolve the edited file with
   `FileDocumentManager.getInstance().getFile(event.document)`. If it does not
   equal `currentFile` (the file currently shown in the tool window), ignore the
   event — this filters out edits to unrelated files.
4. On a match, debounce: `alarm.cancelAllRequests()` then
   `alarm.addRequest({ refresh(file) }, 250)`. A burst of keystrokes collapses
   into a single `refresh()` call 250ms after typing pauses.
5. `refresh()` itself is unchanged and already handles the not-ready /
   no-current-file cases as a no-op.

### Why debounce instead of firing on every keystroke

VS Code has no debounce and this works fine there because `postMessage` into a
webview is cheap. IntelliJ's path is heavier per call: pooled-thread read
action → `invokeLater` → JSON build → CEF `executeJavaScript`. Firing that full
round trip per character would be wasteful and would flash the parse-error
banner constantly while a table/column definition is mid-edit (e.g. an unclosed
`Table foo {`). A 250ms debounce, matching the feel of web-sandbox's existing
350ms, keeps the update feeling instant while collapsing rapid typing into one
refresh.

### Edge cases

- Tool window not yet `webviewReady`, or no DBML file currently tracked:
  `refresh()` no-ops, same as today.
- Switching tabs while a debounce is pending: the existing
  `selectionChanged` listener still calls `refresh()` directly (unaffected by
  the alarm), and `currentFile` is updated so the next document-change event
  filters correctly.
- Edits to a `.dbml` file that is open but not the one currently shown in the
  tool window: filtered out by the `currentFile` equality check.
- Plugin/tool-window disposal: the `Alarm` and document listener are both tied
  to `disposable`, so they are cleaned up together with the browser and query
  handler.

## Testing

No Kotlin-side automated tests exist for the IntelliJ plugin
(`apps/intellij-plugin/src` has no test directory). Verify manually:

```bash
npm run build:webview
cd apps/intellij-plugin
./gradlew runIde
```

- Open a `.dbml` file, type a change, confirm the canvas updates ~250ms after
  typing pauses.
- Confirm tab-switch refresh still works.
- Confirm Note editing from the canvas still works and still refreshes.
- Confirm editing a different, non-tracked file does not trigger a refresh.
