import assert from 'node:assert/strict';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../dist/extension.js';

const schemaPath = '/workspace/schema.dbml';
const source = `Table member {\n  id bigint [pk]\n  email varchar(255) [unique, note: 'Login address']\n}\n`;

function makeDocument(text = source, version = 1) {
  return {
    uri: vscode.Uri.file(schemaPath),
    fileName: schemaPath,
    version,
    getText: () => text,
    positionAt: (offset) => {
      const before = text.slice(0, offset);
      const lines = before.split('\n');
      return new vscode.Position(lines.length - 1, lines.at(-1).length);
    },
  };
}

async function openPreview(document) {
  vscode.window.activeTextEditor = { document };
  const context = { extensionUri: vscode.Uri.file(`${import.meta.dirname}/..`), subscriptions: [] };

  activate(context);
  const command = vscode.commands.registry.get('dbmlCanvas.openPreview');
  assert.ok(command, 'command is registered on activation');

  await command();
  const preview = context.subscriptions.find((subscription) => subscription?.panel);
  assert.ok(preview, 'opening the command creates a preview panel');
  return preview.panel;
}

test('open preview warns instead of throwing when no .dbml file is active', async () => {
  vscode.window.activeTextEditor = undefined;
  const context = { extensionUri: vscode.Uri.file(`${import.meta.dirname}/..`), subscriptions: [] };
  activate(context);

  await assert.doesNotReject(() => vscode.commands.registry.get('dbmlCanvas.openPreview')());
});

test('opening a .dbml file renders a CSP- and nonce-wrapped webview', async () => {
  const panel = await openPreview(makeDocument());

  assert.match(panel.webview.html, /Content-Security-Policy/);
  assert.match(panel.webview.html, /nonce="[A-Za-z0-9]{32}"/);
});

test('closing a preview during HTML loading does not install late watchers or listeners', async () => {
  const document = makeDocument();
  vscode.window.activeTextEditor = { document };
  const context = { extensionUri: vscode.Uri.file(`${import.meta.dirname}/..`), subscriptions: [] };
  const watcherCount = vscode.workspace.watchers.length;
  const documentListenerCount = vscode.workspace.documentChangeListeners.length;
  activate(context);

  const opening = vscode.commands.registry.get('dbmlCanvas.openPreview')();
  const panel = vscode.window.panels.at(-1);
  assert.ok(panel, 'panel is created before its HTML finishes loading');
  panel.dispose();
  await opening;

  assert.equal(vscode.workspace.watchers.length, watcherCount);
  assert.equal(vscode.workspace.documentChangeListeners.length, documentListenerCount);
});

test('webview/ready triggers the initial document and theme messages', async () => {
  const panel = await openPreview(makeDocument());
  await panel.listeners[0]({ type: 'webview/ready' });

  const load = panel.webview.messages.find((message) => message.type === 'host/load');
  assert.ok(load, 'sends a host/load message');
  assert.equal(load.payload.source, source);

  const theme = panel.webview.messages.find((message) => message.type === 'host/set-theme');
  assert.ok(theme, 'sends a host/set-theme message');
});

test('webview/save-layout round-trips through parseLayout/serializeLayout without throwing', async () => {
  const panel = await openPreview(makeDocument());
  await panel.listeners[0]({ type: 'webview/ready' });

  await assert.doesNotReject(() =>
    panel.listeners[0]({
      type: 'webview/save-layout',
      payload: { layout: { version: 1, nodes: { 'public.member': { x: 10, y: 20 } }, viewport: { x: 0, y: 0, zoom: 1 } } },
    }),
  );
});

test('webview/edit-note rejects a stale revision instead of applying the edit', async () => {
  const document = makeDocument();
  const panel = await openPreview(document);
  await panel.listeners[0]({ type: 'webview/ready' });
  panel.webview.messages.length = 0;

  await panel.listeners[0]({
    type: 'webview/edit-note',
    payload: {
      requestId: 'req-1',
      revision: String(document.version + 1),
      edit: { startOffset: 0, endOffset: 0, expectedText: '', newText: '' },
    },
  });

  const result = panel.webview.messages.find((message) => message.type === 'host/edit-note-result');
  assert.ok(result);
  assert.equal(result.payload.ok, false);
});

test('external DBML changes reload a closed document into the existing preview', async () => {
  const document = makeDocument();
  const panel = await openPreview(document);
  await panel.listeners[0]({ type: 'webview/ready' });
  panel.webview.messages.length = 0;

  const watcher = vscode.workspace.watchers.at(-1);
  assert.ok(watcher, 'opening a preview creates a file watcher');
  assert.equal(watcher.pattern.base.fsPath, schemaPath);
  assert.equal(watcher.pattern.pattern, '*');

  const editorSource = `${source}\nTable draft {\n  id bigint [pk]\n}\n`;
  const documentListener = vscode.workspace.documentChangeListeners.at(-1);
  assert.ok(documentListener, 'opening a preview subscribes to document changes');
  documentListener({ document: makeDocument(editorSource, 2) });
  await new Promise((resolve) => setTimeout(resolve, 25));

  const intermediateSource = `${editorSource}\nTable audit_log {\n  id bigint [pk]\n}\n`;
  vscode.workspace.externalDocument = makeDocument(intermediateSource, 3);
  watcher.fireChange(document.uri);
  await new Promise((resolve) => setTimeout(resolve, 25));

  const updatedSource = `${intermediateSource}\nTable audit_item {\n  id bigint [pk]\n}\n`;
  vscode.workspace.externalDocument = makeDocument(updatedSource, 4);
  watcher.fireCreate(document.uri);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const loads = panel.webview.messages.filter((message) => message.type === 'host/load');
  assert.equal(loads.length, 1, 'rapid external writes are debounced into one refresh');
  const [load] = loads;
  assert.ok(load, 'external changes send a new host/load message');
  assert.equal(load.payload.source, updatedSource);
  assert.equal(load.payload.revision, '4');
});

test('closing a preview during its initial load prevents late theme delivery', async () => {
  const originalReadFile = vscode.workspace.fs.readFile;
  let finishLayoutRead;
  vscode.workspace.fs.readFile = () => new Promise((resolve) => {
    finishLayoutRead = resolve;
  });

  try {
    const panel = await openPreview(makeDocument());
    const ready = panel.listeners[0]({ type: 'webview/ready' });
    panel.dispose();
    finishLayoutRead(new TextEncoder().encode('{"version":1,"nodes":{}}'));
    await ready;

    assert.equal(panel.webview.messages.length, 0);
  } finally {
    vscode.workspace.fs.readFile = originalReadFile;
  }
});

test('closing a preview during a note edit prevents a late edit result', async () => {
  const originalApplyEdit = vscode.workspace.applyEdit;
  let finishEdit;
  vscode.workspace.applyEdit = () => new Promise((resolve) => {
    finishEdit = resolve;
  });

  try {
    const document = makeDocument();
    const panel = await openPreview(document);
    await panel.listeners[0]({ type: 'webview/ready' });
    panel.webview.messages.length = 0;

    const edit = panel.listeners[0]({
      type: 'webview/edit-note',
      payload: {
        requestId: 'req-late',
        revision: String(document.version),
        edit: { startOffset: 0, endOffset: 0, expectedText: '', newText: ' ' },
      },
    });
    panel.dispose();
    finishEdit(true);
    await edit;

    assert.equal(panel.webview.messages.length, 0);
  } finally {
    vscode.workspace.applyEdit = originalApplyEdit;
  }
});
