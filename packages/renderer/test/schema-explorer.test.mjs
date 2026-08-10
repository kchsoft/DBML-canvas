import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSchemaExplorerResults,
  findTextMatchRanges,
  normalizeSchemaQuery,
  reconcileExpandedTableIds,
  reconcileSchemaSearchSelection,
} from '../dist/schema-explorer.js';

const column = (tableId, name, id = `${tableId}.${name}`) => ({
  id,
  tableId,
  name,
  type: 'varchar',
  primaryKey: false,
  unique: false,
  nullable: true,
  increment: false,
});

const table = (id, displayName, columns) => ({
  id,
  schema: 'public',
  name: displayName,
  displayName,
  columns: columns.map((name) => column(id, name)),
  indexes: [],
});

const schema = {
  version: 1,
  enums: [],
  tables: [
    table('public.Teams', 'Teams', ['id', 'account_id']),
    table('public.accounts', 'accounts', ['id', 'DisplayName', 'owner_id']),
    table('public.AuditLog', 'AuditLog', ['id']),
  ],
  relationships: [],
  warnings: [],
};

test('normalizes whitespace and matches every case-insensitive substring', () => {
  assert.equal(normalizeSchemaQuery('  NAME  '), 'name');
  assert.deepEqual(findTextMatchRanges('DisplayNameName', 'name'), [
    { start: 7, end: 11 },
    { start: 11, end: 15 },
  ]);
  assert.deepEqual(findTextMatchRanges('고객이름', '이름'), [{ start: 2, end: 4 }]);
});

test('returns all tables sorted ascending or descending for an empty query', () => {
  assert.deepEqual(
    buildSchemaExplorerResults(schema, '   ', 'asc').map(({ table }) => table.id),
    ['public.accounts', 'public.AuditLog', 'public.Teams'],
  );
  assert.deepEqual(
    buildSchemaExplorerResults(schema, '', 'desc').map(({ table }) => table.id),
    ['public.Teams', 'public.AuditLog', 'public.accounts'],
  );
});

test('keeps table matches collapsed and auto-expands column matches with all columns', () => {
  const tableOnly = buildSchemaExplorerResults(schema, 'team', 'asc');
  assert.equal(tableOnly[0].autoExpanded, false);
  assert.deepEqual(tableOnly[0].tableMatchRanges, [{ start: 0, end: 4 }]);

  const columnMatch = buildSchemaExplorerResults(schema, 'owner', 'asc');
  assert.equal(columnMatch[0].table.id, 'public.accounts');
  assert.equal(columnMatch[0].autoExpanded, true);
  assert.deepEqual(columnMatch[0].columns.map(({ column }) => column.name), [
    'id', 'DisplayName', 'owner_id',
  ]);
  assert.deepEqual(columnMatch[0].matchingColumnIds, ['public.accounts.owner_id']);
});

test('retains a table once when it matches at table and column levels', () => {
  const overlapSchema = {
    ...schema,
    tables: [table('public.Accounts', 'Accounts', ['account_id']), ...schema.tables],
  };
  const results = buildSchemaExplorerResults(overlapSchema, 'account', 'asc');
  assert.deepEqual(results.map(({ table }) => table.id), ['public.Accounts', 'public.accounts', 'public.Teams']);
  assert.equal(results[0].table.id, 'public.Accounts');
  assert.equal(results[0].autoExpanded, true);
});

test('omits unmatched tables and preserves schema order for duplicate display names', () => {
  const duplicateSchema = {
    ...schema,
    tables: [
      table('public.zed', 'Same', ['first']),
      table('public.alpha', 'Same', ['second']),
      ...schema.tables,
    ],
  };
  assert.deepEqual(
    buildSchemaExplorerResults(duplicateSchema, 'same', 'asc').map(({ table }) => table.id),
    ['public.zed', 'public.alpha'],
  );
  assert.deepEqual(
    buildSchemaExplorerResults(duplicateSchema, 'same', 'desc').map(({ table }) => table.id),
    ['public.zed', 'public.alpha'],
  );
  assert.deepEqual(
    buildSchemaExplorerResults(schema, 'does-not-exist', 'asc'),
    [],
  );
});

test('prunes missing table IDs from expanded state', () => {
  assert.deepEqual(
    reconcileExpandedTableIds(schema, new Set(['public.accounts', 'public.missing'])),
    new Set(['public.accounts']),
  );
});

test('clears selections only when the referenced entity disappears', () => {
  assert.deepEqual(
    reconcileSchemaSearchSelection(schema, { kind: 'table', tableId: 'public.accounts' }),
    { kind: 'table', tableId: 'public.accounts' },
  );
  assert.deepEqual(
    reconcileSchemaSearchSelection(schema, {
      kind: 'column', tableId: 'public.accounts', columnId: 'public.accounts.owner_id',
    }),
    { kind: 'column', tableId: 'public.accounts', columnId: 'public.accounts.owner_id' },
  );
  assert.equal(
    reconcileSchemaSearchSelection(schema, { kind: 'table', tableId: 'public.missing' }),
    undefined,
  );
  assert.equal(
    reconcileSchemaSearchSelection(schema, {
      kind: 'column', tableId: 'public.accounts', columnId: 'public.accounts.missing',
    }),
    undefined,
  );
  assert.equal(reconcileSchemaSearchSelection(schema, undefined), undefined);
});
