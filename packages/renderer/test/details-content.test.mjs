import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailsCard } from '../dist/DetailsCard.js';
import { TableColorSettings } from '../dist/TableColorSettings.js';
import { isDirectFocusTarget } from '../dist/TableNode.js';

test('opens row details only for direct focus, not bubbled editor focus', () => {
  const row = {};
  const textarea = {};
  assert.equal(isDirectFocusTarget(row, row), true);
  assert.equal(isDirectFocusTarget(textarea, row), false);
});

test('renders column metadata and full constraint names in a detail card', () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: {
      kind: 'column',
      id: 'public.members.email',
      name: 'email',
      type: 'varchar(255)',
      note: 'Login address',
      defaultValue: "'unknown@example.com'",
      compactLabels: ['FK', 'UNIQUE'],
      fullConstraints: ['FOREIGN KEY', 'UNIQUE', 'AUTO INCREMENT', 'NOT NULL'],
      foreignKeys: [{
        tableId: 'public.accounts',
        tableName: 'accounts',
        columnIds: ['public.accounts.email'],
        columnNames: ['email'],
      }],
      indexes: [{
        name: 'uq_members_email',
        members: [{ value: 'email' }],
        unique: true,
        primaryKey: false,
      }],
    },
    mode: 'view',
    onEdit: () => {},
  }));

  assert.match(markup, /email/);
  assert.match(markup, /varchar\(255\)/);
  assert.match(markup, /FOREIGN KEY/);
  assert.match(markup, /AUTO INCREMENT/);
  assert.match(markup, /Login address/);
  assert.match(markup, /uq_members_email/);
  assert.match(markup, /accounts\.email/);
});

test('renders table notes and ordered index members', () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: {
      kind: 'table',
      id: 'public.members',
      name: 'members',
      note: 'Member aggregate',
      indexes: [{
        name: 'idx_provider_identity',
        members: [{ value: 'provider' }, { value: 'provider_id' }],
        unique: true,
        primaryKey: false,
      }],
      columns: {},
    },
    mode: 'view',
    onEdit: () => {},
  }));

  assert.match(markup, /Member aggregate/);
  assert.match(markup, /idx_provider_identity/);
  assert.match(markup, /provider, provider_id/);
  assert.match(markup, /UNIQUE/);
});

test('offers exactly five table colors plus reset without memo or custom controls', () => {
  const markup = renderToStaticMarkup(createElement(TableColorSettings, {
    color: 'green',
    onChange: () => {},
  }));

  assert.equal((markup.match(/Use (?:blue|green|yellow|red|purple) table color/g) ?? []).length, 5);
  assert.match(markup, /Reset table color/);
  assert.doesNotMatch(markup, /Custom|Memo|Auto Increment/i);
});
