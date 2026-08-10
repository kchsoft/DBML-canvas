import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayout,
  DbmlCoreSchemaParser,
  mapDatabase,
  parseLayout,
  pruneLayout,
  serializeLayout,
  updateNodeAnnotation,
  updateNodeLayout,
} from '../dist/index.js';

const token = (start, end) => ({
  start: { line: 1, column: start + 1, offset: start },
  end: { line: 1, column: end + 1, offset: end },
});

test('maps dbml-core objects into stable ERD models', () => {
  const schema = mapDatabase({
    name: 'sample',
    schemas: [{
      name: 'public',
      tables: [
        {
          name: 'member',
          note: 'Member aggregate',
          noteToken: token(90, 114),
          fields: [
            { name: 'id', type: { type_name: 'bigint' }, pk: true, not_null: true },
            {
              name: 'email',
              type: { type_name: 'varchar(255)', args: '255' },
              unique: true,
              not_null: true,
              note: 'Login address',
              noteToken: token(42, 63),
              dbdefault: { value: 'unknown@example.com', type: 'string' },
            },
          ],
          indexes: [{
            name: 'uq_member_email',
            unique: true,
            columns: [{ value: 'email' }],
          }],
        },
        { name: 'answer', fields: [{ name: 'member_id', type: { type_name: 'bigint' }, not_null: true }] },
      ],
      refs: [{ endpoints: [
        { tableName: 'answer', schemaName: 'public', fieldNames: ['member_id'], relation: '*' },
        { tableName: 'member', schemaName: 'public', fieldNames: ['id'], relation: '1' },
      ] }],
    }],
  });

  assert.equal(schema.tables.length, 2);
  assert.equal(schema.relationships.length, 1);
  assert.equal(schema.tables[0].columns[0].type, 'bigint');
  assert.equal(schema.tables[0].columns[1].type, 'varchar(255)');
  assert.equal(schema.tables[0].columns[1].defaultValue, "'unknown@example.com'");
  assert.equal(schema.tables[0].columns[1].noteSource.start.offset, 42);
  assert.equal(schema.tables[0].noteSource.start.offset, 90);
  assert.deepEqual(schema.tables[0].indexes[0], {
    name: 'uq_member_email',
    members: [{ value: 'email' }],
    unique: true,
    primaryKey: false,
  });
});

test('maps resolved enum definitions and column associations in declaration order', () => {
  const statusEnum = {
    name: 'member_status',
    values: [
      { name: 'pending', note: { value: 'Awaiting review' } },
      { name: 'active' },
    ],
  };
  const schema = mapDatabase({
    schemas: [{
      name: 'account',
      enums: [statusEnum],
      tables: [{
        name: 'member',
        fields: [
          { name: 'status', type: { type_name: 'member_status' }, _enum: statusEnum },
          { name: 'external_type', type: { type_name: 'member_status' } },
        ],
      }],
      refs: [],
    }],
  });

  assert.deepEqual(schema.enums, [{
    id: 'account.member_status',
    schema: 'account',
    name: 'member_status',
    displayName: 'account.member_status',
    values: [
      { name: 'pending', note: 'Awaiting review' },
      { name: 'active' },
    ],
  }]);
  assert.equal(schema.tables[0].columns[0].enumId, 'account.member_status');
  assert.equal(schema.tables[0].columns[1].enumId, undefined);
});

test('skips malformed enum definitions and values with warnings', () => {
  const schema = mapDatabase({
    schemas: [{
      name: 'public',
      enums: [
        null,
        {
          name: 'status',
          values: [null, { name: 'active' }],
        },
      ],
      tables: [],
      refs: [],
    }],
  });

  assert.deepEqual(schema.enums, [{
    id: 'public.status',
    schema: 'public',
    name: 'status',
    displayName: 'status',
    values: [{ name: 'active' }],
  }]);
  assert.deepEqual(schema.warnings, [
    'Skipped an enum without a name in schema public.',
    'Skipped an unnamed value in enum public.status.',
  ]);
});

test('preserves a real parser resolved enum from another schema', () => {
  const schema = new DbmlCoreSchemaParser().parse(`
Enum account.member_status {
  pending [note: 'Awaiting review']
  active
}

Table member {
  status account.member_status
}
`);

  assert.equal(schema.enums[0].id, 'account.member_status');
  assert.deepEqual(schema.enums[0].values, [
    { name: 'pending', note: 'Awaiting review' },
    { name: 'active' },
  ]);
  assert.equal(schema.tables[0].columns[0].enumId, 'account.member_status');
});

test('merges, validates, updates, and prunes layout data', () => {
  const schema = mapDatabase({
    schemas: [{
      name: 'public',
      tables: [{ name: 'member', fields: [{ name: 'id', type: { type_name: 'bigint' } }] }],
      refs: [],
    }],
  });

  const merged = applyLayout(schema, { version: 1, nodes: { 'public.member': { x: 10, y: 20 } } });
  assert.deepEqual(merged['public.member'], { x: 10, y: 20 });

  const updated = updateNodeLayout({ version: 1, nodes: {} }, 'public.member', { x: 50, y: 70 });
  assert.equal(updated.nodes['public.member'].y, 70);

  const parsed = parseLayout({
    version: 1,
    nodes: {
      valid: { x: 1, y: 2, color: 'purple', memo: 'Review before launch' },
      invalid: { x: 'x', y: 1 },
      invalidColor: { x: 3, y: 4, color: 'teal', memo: 42 },
    },
  });
  assert.deepEqual(parsed.nodes.valid, {
    x: 1,
    y: 2,
    color: 'purple',
  });
  assert.equal(parsed.nodes.invalid, undefined);
  assert.deepEqual(parsed.nodes.invalidColor, { x: 3, y: 4 });

  const annotated = updateNodeAnnotation(
    { version: 1, nodes: {} },
    'public.member',
    { x: 50, y: 70 },
    { color: 'blue' },
  );
  assert.deepEqual(annotated.nodes['public.member'], {
    x: 50,
    y: 70,
    color: 'blue',
  });

  const resetAnnotation = updateNodeAnnotation(
    annotated,
    'public.member',
    { x: 50, y: 70 },
    { color: null },
  );
  assert.deepEqual(resetAnnotation.nodes['public.member'], { x: 50, y: 70 });
  assert.doesNotMatch(serializeLayout(parsed), /memo/);

  const pruned = pruneLayout({
    version: 1,
    nodes: { 'public.member': { x: 1, y: 1 }, missing: { x: 2, y: 2 } },
  }, schema);
  assert.equal(pruned.nodes.missing, undefined);
});
