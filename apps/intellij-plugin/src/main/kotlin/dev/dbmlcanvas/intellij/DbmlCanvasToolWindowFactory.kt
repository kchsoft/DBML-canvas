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
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.util.Alarm
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

class DbmlCanvasToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = JPanel(BorderLayout())
        val disposable = Disposer.newDisposable("DBML Canvas tool window")

        if (!JBCefApp.isSupported()) {
            panel.add(JLabel("DBML Canvas requires JCEF support in the running IDE."), BorderLayout.CENTER)
        } else {
            val browserPanel = createBrowserPanel(project, disposable)
            panel.add(browserPanel, BorderLayout.CENTER)
        }

        val content = ContentFactory.getInstance().createContent(panel, "", false)
        content.setDisposer(disposable)
        toolWindow.contentManager.addContent(content)
    }

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

    private fun loadBundledWebviewHtml(query: JBCefJSQuery): String? {
        var html = readResource("webview/index.html") ?: return null

        html = Regex("""<link\b[^>]*href=["']\./([^"']+\.css)["'][^>]*>""")
            .replace(html) { match ->
                val css = readResource("webview/${match.groupValues[1]}") ?: ""
                "<style>$css</style>"
            }

        html = Regex("""<script\b[^>]*src=["']\./([^"']+\.js)["'][^>]*></script>""")
            .replace(html) { match ->
                val javascript = readResource("webview/${match.groupValues[1]}")
                    ?.replace("</script", "<\\/script")
                    ?: ""
                "<script type=\"module\">$javascript</script>"
            }

        val bridge = """
            <script>
              window.dbmlCanvasPostMessage = function(message) {
                ${query.inject("message")}
              };
            </script>
        """.trimIndent()

        return html.replace("<head>", "<head>\n$bridge", ignoreCase = true)
    }

    private fun readResource(path: String): String? =
        DbmlCanvasToolWindowFactory::class.java.classLoader
            .getResourceAsStream(path)
            ?.bufferedReader(StandardCharsets.UTF_8)
            ?.use { it.readText() }
}

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
        val message = runCatching { JsonParser.parseString(rawMessage).asJsonObject }.getOrNull() ?: return
        when (message.string("type")) {
            "webview/ready" -> {
                webviewReady = true
                refresh(selectedDbmlFile())
                sendTheme()
            }
            "webview/save-layout" -> saveLayout(message)
            "webview/open-source" -> openSource(message)
            "webview/edit-note" -> editNote(message)
        }
    }

    fun refresh(file: VirtualFile?) {
        if (!webviewReady || file == null || !file.extension.equals("dbml", ignoreCase = true)) return
        currentFile = file

        ApplicationManager.getApplication().executeOnPooledThread {
            val snapshot = ApplicationManager.getApplication().runReadAction<Pair<String, String>> {
                val document = FileDocumentManager.getInstance().getDocument(file)
                if (document != null) {
                    document.text to document.modificationStamp.toString()
                } else {
                    String(file.contentsToByteArray(), StandardCharsets.UTF_8) to file.modificationStamp.toString()
                }
            }
            val layout = readLayout(file)
            val payload = JsonObject().apply {
                addProperty("source", snapshot.first)
                addProperty("revision", snapshot.second)
                addProperty("filepath", file.path)
                add("layout", layout)
                addProperty("title", "ERD: ${file.name}")
            }
            postMessage(JsonObject().apply {
                addProperty("type", "host/load")
                add("payload", payload)
            })
        }
    }

    private fun editNote(message: JsonObject) {
        val payload = message.objectValue("payload")
        val requestId = payload?.string("requestId") ?: return
        val revision = payload.string("revision")
        val edit = payload.objectValue("edit")
        val startOffset = edit?.intValue("startOffset")
        val endOffset = edit?.intValue("endOffset")
        val expectedText = edit?.string("expectedText")
        val newText = edit?.string("newText")
        val file = currentFile ?: selectedDbmlFile()

        if (revision == null
            || startOffset == null
            || endOffset == null
            || expectedText == null
            || newText == null
            || file == null
        ) {
            sendEditResult(requestId, false, "The DBML Note edit request is incomplete.")
            return
        }

        ApplicationManager.getApplication().invokeLater {
            val document = FileDocumentManager.getInstance().getDocument(file)
            if (document == null) {
                sendEditResult(requestId, false, "IntelliJ could not open the DBML document.")
                return@invokeLater
            }
            if (document.modificationStamp.toString() != revision
                || startOffset < 0
                || endOffset < startOffset
                || endOffset > document.textLength
                || document.getText(com.intellij.openapi.util.TextRange(startOffset, endOffset)) != expectedText
            ) {
                sendEditResult(
                    requestId,
                    false,
                    "The DBML file changed. Reopen the Note editor and try again.",
                )
                refresh(file)
                return@invokeLater
            }

            val failure = runCatching {
                WriteCommandAction.writeCommandAction(project)
                    .withName("Edit DBML Note")
                    .run<RuntimeException> {
                        document.replaceString(startOffset, endOffset, newText)
                        PsiDocumentManager.getInstance(project).commitDocument(document)
                    }
            }.exceptionOrNull()

            if (failure != null) {
                sendEditResult(
                    requestId,
                    false,
                    failure.message ?: "IntelliJ could not apply the DBML Note edit.",
                )
                return@invokeLater
            }

            sendEditResult(requestId, true)
            refresh(file)
        }
    }

    private fun sendEditResult(requestId: String, ok: Boolean, message: String? = null) {
        postMessage(JsonObject().apply {
            addProperty("type", "host/edit-note-result")
            add("payload", JsonObject().apply {
                addProperty("requestId", requestId)
                addProperty("ok", ok)
                if (message != null) addProperty("message", message)
            })
        })
    }

    private fun sendTheme() {
        postMessage(JsonObject().apply {
            addProperty("type", "host/set-theme")
            add("payload", JsonObject().apply {
                addProperty("theme", if (UIUtil.isUnderDarcula()) "dark" else "light")
            })
        })
    }

    private fun saveLayout(message: JsonObject) {
        val file = currentFile ?: selectedDbmlFile() ?: return
        val layout = message.objectValue("payload")?.get("layout") ?: return
        val bytes = "${layout}\n".toByteArray(StandardCharsets.UTF_8)

        ApplicationManager.getApplication().runWriteAction {
            val parent = file.parent ?: return@runWriteAction
            val layoutName = "${file.name}.layout.json"
            val layoutFile = parent.findChild(layoutName) ?: parent.createChildData(this, layoutName)
            layoutFile.setBinaryContent(bytes)
        }
    }

    private fun openSource(message: JsonObject) {
        val file = currentFile ?: selectedDbmlFile() ?: return
        val start = message.objectValue("payload")
            ?.objectValue("range")
            ?.objectValue("start")
            ?: return
        val line = (start.get("line")?.asInt ?: 1).coerceAtLeast(1) - 1
        val column = (start.get("column")?.asInt ?: 1).coerceAtLeast(1) - 1

        ApplicationManager.getApplication().invokeLater {
            FileEditorManager.getInstance(project).openTextEditor(
                OpenFileDescriptor(project, file, line, column),
                true,
            )
        }
    }

    private fun selectedDbmlFile(): VirtualFile? {
        var result: VirtualFile? = null
        val select = Runnable {
            result = FileEditorManager.getInstance(project).selectedFiles
                .firstOrNull { it.extension.equals("dbml", ignoreCase = true) }
        }

        if (ApplicationManager.getApplication().isDispatchThread) {
            select.run()
        } else {
            ApplicationManager.getApplication().invokeAndWait(select)
        }
        return result
    }

    private fun readLayout(file: VirtualFile): JsonObject {
        return ApplicationManager.getApplication().runReadAction<JsonObject> {
            val layoutFile = file.parent?.findChild("${file.name}.layout.json")
                ?: return@runReadAction emptyLayout()
            runCatching {
                JsonParser.parseString(
                    String(layoutFile.contentsToByteArray(), StandardCharsets.UTF_8),
                ).asJsonObject
            }.getOrElse { emptyLayout() }
        }
    }

    private fun postMessage(message: JsonObject) {
        val javascript = "window.postMessage(${message}, '*');"
        ApplicationManager.getApplication().invokeLater {
            browser.cefBrowser.executeJavaScript(javascript, browser.cefBrowser.url, 0)
        }
    }

    private fun emptyLayout(): JsonObject = JsonObject().apply {
        addProperty("version", 1)
        add("nodes", JsonObject())
    }
}

private fun JsonObject.string(name: String): String? = get(name)?.takeUnless { it.isJsonNull }?.asString
private fun JsonObject.intValue(name: String): Int? =
    get(name)?.takeUnless { it.isJsonNull }?.runCatching { asInt }?.getOrNull()
private fun JsonObject.objectValue(name: String): JsonObject? = get(name)?.takeIf { it.isJsonObject }?.asJsonObject
