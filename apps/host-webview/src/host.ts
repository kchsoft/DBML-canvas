import type { WebviewToHostMessage } from '@dbml-canvas/core';

declare global {
  interface Window {
    acquireVsCodeApi?: () => { postMessage(message: unknown): void };
    dbmlCanvasPostMessage?: (message: string) => void;
  }
}

const vscode = window.acquireVsCodeApi?.();

export function postToHost(message: WebviewToHostMessage): void {
  if (vscode) {
    vscode.postMessage(message);
    return;
  }

  if (window.dbmlCanvasPostMessage) {
    window.dbmlCanvasPostMessage(JSON.stringify(message));
    return;
  }

  console.info('[DBML Canvas host message]', message);
}
