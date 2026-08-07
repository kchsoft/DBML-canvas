import type { ErdLayout } from './layout.js';
import type { SourceRange } from './model.js';
import type { DbmlTextEdit } from './note-edit.js';

export interface HostLoadMessage {
  type: 'host/load';
  payload: {
    source: string;
    revision: string;
    filepath?: string;
    layout: ErdLayout;
    title?: string;
  };
}

export interface HostSetThemeMessage {
  type: 'host/set-theme';
  payload: {
    theme: 'light' | 'dark';
  };
}

export interface HostEditNoteResultMessage {
  type: 'host/edit-note-result';
  payload: {
    requestId: string;
    ok: boolean;
    message?: string;
  };
}

export type HostToWebviewMessage =
  | HostLoadMessage
  | HostSetThemeMessage
  | HostEditNoteResultMessage;

export interface WebviewReadyMessage {
  type: 'webview/ready';
}

export interface WebviewSaveLayoutMessage {
  type: 'webview/save-layout';
  payload: {
    layout: ErdLayout;
  };
}

export interface WebviewOpenSourceMessage {
  type: 'webview/open-source';
  payload: {
    range: SourceRange;
  };
}

export interface WebviewErrorMessage {
  type: 'webview/error';
  payload: {
    message: string;
  };
}

export interface WebviewEditNoteMessage {
  type: 'webview/edit-note';
  payload: {
    requestId: string;
    revision: string;
    target: {
      kind: 'table' | 'column';
      id: string;
    };
    note: string;
    edit: DbmlTextEdit;
  };
}

export type WebviewToHostMessage =
  | WebviewReadyMessage
  | WebviewSaveLayoutMessage
  | WebviewOpenSourceMessage
  | WebviewEditNoteMessage
  | WebviewErrorMessage;
