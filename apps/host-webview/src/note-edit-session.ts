import {
  DbmlCoreSchemaParser,
  applyDbmlTextEdit,
  createDbmlNoteEdit,
  type DbmlNoteTarget,
  type HostEditNoteResultMessage,
  type WebviewEditNoteMessage,
} from '@dbml-canvas/core';

const parser = new DbmlCoreSchemaParser();
let fallbackRequestOrdinal = 0;

export function createNoteEditRequest(
  source: string,
  revision: string,
  target: DbmlNoteTarget,
  note: string,
  requestId: string,
): WebviewEditNoteMessage {
  const edit = createDbmlNoteEdit(source, target, note);
  parser.parse(applyDbmlTextEdit(source, edit));
  return {
    type: 'webview/edit-note',
    payload: {
      requestId,
      revision,
      target: { kind: target.kind, id: target.id },
      note,
      edit,
    },
  };
}

export function createNoteEditSession(
  postMessage: (message: WebviewEditNoteMessage) => void,
  createRequestId: () => string = defaultRequestId,
) {
  const pending = new Map<string, {
    resolve: () => void;
    reject: (cause: Error) => void;
  }>();

  return {
    request(
      source: string,
      revision: string,
      target: DbmlNoteTarget,
      note: string,
    ): Promise<void> {
      const requestId = createRequestId();
      const message = createNoteEditRequest(source, revision, target, note, requestId);
      return new Promise<void>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        try {
          postMessage(message);
        } catch (cause) {
          pending.delete(requestId);
          reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      });
    },

    settle(message: HostEditNoteResultMessage): boolean {
      const entry = pending.get(message.payload.requestId);
      if (!entry) return false;
      pending.delete(message.payload.requestId);
      if (message.payload.ok) entry.resolve();
      else entry.reject(new Error(message.payload.message ?? 'The DBML Note could not be saved.'));
      return true;
    },
  };
}

function defaultRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  fallbackRequestOrdinal += 1;
  return `dbml-note-${Date.now()}-${fallbackRequestOrdinal}`;
}
