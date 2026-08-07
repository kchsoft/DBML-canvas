import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DbmlCoreSchemaParser,
  applyDbmlTextEdit,
  createDbmlNoteEdit,
} from '../dist/index.js';

const parser = new DbmlCoreSchemaParser();

function tableTarget(source, tableName = 'members') {
  const table = parser.parse(source).tables.find((candidate) => candidate.name === tableName);
  assert.ok(table?.source);
  return {
    kind: 'table',
    id: table.id,
    source: table.source,
    ...(table.noteSource ? { noteSource: table.noteSource } : {}),
  };
}

function columnTarget(source, columnName) {
  const column = parser.parse(source).tables[0].columns
    .find((candidate) => candidate.name === columnName);
  assert.ok(column?.source);
  return {
    kind: 'column',
    id: column.id,
    source: column.source,
    ...(column.noteSource ? { noteSource: column.noteSource } : {}),
  };
}

test('replaces a column Note with escaped multiline text', () => {
  const source = `Table members {
  email varchar(255) [not null, note: 'Login email']
}
`;
  const edit = createDbmlNoteEdit(
    source,
    columnTarget(source, 'email'),
    "Owner's login\naddress",
  );
  const updated = applyDbmlTextEdit(source, edit);

  assert.equal(parser.parse(updated).tables[0].columns[0].note, "Owner's login\naddress");
  assert.match(updated, /not null, note:/);
});

test('adds a column Note with and without an existing settings list', () => {
  const source = `Table members {
  email varchar(255) [unique]
  nickname varchar(50)
}
`;
  const withSettings = applyDbmlTextEdit(
    source,
    createDbmlNoteEdit(source, columnTarget(source, 'email'), 'Login address'),
  );
  assert.match(withSettings, /\[unique, note: 'Login address'\]/);

  const withoutSettings = applyDbmlTextEdit(
    source,
    createDbmlNoteEdit(source, columnTarget(source, 'nickname'), 'Public name'),
  );
  assert.match(withoutSettings, /nickname varchar\(50\) \[note: 'Public name'\]/);
  assert.equal(parser.parse(withoutSettings).tables[0].columns[1].note, 'Public name');
});

test('removes a column Note without leaving a dangling separator', () => {
  const source = `Table members {
  email varchar(255) [not null, note: 'Login email', unique]
}
`;
  const updated = applyDbmlTextEdit(
    source,
    createDbmlNoteEdit(source, columnTarget(source, 'email'), ''),
  );

  assert.match(updated, /\[not null, unique\]/);
  assert.doesNotMatch(updated, /note:/i);
  assert.doesNotThrow(() => parser.parse(updated));
});

test('creates, replaces, and removes a table Note before the closing brace', () => {
  const source = `Table members {
  id bigint [pk]
}
`;
  const created = applyDbmlTextEdit(
    source,
    createDbmlNoteEdit(source, tableTarget(source), 'Member aggregate'),
  );
  assert.match(created, /  Note: 'Member aggregate'\n}/);
  assert.equal(parser.parse(created).tables[0].note, 'Member aggregate');

  const replaced = applyDbmlTextEdit(
    created,
    createDbmlNoteEdit(created, tableTarget(created), 'Authentication root'),
  );
  assert.equal(parser.parse(replaced).tables[0].note, 'Authentication root');

  const removed = applyDbmlTextEdit(
    replaced,
    createDbmlNoteEdit(replaced, tableTarget(replaced), '   '),
  );
  assert.equal(removed, source);
});

test('rejects stale text edits instead of overwriting changed source', () => {
  const source = `Table members {
  email varchar(255) [note: 'Login email']
}
`;
  const edit = createDbmlNoteEdit(source, columnTarget(source, 'email'), 'Account address');
  const changed = source.replace("note: 'Login email'", "note: 'Changed elsewhere'");

  assert.throws(() => applyDbmlTextEdit(changed, edit), /source changed/i);
});
