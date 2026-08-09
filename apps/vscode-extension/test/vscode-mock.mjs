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
export const ViewColumn = { Beside: -2, One: 1 };
export const TextEditorRevealType = { InCenter: 2 };
export const ColorThemeKind = { Light: 1, Dark: 2, HighContrast: 3 };

export const window = {
  activeTextEditor: undefined,
  activeColorTheme: { kind: ColorThemeKind.Dark },
  createWebviewPanel(_id, title) {
    const listeners = [];
    return {
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
      dispose() {},
    };
  },
  showTextDocument: async () => ({ selection: undefined, revealRange() {} }),
  showErrorMessage: async () => {},
  showWarningMessage: async () => {},
};

export const workspace = {
  onDidChangeTextDocument() {
    return { dispose() {} };
  },
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
