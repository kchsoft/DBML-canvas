import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchemaDetails } from '../dist/schema-details.js';

const schema = {
  version: 1,
  enums: [{
    id: 'public.member_status',
    schema: 'public',
    name: 'member_status',
    displayName: 'member_status',
    values: [
      { name: 'pending', note: 'Awaiting review' },
      { name: 'active' },
    ],
  }],
  tables: [
    {
      id: 'public.members',
      schema: 'public',
      name: 'members',
      displayName: 'members',
      note: 'Member aggregate',
      indexes: [{
        name: 'uq_members_email',
        members: [{ value: 'email' }],
        unique: true,
        primaryKey: false,
      }],
      columns: [
        {
          id: 'public.members.id', tableId: 'public.members', name: 'id', type: 'bigint',
          primaryKey: true, unique: false, nullable: false, increment: true,
        },
        {
          id: 'public.members.email', tableId: 'public.members', name: 'email', type: 'varchar(255)',
          primaryKey: false, unique: true, nullable: false, increment: false,
          defaultValue: "'unknown@example.com'", note: 'Login address',
        },
        {
          id: 'public.members.status', tableId: 'public.members', name: 'status', type: 'member_status',
          primaryKey: false, unique: false, nullable: false, increment: false,
          enumId: 'public.member_status',
        },
        {
          id: 'public.members.external_status', tableId: 'public.members', name: 'external_status',
          type: 'member_status', primaryKey: false, unique: false, nullable: true, increment: false,
        },
      ],
    },
    {
      id: 'public.posts',
      schema: 'public',
      name: 'posts',
      displayName: 'posts',
      indexes: [],
      columns: [
        {
          id: 'public.posts.id', tableId: 'public.posts', name: 'id', type: 'bigint',
          primaryKey: true, unique: false, nullable: false, increment: true,
        },
        {
          id: 'public.posts.member_id', tableId: 'public.posts', name: 'member_id', type: 'bigint',
          primaryKey: false, unique: false, nullable: false, increment: false,
        },
      ],
    },
    {
      id: 'public.aliases',
      schema: 'public',
      name: 'aliases',
      displayName: 'aliases',
      indexes: [],
      columns: [{
        id: 'public.aliases.id', tableId: 'public.aliases', name: 'id', type: 'bigint',
        primaryKey: true, unique: false, nullable: false, increment: false,
      }],
    },
  ],
  relationships: [
    {
      id: 'posts-member',
      source: { tableId: 'public.posts', columnIds: ['public.posts.member_id'], cardinality: '*' },
      target: { tableId: 'public.members', columnIds: ['public.members.id'], cardinality: '1' },
    },
    {
      id: 'ambiguous-one-to-one',
      source: { tableId: 'public.members', columnIds: ['public.members.id'], cardinality: '1' },
      target: { tableId: 'public.aliases', columnIds: ['public.aliases.id'], cardinality: '1' },
    },
  ],
  warnings: [],
};

test('derives compact and detailed constraints without marking referenced keys as foreign', () => {
  const details = createSchemaDetails(schema);

  assert.deepEqual(
    details['public.posts'].columns['public.posts.member_id'].compactLabels,
    ['FK'],
  );
  assert.deepEqual(
    details['public.members'].columns['public.members.id'].compactLabels,
    ['PK'],
  );
  assert.deepEqual(
    details['public.members'].columns['public.members.email'].compactLabels,
    ['UNIQUE'],
  );
  assert.deepEqual(
    details['public.posts'].columns['public.posts.id'].fullConstraints,
    ['PRIMARY KEY', 'AUTO INCREMENT', 'NOT NULL'],
  );
  assert.deepEqual(
    details['public.aliases'].columns['public.aliases.id'].compactLabels,
    ['PK'],
  );
});

test('includes notes, defaults, indexes, and referenced column information', () => {
  const details = createSchemaDetails(schema);
  const members = details['public.members'];
  const email = members.columns['public.members.email'];
  const memberId = details['public.posts'].columns['public.posts.member_id'];

  assert.equal(members.note, 'Member aggregate');
  assert.equal(members.indexes[0].name, 'uq_members_email');
  assert.equal(email.note, 'Login address');
  assert.equal(email.defaultValue, "'unknown@example.com'");
  assert.equal(email.indexes[0].name, 'uq_members_email');
  assert.deepEqual(memberId.foreignKeys, [{
    tableId: 'public.members',
    tableName: 'members',
    columnIds: ['public.members.id'],
    columnNames: ['id'],
  }]);
});

test('attaches ordered enum values only to parser-resolved enum columns', () => {
  const details = createSchemaDetails(schema);

  assert.deepEqual(details['public.members'].columns['public.members.status'].enum, {
    id: 'public.member_status',
    name: 'member_status',
    values: [
      { name: 'pending', note: 'Awaiting review' },
      { name: 'active' },
    ],
  });
  assert.equal(
    details['public.members'].columns['public.members.external_status'].enum,
    undefined,
  );
});
