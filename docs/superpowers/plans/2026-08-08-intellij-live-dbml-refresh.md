# IntelliJ Live DBML Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in an open `.dbml` file in the IntelliJ plugin updates the DBML Canvas tool window within ~250ms, without requiring a tab switch or save.

**Architecture:** Add a debounced, IDE-wide document-change listener to the existing `DbmlCanvasToolWindowFactory.kt` tool window handler. When the edited document belongs to the file currently shown in the tool window, schedule a debounced call into the handler's existing `refresh()` pipeline (unchanged) via a `com.intellij.util.Alarm`.

**Tech Stack:** Kotlin, IntelliJ Platform SDK (`EditorFactory`, `DocumentListener`, `Alarm`, `FileDocumentManager` — all already-available platform APIs, no new Gradle dependency).

## Global Constraints

- Plugin targets IntelliJ Platform `2025.3` (JDK 21) — see `apps/intellij-plugin/gradle.properties:3`. All APIs used must be available on that platform version (`Alarm`, `EditorFactory.eventMulticaster`, and `DocumentListener` have been stable platform APIs for many releases, so this is satisfied).
- Only `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt` changes. web-sandbox and VS Code already satisfy the "immediate refresh" requirement and must not be touched (per spec `docs/superpowers/specs/2026-08-08-intellij-live-dbml-refresh-design.md`).
- The existing `refresh()` method's internal pipeline (file read → layout read → `host/load` message) must not change — only what triggers it.
- Debounce window is 250ms (per spec, matches the feel of web-sandbox's 350ms without over-delaying).

---

## Task 1: Debounced document-change listener in the IntelliJ tool window

**Files:**
- Modify: `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt`

**Interfaces:**
- Consumes: existing `HostMessageHandler.refresh(file: VirtualFile?)` (unchanged signature, `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt:146`).
- Produces: `HostMessageHandler` gains a new constructor parameter `disposable: com.intellij.openapi.Disposable` and a new method `onDocumentChanged(document: Document)`. No other file depends on `HostMessageHandler`'s constructor today (it is only instantiated once, inside `createBrowserPanel`), so this is a safe, local signature change.

This is a single cohesive change (new imports, one constructor param, one field, one method, one call-site update, one new listener registration) — splitting it into multiple tasks would fragment a change that only compiles and only makes sense as a whole.

- [ ] **Step 1: Add the new imports**

In `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt`, the import block currently reads (lines 1-28):

```kotlin
package dev.dbmlcanvas.intellij

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorManagerEvent
import com.intellij.openapi.fileEditor.FileEditorManagerListener
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.UIUtil
import com.intellij.psi.PsiDocumentManager
import java.awt.BorderLayout
import java.nio.charset.StandardCharsets
import javax.swing.JLabel
import javax.swing.JPanel
```

Add five imports (insert after the `com.intellij.openapi.fileEditor.FileDocumentManager` line, keeping the rest as-is):

```kotlin
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.util.Alarm
```

- [ ] **Step 2: Pass `disposable` into `HostMessageHandler` and register the document listener in `createBrowserPanel`**

The current `createBrowserPanel` (lines 47-85) reads:

```kotlin
    private fun createBrowserPanel(project: Project, disposable: com.intellij.openapi.Disposable): JPanel {
        val panel = JPanel(BorderLayout())
        val browser = JBCefBrowser()
        val query = JBCefJSQuery.create(browser as JBCefBrowserBase)
        val handler = HostMessageHandler(project, browser)

        Disposer.register(disposable, browser)
        Disposer.register(disposable, query)

        query.addHandler { request ->
            handler.handle(request)
            null
        }

        val html = loadBundledWebviewHtml(query)
        if (html == null) {
            panel.add(
                JLabel("Build apps/host-webview before running the IntelliJ plugin."),
                BorderLayout.CENTER,
            )
            return panel
        }

        project.messageBus.connect(disposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    val file = event.newFile ?: return
                    if (file.extension.equals("dbml", ignoreCase = true)) {
                        handler.refresh(file)
                    }
                }
            },
        )

        browser.loadHTML(html)
        panel.add(browser.component, BorderLayout.CENTER)
        return panel
    }
```

Change the `HostMessageHandler` construction line and add a document-listener subscription right after the existing `FileEditorManagerListener` subscription:

```kotlin
    private fun createBrowserPanel(project: Project, disposable: com.intellij.openapi.Disposable): JPanel {
        val panel = JPanel(BorderLayout())
        val browser = JBCefBrowser()
        val query = JBCefJSQuery.create(browser as JBCefBrowserBase)
        val handler = HostMessageHandler(project, browser, disposable)

        Disposer.register(disposable, browser)
        Disposer.register(disposable, query)

        query.addHandler { request ->
            handler.handle(request)
            null
        }

        val html = loadBundledWebviewHtml(query)
        if (html == null) {
            panel.add(
                JLabel("Build apps/host-webview before running the IntelliJ plugin."),
                BorderLayout.CENTER,
            )
            return panel
        }

        project.messageBus.connect(disposable).subscribe(
            FileEditorManagerListener.FILE_EDITOR_MANAGER,
            object : FileEditorManagerListener {
                override fun selectionChanged(event: FileEditorManagerEvent) {
                    val file = event.newFile ?: return
                    if (file.extension.equals("dbml", ignoreCase = true)) {
                        handler.refresh(file)
                    }
                }
            },
        )

        EditorFactory.getInstance().eventMulticaster.addDocumentListener(
            object : DocumentListener {
                override fun documentChanged(event: DocumentEvent) {
                    handler.onDocumentChanged(event.document)
                }
            },
            disposable,
        )

        browser.loadHTML(html)
        panel.add(browser.component, BorderLayout.CENTER)
        return panel
    }
```

- [ ] **Step 3: Add the `disposable` param, `refreshAlarm` field, and `onDocumentChanged` method to `HostMessageHandler`**

The current class declaration and fields (lines 122-131) read:

```kotlin
private class HostMessageHandler(
    private val project: Project,
    private val browser: JBCefBrowser,
) {
    @Volatile
    private var webviewReady = false

    @Volatile
    private var currentFile: VirtualFile? = null

    fun handle(rawMessage: String) {
```

Replace with:

```kotlin
private class HostMessageHandler(
    private val project: Project,
    private val browser: JBCefBrowser,
    disposable: com.intellij.openapi.Disposable,
) {
    @Volatile
    private var webviewReady = false

    @Volatile
    private var currentFile: VirtualFile? = null

    private val refreshAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, disposable)

    fun onDocumentChanged(document: Document) {
        val file = currentFile ?: return
        val changedFile = FileDocumentManager.getInstance().getFile(document) ?: return
        if (changedFile != file) return

        refreshAlarm.cancelAllRequests()
        refreshAlarm.addRequest({ if (currentFile == file) refresh(file) }, 250)
    }

    fun handle(rawMessage: String) {
```

Notes on this step:
- The re-check `if (currentFile == file)` inside the scheduled request guards against the tab having switched away from `file` during the 250ms window — it prevents an out-of-date refresh from clobbering whatever the tool window is now showing.
- `refresh()` itself is untouched (still at `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt:146` after these edits shift line numbers slightly) — this task only changes what schedules a call to it.

- [ ] **Step 4: Compile-check**

Run:

```bash
cd apps/intellij-plugin && ./gradlew compileKotlin
```

Expected: `BUILD SUCCESSFUL`. If it fails, the most likely cause is a missing import or a mismatched `Alarm`/`DocumentListener` signature — re-check Step 1 and Step 3 against the exact code shown above.

- [ ] **Step 5: Manual verification in a sandbox IDE**

This plugin has no Kotlin-side automated test suite (`apps/intellij-plugin/src` has no test directory), so this step is manual. Run:

```bash
npm run build:webview
cd apps/intellij-plugin
./gradlew runIde
```

In the launched sandbox IDE:
1. Open `examples/schema.dbml` (or any `.dbml` file) and open the DBML Canvas tool window.
2. Type a change directly in the source editor (e.g. add a column) and stop typing. Confirm the canvas updates roughly 250ms later without switching tabs.
3. Switch to a different file tab and back to the `.dbml` file — confirm the existing tab-switch refresh still works.
4. Edit a table/column Note from the canvas itself — confirm the existing Note-edit-triggered refresh still works.
5. Open a second, unrelated file and type in it — confirm the canvas does **not** refresh (the `currentFile` filter is working).

- [ ] **Step 6: Commit**

```bash
git add apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt
git commit -m "$(cat <<'EOF'
feat(intellij): live-refresh ERD canvas while typing DBML

Adds a debounced (250ms) IDE-wide document-change listener so the tool
window updates while the user types, instead of only on tab switch or
canvas-driven Note edits. web-sandbox and VS Code already had this.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** The spec's single required behavior (IntelliJ live-refreshes on typing, debounced ~250ms, without touching web-sandbox/VS Code or the `refresh()` pipeline) is fully covered by Task 1. The spec's edge cases (not-ready/no-file no-op, tab-switch during pending debounce, edits to unrelated files, disposal cleanup) are each addressed: no-op is inherited from unchanged `refresh()`; tab-switch race is handled by the `currentFile == file` re-check; unrelated-file edits are filtered by the `changedFile != file` check; disposal is handled because both the `Alarm` and the document listener are scoped to the existing `disposable`.
- **Placeholder scan:** No TBD/TODO markers; all steps contain literal code.
- **Type consistency:** `onDocumentChanged(document: Document)` matches the `DocumentListener.documentChanged(event: DocumentEvent)` call site (`event.document`). `refresh(file: VirtualFile?)` signature is unchanged and called with a non-null `VirtualFile` in both the new and existing call sites.
