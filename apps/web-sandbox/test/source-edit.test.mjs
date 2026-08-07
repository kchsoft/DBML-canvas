import assert from 'node:assert/strict';
import test from 'node:test';
import { DbmlCoreSchemaParser } from '@dbml-canvas/core';
import { applyValidatedNoteEdit } from '../src/source-edit.ts';

const parser = new DbmlCoreSchemaParser();

test('applies a Note edit only when the resulting DBML parses', () => {
  const source = `Table members {
  email varchar(255) [note: 'Login email']
}
`;
  const column = parser.parse(source).tables[0].columns[0];
  assert.ok(column.source);
  const target = {
    kind: 'column',
    id: column.id,
    source: column.source,
    noteSource: column.noteSource,
  };

  const updated = applyValidatedNoteEdit(source, target, 'Account address');
  assert.equal(parser.parse(updated).tables[0].columns[0].note, 'Account address');
});

test('rejects a stale Note target in the browser editor', () => {
  const source = `Table members {
  email varchar(255) [note: 'Login email']
}
`;
  const column = parser.parse(source).tables[0].columns[0];
  assert.ok(column.source && column.noteSource);
  const target = {
    kind: 'column',
    id: column.id,
    source: column.source,
    noteSource: column.noteSource,
  };
  const changed = source.replace("note: 'Login email'", "note: 'Changed elsewhere'");

  assert.throws(
    () => applyValidatedNoteEdit(changed, target, 'Account address'),
    /source changed/i,
  );
});
