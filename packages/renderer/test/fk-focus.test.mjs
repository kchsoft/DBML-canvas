import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createColumnFkFocus,
  createEdgeFkFocus,
  deriveFkFocusPresentation,
  getFkEdgeFocusState,
  reconcileFkFocus,
} from '../dist/fk-focus.js';

const relationship = (id, sourceColumns, targetTableId, targetColumns) => ({
  id,
  source: {
    tableId: sourceColumns[0].split('.').slice(0, -1).join('.'),
    columnIds: sourceColumns,
    cardinality: '*',
  },
  target: {
    tableId: targetTableId,
    columnIds: targetColumns,
    cardinality: '1',
  },
});

const schema = {
  version: 1,
  tables: [],
  relationships: [
    relationship(
      'orders-account',
      ['public.orders.tenant_id', 'public.orders.account_id'],
      'public.accounts',
      ['public.accounts.tenant_id', 'public.accounts.id'],
    ),
    relationship(
      'orders-owner',
      ['public.orders.owner_id'],
      'public.users',
      ['public.users.id'],
    ),
    relationship(
      'orders-approver',
      ['public.orders.owner_id'],
      'public.users',
      ['public.users.approver_id'],
    ),
    relationship(
      'employee-manager',
      ['public.employees.manager_id'],
      'public.employees',
      ['public.employees.id'],
    ),
  ],
  warnings: [],
};

test('focuses every relationship containing a column in schema order', () => {
  assert.deepEqual(createColumnFkFocus(schema, 'public.orders.owner_id'), {
    kind: 'column',
    columnId: 'public.orders.owner_id',
    relationshipIds: ['orders-owner', 'orders-approver'],
  });
});

test('focuses a composite relationship from any member column', () => {
  const focus = createColumnFkFocus(schema, 'public.orders.tenant_id');
  assert.deepEqual(focus, {
    kind: 'column',
    columnId: 'public.orders.tenant_id',
    relationshipIds: ['orders-account'],
  });

  const presentation = deriveFkFocusPresentation(schema, focus);
  assert.deepEqual([...presentation.endpointColumnIds], [
    'public.orders.tenant_id',
    'public.orders.account_id',
    'public.accounts.tenant_id',
    'public.accounts.id',
  ]);
  assert.equal(presentation.activeColumnId, 'public.orders.tenant_id');
  assert.equal(getFkEdgeFocusState(presentation, 'orders-account'), 'focused');
  assert.equal(getFkEdgeFocusState(presentation, 'orders-owner'), 'dimmed');
});

test('creates one-edge focus and deduplicates self-reference endpoints', () => {
  const focus = createEdgeFkFocus(schema, 'employee-manager');
  assert.deepEqual(focus, {
    kind: 'edge',
    relationshipId: 'employee-manager',
    relationshipIds: ['employee-manager'],
  });

  const presentation = deriveFkFocusPresentation(schema, focus);
  assert.deepEqual([...presentation.endpointColumnIds], [
    'public.employees.manager_id',
    'public.employees.id',
  ]);
  assert.equal(presentation.activeColumnId, undefined);
});

test('returns no focus for unrelated columns and unknown relationships', () => {
  assert.equal(createColumnFkFocus(schema, 'public.orders.memo'), undefined);
  assert.equal(createEdgeFkFocus(schema, 'missing'), undefined);
});

test('reconciles focus against a replacement schema', () => {
  const ownerFocus = createColumnFkFocus(schema, 'public.orders.owner_id');
  const edgeFocus = createEdgeFkFocus(schema, 'orders-owner');
  const schemaWithoutOwner = {
    ...schema,
    relationships: schema.relationships.filter(({ id }) => (
      id !== 'orders-owner' && id !== 'orders-approver'
    )),
  };

  assert.equal(reconcileFkFocus(schemaWithoutOwner, ownerFocus), undefined);
  assert.equal(reconcileFkFocus(schemaWithoutOwner, edgeFocus), undefined);
});

test('keeps every edge idle when focus is absent', () => {
  const presentation = deriveFkFocusPresentation(schema, undefined);

  assert.deepEqual([...presentation.relationshipIds], []);
  assert.deepEqual([...presentation.endpointColumnIds], []);
  assert.equal(getFkEdgeFocusState(presentation, 'orders-owner'), 'idle');
});
