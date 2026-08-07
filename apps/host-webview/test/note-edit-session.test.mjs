import assert from 'node:assert/strict';
import test from 'node:test';
import { DbmlCoreSchemaParser, applyDbmlTextEdit } from '@dbml-canvas/core';
import {
  createNoteEditRequest,
  createNoteEditSession,
} from '../src/note-edit-session.ts';

const parser = new DbmlCoreSchemaParser();

function fixture() {
  const source = `Table members {
  Note: 'Member aggregate'
  id bigint [pk]
}
`;
  const table = parser.parse(source).tables[0];
  assert.ok(table.source && table.noteSource);
  return {
    source,
    target: {
      kind: 'table',
      id: table.id,
      source: table.source,
      noteSource: table.noteSource,
    },
  };
}

test('creates a revision-bound request whose edit remains valid DBML', () => {
  const { source, target } = fixture();
  const request = createNoteEditRequest(
    source,
    '17',
    target,
    'Authentication root',
    'request-1',
  );

  assert.equal(request.payload.revision, '17');
  assert.equal(request.payload.target.id, target.id);
  assert.equal(request.payload.requestId, 'request-1');
  assert.doesNotThrow(() => parser.parse(applyDbmlTextEdit(source, request.payload.edit)));
});

test('settles only the matching host request and surfaces host failures', async () => {
  const { source, target } = fixture();
  const sent = [];
  let ordinal = 0;
  const session = createNoteEditSession(
    (message) => sent.push(message),
    () => `request-${++ordinal}`,
  );

  const success = session.request(source, '17', target, 'Updated note');
  assert.equal(sent[0].payload.requestId, 'request-1');
  assert.equal(session.settle({
    type: 'host/edit-note-result',
    payload: { requestId: 'unrelated', ok: true },
  }), false);
  assert.equal(session.settle({
    type: 'host/edit-note-result',
    payload: { requestId: 'request-1', ok: true },
  }), true);
  await success;

  const failure = session.request(source, '18', target, 'Rejected note');
  session.settle({
    type: 'host/edit-note-result',
    payload: { requestId: 'request-2', ok: false, message: 'The DBML file changed.' },
  });
  await assert.rejects(failure, /file changed/i);
});
