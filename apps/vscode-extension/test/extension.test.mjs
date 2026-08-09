import assert from 'node:assert/strict';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../dist/extension.js';

const schemaPath = '/workspace/schema.dbml';
const source = `Table member {\n  id bigint [pk]\n  email varchar(255) [unique, note: 'Login address']\n}\n`;

function makeDocument() {
  return {
    uri: vscode.Uri.file(schemaPath),
    fileName: schemaPath,
    version: 1,
    getText: () => source,
    positionAt: (offset) => {
      const before = source.slice(0, offset);
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
