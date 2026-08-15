// Minimal stand-in for the `vscode` module, covering only the API surface
// src/extension.ts touches. Lets extension.ts run under plain Node for tests
// instead of requiring the real Extension Development Host.
export class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
export class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
}
export class Selection extends Range {}
export class WorkspaceEdit {
  edits = [];
  replace(uri, range, text) {
    this.edits.push({ uri, range, text });
  }
}
export class Uri {
  static file(path) {
    return { fsPath: path, scheme: 'file', toString: () => `file://${path}` };
  }
  static joinPath(base, ...parts) {
    return Uri.file([base.fsPath, ...parts].join('/'));
  }
}
export class RelativePattern {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
}
export const ViewColumn = { Beside: -2, One: 1 };
export const TextEditorRevealType = { InCenter: 2 };
export const ColorThemeKind = { Light: 1, Dark: 2, HighContrast: 3 };

export const window = {
  activeTextEditor: undefined,
  activeColorTheme: { kind: ColorThemeKind.Dark },
  panels: [],
  createWebviewPanel(_id, title) {
    const listeners = [];
    const disposeListeners = [];
    let disposed = false;
    const panel = {
      title,
      webview: {
        cspSource: 'vscode-webview:',
        html: '',
        messages: [],
        onDidReceiveMessage(callback) {
          listeners.push(callback);
          return { dispose() {} };
        },
        postMessage(message) {
          this.messages.push(message);
          return Promise.resolve(true);
        },
        asWebviewUri: (uri) => ({ toString: () => `vscode-webview://fake${uri.fsPath}` }),
      },
      listeners,
      onDidDispose(callback) {
        disposeListeners.push(callback);
        return { dispose() {} };
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const listener of disposeListeners) listener();
      },
    };
    window.panels.push(panel);
    return panel;
  },
  showTextDocument: async () => ({ selection: undefined, revealRange() {} }),
  showErrorMessage: async () => {},
  showWarningMessage: async () => {},
};

export const workspace = {
  watchers: [],
  documentChangeListeners: [],
  externalDocument: undefined,
  onDidChangeTextDocument(callback) {
    workspace.documentChangeListeners.push(callback);
    return {
      dispose() {
        const index = workspace.documentChangeListeners.indexOf(callback);
        if (index >= 0) workspace.documentChangeListeners.splice(index, 1);
      },
    };
  },
  createFileSystemWatcher(pattern) {
    const changeListeners = [];
    const createListeners = [];
    let disposed = false;
    const watcher = {
      pattern,
      onDidChange(callback) {
        changeListeners.push(callback);
        return { dispose() {} };
      },
      onDidCreate(callback) {
        createListeners.push(callback);
        return { dispose() {} };
      },
      fireChange(uri) {
        if (disposed) return;
        for (const listener of changeListeners) listener(uri);
      },
      fireCreate(uri) {
        if (disposed) return;
        for (const listener of createListeners) listener(uri);
      },
      dispose() {
        disposed = true;
        changeListeners.length = 0;
        createListeners.length = 0;
      },
    };
    workspace.watchers.push(watcher);
    return watcher;
  },
  openTextDocument: async () => workspace.externalDocument,
  applyEdit: async (edit) => {
    workspace.lastAppliedEdit = edit;
    return true;
  },
  fs: {
    readFile: async () => {
      throw new Error('no layout file');
    },
    writeFile: async () => {},
  },
};

export const commands = {
  registry: new Map(),
  registerCommand(id, callback) {
    commands.registry.set(id, callback);
    return { dispose() {} };
  },
};
