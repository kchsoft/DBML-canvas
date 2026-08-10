import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchemaExplorer, SchemaExplorerPanel } from '../dist/SchemaExplorer.js';

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

const panelProps = {
  schema,
  selection: { kind: 'column', tableId: 'public.accounts', columnId: 'public.accounts.DisplayName' },
  onSelectTable: () => {},
  onSelectColumn: () => {},
  onClose: () => {},
  query: 'name',
  sortDirection: 'asc',
  expandedTableIds: new Set(['public.accounts']),
  onQueryChange: () => {},
  onToggleSort: () => {},
  onToggleTable: () => {},
};

test('renders search results with accessible actions and highlighted selections', () => {
  const markup = renderToStaticMarkup(createElement(SchemaExplorerPanel, panelProps));

  assert.match(markup, /id="dbml-schema-explorer"/);
  assert.match(markup, /aria-label="Search tables and columns"/);
  assert.match(markup, /value="name"/);
  assert.match(markup, /aria-label="Sort tables descending"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /<mark>name<\/mark>/i);
  assert.match(markup, /aria-current="true"/);
  assert.match(markup, /Display<mark>Name<\/mark>/);
});

test('renders the no-results message for an unmatched query', () => {
  const markup = renderToStaticMarkup(createElement(SchemaExplorerPanel, {
    ...panelProps,
    query: 'does-not-exist',
  }));

  assert.match(markup, /검색 결과가 없습니다\./);
});

test('keeps every declaration-ordered column visible for a column match', () => {
  const markup = renderToStaticMarkup(createElement(SchemaExplorerPanel, {
    ...panelProps,
    query: 'owner',
    expandedTableIds: new Set(),
  }));

  assert.match(markup, /id[\s\S]*DisplayName[\s\S]*<mark>owner<\/mark>_id/);
});

test('renders a closed explorer trigger wired to the drawer', () => {
  const markup = renderToStaticMarkup(createElement(SchemaExplorer, {
    schema,
    onSelectTable: () => {},
    onSelectColumn: () => {},
    onClose: () => {},
  }));

  assert.match(markup, /aria-controls="dbml-schema-explorer"/);
  assert.match(markup, /aria-expanded="false"/);
});

test('keeps explorer interaction inside the canvas and exposes its visual CSS contract', async () => {
  const triggerMarkup = renderToStaticMarkup(createElement(SchemaExplorer, {
    schema,
    onSelectTable: () => {},
    onSelectColumn: () => {},
    onClose: () => {},
  }));
  const panelMarkup = renderToStaticMarkup(createElement(SchemaExplorerPanel, panelProps));
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(triggerMarkup, /class="dbml-schema-explorer-trigger nodrag nopan nowheel"/);
  assert.match(panelMarkup, /class="dbml-schema-explorer nodrag nopan nowheel"/);
  assert.match(css, /--dbml-search:\s*#[0-9a-f]{6}/i);
  assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*width:\s*min\(320px, calc\(100% - 64px\)\)/s);
  assert.match(css, /\.dbml-schema-explorer\s*\{[^}]*top:\s*12px/s);
  assert.match(css, /\.dbml-schema-explorer-results\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.dbml-schema-explorer mark\s*\{[^}]*background:/s);
  assert.match(
    css,
    /\.dbml-schema-explorer-trigger:focus-visible,\s*\.dbml-schema-explorer button:focus-visible\s*\{[^}]*outline:/s,
  );
});
