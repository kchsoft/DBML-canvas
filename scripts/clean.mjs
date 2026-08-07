import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const targets = [
  'packages/core/dist',
  'packages/renderer/dist',
  'apps/web-sandbox/dist',
  'apps/host-webview/dist',
  'apps/vscode-extension/dist',
  'apps/vscode-extension/media',
  'apps/intellij-plugin/build',
];

await Promise.all(targets.map((target) => rm(resolve(target), { recursive: true, force: true })));
