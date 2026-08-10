import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchemaExplorer, SchemaExplorerPanel } from '../dist/SchemaExplorer.js';
import * as schemaExplorerComponent from '../dist/SchemaExplorer.js';

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

function escapeEvent() {
  return {
    key: 'Escape',
    defaultPrevented: false,
    prevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
      this.prevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

function cssVariables(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS variables for ${selector}`);
  return Object.fromEntries([...match[1].matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)]
    .map((entry) => [entry[1], entry[2].toLowerCase()]));
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
    const linear = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const brighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (brighter + 0.05) / (darker + 0.05);
}

test('keeps active FK focus independent across inside, outside, and closed explorer Escape', () => {
  const handleEscape = schemaExplorerComponent.handleSchemaExplorerEscape;
  assert.equal(typeof handleEscape, 'function');

  for (const focusOrigin of ['inside panel', 'trigger or canvas']) {
    const event = escapeEvent();
    let explorerOpen = true;
    let fkFocus = { relationshipId: 'orders-account' };
    const action = handleEscape(
      event,
      explorerOpen,
      () => { explorerOpen = false; },
      () => { fkFocus = undefined; },
    );

    assert.equal(action, 'close-explorer', focusOrigin);
    assert.equal(explorerOpen, false, focusOrigin);
    assert.deepEqual(fkFocus, { relationshipId: 'orders-account' }, focusOrigin);
    assert.equal(event.prevented, true, focusOrigin);
    assert.equal(event.propagationStopped, true, focusOrigin);
  }

  const canvasEvent = escapeEvent();
  let fkFocus = { relationshipId: 'orders-account' };
  const action = handleEscape(
    canvasEvent,
    false,
    () => assert.fail('closed explorer must stay closed'),
    () => { fkFocus = undefined; },
  );

  assert.equal(action, 'clear-fk-focus');
  assert.equal(fkFocus, undefined);
  assert.equal(canvasEvent.prevented, false);
  assert.equal(canvasEvent.propagationStopped, false);
});

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

test('uses one deterministic whitespace-free disclosure ID for quoted table IDs', () => {
  const tableId = 'public."Order Items"';
  const unsafeSchema = {
    ...schema,
    tables: [table(tableId, 'Order Items', ['Line Item'])],
  };
  const render = () => renderToStaticMarkup(createElement(SchemaExplorerPanel, {
    ...panelProps,
    schema: unsafeSchema,
    selection: undefined,
    query: '',
    expandedTableIds: new Set([tableId]),
  }));
  const firstMarkup = render();
  const secondMarkup = render();
  const firstControl = firstMarkup.match(/aria-controls="([^"]+)"/);
  const secondControl = secondMarkup.match(/aria-controls="([^"]+)"/);

  assert.ok(firstControl);
  assert.ok(secondControl);
  assert.equal(firstControl[1], secondControl[1]);
  assert.doesNotMatch(firstControl[1], /[\t\n\f\r ]/);
  assert.ok(firstMarkup.includes(`id="${firstControl[1]}"`));
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
    open: false,
    onOpenChange: () => {},
    onSelectTable: () => {},
    onSelectColumn: () => {},
    onClose: () => {},
  }));

  assert.match(markup, /aria-controls="dbml-schema-explorer"/);
  assert.match(markup, /aria-expanded="false"/);
});

test('renders the panel from parent-coordinated open state', () => {
  const markup = renderToStaticMarkup(createElement(SchemaExplorer, {
    schema,
    open: true,
    onOpenChange: () => {},
    onSelectTable: () => {},
    onSelectColumn: () => {},
    onClose: () => {},
  }));

  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /<section id="dbml-schema-explorer"/);
  assert.match(markup, /aria-label="Search tables and columns"/);
});

test('keeps explorer interaction inside the canvas and exposes its visual CSS contract', async () => {
  const triggerMarkup = renderToStaticMarkup(createElement(SchemaExplorer, {
    schema,
    open: false,
    onOpenChange: () => {},
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

test('uses a distinct readable mark foreground in both themes', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  const light = cssVariables(css, ':root');
  const dark = cssVariables(css, "[data-theme='dark']");

  assert.equal(light['--dbml-search'], '#c87912');
  assert.match(light['--dbml-search-mark-text'] ?? '', /^#[0-9a-f]{6}$/);
  assert.match(dark['--dbml-search-mark-text'] ?? '', /^#[0-9a-f]{6}$/);
  assert.notEqual(light['--dbml-search-mark-text'], light['--dbml-search']);
  assert.ok(
    contrastRatio(light['--dbml-search-mark-text'], light['--dbml-search-soft']) >= 4.5,
  );
  assert.ok(
    contrastRatio(dark['--dbml-search-mark-text'], dark['--dbml-search-soft']) >= 4.5,
  );
  assert.match(
    css,
    /\.dbml-schema-explorer mark\s*\{[^}]*color:\s*var\(--dbml-search-mark-text\)/s,
  );
});
