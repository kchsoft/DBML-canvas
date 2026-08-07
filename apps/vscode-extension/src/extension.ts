import * as vscode from 'vscode';
import {
  parseLayout,
  serializeLayout,
  type ErdLayout,
  type HostToWebviewMessage,
  type WebviewEditNoteMessage,
  type WebviewToHostMessage,
} from '@dbml-canvas/core';
import { readFile } from 'node:fs/promises';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dbmlCanvas.openPreview', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document || document.uri.scheme !== 'file' || !document.fileName.endsWith('.dbml')) {
        await vscode.window.showWarningMessage('Open a local .dbml file first.');
        return;
      }

      const preview = new DbmlPreviewPanel(context, document);
      context.subscriptions.push(preview);
      await preview.open();
    }),
  );
}

export function deactivate(): void {}

class DbmlPreviewPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private ready = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly document: vscode.TextDocument,
  ) {}

  async open(): Promise<void> {
    this.panel = vscode.window.createWebviewPanel(
      'dbmlCanvas.preview',
      `ERD: ${this.document.fileName.split(/[\\/]/).at(-1)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      },
    );

    this.panel.webview.html = await getWebviewHtml(this.panel.webview, this.context.extensionUri);
    this.disposables.push(
      this.panel,
      this.panel.webview.onDidReceiveMessage((message: WebviewToHostMessage) => this.handleMessage(message)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === this.document.uri.toString()) void this.sendDocument();
      }),
    );
  }

  dispose(): void {
    while (this.disposables.length > 0) this.disposables.pop()?.dispose();
  }

  private async handleMessage(message: WebviewToHostMessage): Promise<void> {
    if (message.type === 'webview/ready') {
      this.ready = true;
      await this.sendDocument();
      await this.sendTheme();
      return;
    }

    if (message.type === 'webview/save-layout') {
      await this.saveLayout(message.payload.layout);
      return;
    }

    if (message.type === 'webview/open-source') {
      const line = Math.max(0, message.payload.range.start.line - 1);
      const column = Math.max(0, message.payload.range.start.column - 1);
      const editor = await vscode.window.showTextDocument(this.document, vscode.ViewColumn.One);
      const position = new vscode.Position(line, column);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return;
    }

    if (message.type === 'webview/edit-note') {
      await this.applyNoteEdit(message);
      return;
    }

    if (message.type === 'webview/error') {
      await vscode.window.showErrorMessage(`DBML Canvas: ${message.payload.message}`);
    }
  }

  private async sendDocument(): Promise<void> {
    if (!this.ready || !this.panel) return;
    const layout = await this.readLayout();
    const payload: HostToWebviewMessage = {
      type: 'host/load',
      payload: {
        source: this.document.getText(),
        revision: String(this.document.version),
        filepath: this.document.fileName,
        layout,
        title: `ERD: ${this.document.fileName.split(/[\\/]/).at(-1)}`,
      },
    };
    await this.panel.webview.postMessage(payload);
  }

  private async applyNoteEdit(message: WebviewEditNoteMessage): Promise<void> {
    const { requestId, revision, edit } = message.payload;
    try {
      if (String(this.document.version) !== revision) {
        throw new Error('The DBML file changed. Reopen the Note editor and try again.');
      }

      const source = this.document.getText();
      if (!Number.isInteger(edit.startOffset)
        || !Number.isInteger(edit.endOffset)
        || edit.startOffset < 0
        || edit.endOffset < edit.startOffset
        || edit.endOffset > source.length
        || source.slice(edit.startOffset, edit.endOffset) !== edit.expectedText) {
        throw new Error('The DBML file changed. Reopen the Note editor and try again.');
      }

      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.replace(
        this.document.uri,
        new vscode.Range(
          this.document.positionAt(edit.startOffset),
          this.document.positionAt(edit.endOffset),
        ),
        edit.newText,
      );
      const applied = await vscode.workspace.applyEdit(workspaceEdit);
      if (!applied) throw new Error('VS Code could not apply the DBML Note edit.');

      await this.panel?.webview.postMessage({
        type: 'host/edit-note-result',
        payload: { requestId, ok: true },
      } satisfies HostToWebviewMessage);
    } catch (cause) {
      await this.panel?.webview.postMessage({
        type: 'host/edit-note-result',
        payload: {
          requestId,
          ok: false,
          message: cause instanceof Error ? cause.message : String(cause),
        },
      } satisfies HostToWebviewMessage);
    }
  }

  private async sendTheme(): Promise<void> {
    if (!this.ready || !this.panel) return;
    const dark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
      || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
    await this.panel.webview.postMessage({
      type: 'host/set-theme',
      payload: { theme: dark ? 'dark' : 'light' },
    } satisfies HostToWebviewMessage);
  }

  private layoutUri(): vscode.Uri {
    return vscode.Uri.file(`${this.document.uri.fsPath}.layout.json`);
  }

  private async readLayout(): Promise<ErdLayout> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.layoutUri());
      return parseLayout(JSON.parse(new TextDecoder().decode(bytes)));
    } catch {
      return { version: 1, nodes: {} };
    }
  }

  private async saveLayout(layout: ErdLayout): Promise<void> {
    await vscode.workspace.fs.writeFile(
      this.layoutUri(),
      new TextEncoder().encode(serializeLayout(layout)),
    );
  }
}

async function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
  const indexUri = vscode.Uri.joinPath(mediaRoot, 'index.html');
  let html = await readFile(indexUri.fsPath, 'utf8');
  const nonce = createNonce();

  html = html.replaceAll(/(?:src|href)="\.\/(assets\/[^\"]+)"/g, (match, relative: string) => {
    const attribute = match.startsWith('src=') ? 'src' : 'href';
    const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, relative));
    return `${attribute}="${uri}"`;
  });

  html = html.replace(
    '<head>',
    `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">`,
  );
  html = html.replaceAll('<script ', `<script nonce="${nonce}" `);
  return html;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
