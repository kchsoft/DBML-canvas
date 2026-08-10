import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import {
  canOpenDetail,
  isFkFocusActivationKey,
  shouldActivateFkFocus,
  stopFkFocusClickPropagation,
  TableNode,
} from '../dist/TableNode.js';
import {
  applySchemaSearchSelectionToNodes,
  createFlowNodes,
} from '../dist/graph.js';

test('suppresses table details during a settings interaction without blocking columns', () => {
  assert.equal(canOpenDetail({ kind: 'table' }, true), false);
  assert.equal(canOpenDetail({ kind: 'column', columnId: 'public.members.id' }, true), true);
  assert.equal(canOpenDetail({ kind: 'table' }, false), true);
});

test('sizes table nodes to their single-line content with a 340px minimum', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.dbml-table-node\s*\{[^}]*width:\s*max-content;/s);
  assert.match(css, /\.dbml-table-node\s*\{[^}]*min-width:\s*340px;/s);
  assert.match(css, /\.dbml-column-name\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.dbml-column-name\s*\{[^}]*text-overflow:\s*ellipsis;/s);
});

test('uses an amber canvas locator independently from FK presentation', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.dbml-table-node\.is-search-selected\s*\{[^}]*outline:/s);
  assert.match(css, /\.dbml-column-row\.is-search-selected\s*\{[^}]*box-shadow:/s);
});

test('shares column tracks across every row in a table', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.dbml-column-list\s*\{[^}]*display:\s*grid;/s);
  assert.match(
    css,
    /\.dbml-column-list\s*\{[^}]*grid-template-columns:\s*92px minmax\(70px, max-content\) minmax\(60px, max-content\) 32px;/s,
  );
  assert.match(css, /\.dbml-column-row\s*\{[^}]*grid-column:\s*1 \/ -1;/s);
  assert.match(css, /\.dbml-column-row\s*\{[^}]*grid-template-columns:\s*subgrid;/s);
});

test('uses a vertical ellipsis for table options', () => {
  const markup = renderToStaticMarkup(createElement(TableNode, {
    id: 'public.members',
    type: 'table',
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: false,
    isConnectable: false,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    data: {
      table: {
        id: 'public.members',
        name: 'members',
        displayName: 'members',
        schemaName: 'public',
        columns: [],
        indexes: [],
      },
      details: {
        kind: 'table',
        id: 'public.members',
        name: 'members',
        indexes: [],
        columns: {},
      },
      layout: { x: 0, y: 0 },
    },
  }));

  assert.match(markup, /aria-label="Table options for members"/);
  assert.match(markup, />⋮<\/button>/);
  assert.doesNotMatch(markup, /⚙/);
});

test('renders source and target handles on both sides of a column row', () => {
  const columnId = 'public.members.owner_id';
  const markup = renderToStaticMarkup(createElement(
    ReactFlowProvider,
    null,
    createElement(TableNode, {
      id: 'public.members',
      type: 'table',
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: false,
      isConnectable: false,
      zIndex: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      data: {
        table: {
          id: 'public.members',
          name: 'members',
          displayName: 'members',
          schemaName: 'public',
          columns: [{
            id: columnId,
            tableId: 'public.members',
            name: 'owner_id',
            type: 'bigint',
            primaryKey: false,
            unique: false,
            nullable: false,
            increment: false,
          }],
          indexes: [],
        },
        details: {
          kind: 'table',
          id: 'public.members',
          name: 'members',
          indexes: [],
          columns: {},
        },
        layout: { x: 0, y: 0 },
      },
    }),
  ));

  for (const handleId of [
    `source:left:${columnId}`,
    `target:left:${columnId}`,
    `source:right:${columnId}`,
    `target:right:${columnId}`,
  ]) {
    assert.match(markup, new RegExp(`data-handleid="${handleId}"`));
  }
});

test('renders active and related FK columns with keyboard focus affordances', async () => {
  assert.equal(isFkFocusActivationKey('Enter'), true);
  assert.equal(isFkFocusActivationKey(' '), true);
  assert.equal(isFkFocusActivationKey('Escape'), false);

  const activeColumnId = 'public.members.owner_id';
  const relatedColumnId = 'public.members.team_id';
  const markup = renderToStaticMarkup(createElement(
    ReactFlowProvider,
    null,
    createElement(TableNode, {
      id: 'public.members',
      type: 'table',
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: false,
      isConnectable: false,
      zIndex: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      data: {
        table: {
          id: 'public.members',
          name: 'members',
          displayName: 'members',
          schemaName: 'public',
          columns: [
            {
              id: activeColumnId,
              tableId: 'public.members',
              name: 'owner_id',
              type: 'bigint',
              primaryKey: false,
              unique: false,
              nullable: false,
              increment: false,
            },
            {
              id: relatedColumnId,
              tableId: 'public.members',
              name: 'team_id',
              type: 'bigint',
              primaryKey: false,
              unique: false,
              nullable: false,
              increment: false,
            },
          ],
          indexes: [],
        },
        details: {
          kind: 'table',
          id: 'public.members',
          name: 'members',
          indexes: [],
          columns: {},
        },
        layout: { x: 0, y: 0 },
        activeFkColumnId: activeColumnId,
        relatedFkColumnIds: [activeColumnId, relatedColumnId],
        onFkColumnFocus: () => {},
      },
    }),
  ));
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(markup, /class="dbml-column-row is-fk-active"/);
  assert.match(markup, /class="dbml-column-row is-fk-related"/);
  assert.match(markup, /aria-label="Focus FK relationships for members\.owner_id"/);
  assert.match(markup, /role="button"[^>]*aria-pressed="true"/);
  assert.match(markup, /role="button"[^>]*aria-pressed="false"/);
  assert.match(css, /\.dbml-column-row\.is-fk-active\s*\{[^}]*box-shadow:/s);
  assert.match(css, /\.dbml-column-row\.is-fk-related\s*\{[^}]*background:/s);
  assert.match(css, /transition:[^;]*background-color 140ms/s);
});

test('marks a table search selection without marking a column row', () => {
  const markup = renderToStaticMarkup(createElement(
    ReactFlowProvider,
    null,
    createElement(TableNode, {
      id: 'public.members',
      type: 'table',
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: false,
      isConnectable: false,
      zIndex: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      data: {
        table: {
          id: 'public.members',
          name: 'members',
          displayName: 'members',
          schemaName: 'public',
          columns: [{
            id: 'public.members.owner_id',
            tableId: 'public.members',
            name: 'owner_id',
            type: 'bigint',
            primaryKey: false,
            unique: false,
            nullable: false,
            increment: false,
          }],
          indexes: [],
        },
        details: {
          kind: 'table',
          id: 'public.members',
          name: 'members',
          indexes: [],
          columns: {},
        },
        layout: { x: 0, y: 0 },
        searchSelectedTable: true,
      },
    }),
  ));

  assert.match(markup, /class="dbml-table-node is-search-selected"/);
  assert.doesNotMatch(markup, /class="dbml-column-row is-search-selected"/);
});

test('marks exactly one searched column while preserving its active FK class', () => {
  const selectedColumnId = 'public.members.owner_id';
  const markup = renderToStaticMarkup(createElement(
    ReactFlowProvider,
    null,
    createElement(TableNode, {
      id: 'public.members',
      type: 'table',
      selected: false,
      dragging: false,
      draggable: true,
      selectable: true,
      deletable: false,
      isConnectable: false,
      zIndex: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
      data: {
        table: {
          id: 'public.members',
          name: 'members',
          displayName: 'members',
          schemaName: 'public',
          columns: [
            {
              id: selectedColumnId,
              tableId: 'public.members',
              name: 'owner_id',
              type: 'bigint',
              primaryKey: false,
              unique: false,
              nullable: false,
              increment: false,
            },
            {
              id: 'public.members.team_id',
              tableId: 'public.members',
              name: 'team_id',
              type: 'bigint',
              primaryKey: false,
              unique: false,
              nullable: false,
              increment: false,
            },
          ],
          indexes: [],
        },
        details: {
          kind: 'table',
          id: 'public.members',
          name: 'members',
          indexes: [],
          columns: {},
        },
        layout: { x: 0, y: 0 },
        activeFkColumnId: selectedColumnId,
        relatedFkColumnIds: [selectedColumnId],
        searchSelectedColumnId: selectedColumnId,
      },
    }),
  ));

  assert.match(markup, /class="dbml-column-row is-fk-active is-search-selected"/);
  assert.equal(markup.match(/is-search-selected/g)?.length, 1);
});

test('reapplies only search state while preserving graph and FK state', () => {
  const onAnnotationChange = () => {};
  const onEditNote = () => {};
  const onFkColumnFocus = () => {};
  const schema = {
    version: 1,
    tables: [{
      id: 'public.members',
      name: 'members',
      displayName: 'members',
      schemaName: 'public',
      columns: [{ id: 'public.members.owner_id', name: 'owner_id', type: 'bigint' }],
      indexes: [],
    }],
    relationships: [],
    warnings: [],
  };
  const fkPresentation = {
    relationshipIds: new Set(),
    endpointColumnIds: new Set(['public.members.owner_id']),
    activeColumnId: 'public.members.owner_id',
  };
  const nodes = createFlowNodes(
    schema,
    { version: 1, nodes: {} },
    onAnnotationChange,
    onEditNote,
    fkPresentation,
    onFkColumnFocus,
    { kind: 'table', tableId: 'public.members' },
  ).map((node) => ({ ...node, selected: true, measured: { width: 340, height: 120 } }));
  const originalAnnotationChange = nodes[0].data.onAnnotationChange;
  const originalLayout = nodes[0].data.layout;

  const [updated] = applySchemaSearchSelectionToNodes(nodes, {
    kind: 'column',
    tableId: 'public.members',
    columnId: 'public.members.owner_id',
  });

  assert.equal(updated.selected, true);
  assert.deepEqual(updated.measured, { width: 340, height: 120 });
  assert.equal(updated.data.searchSelectedTable, undefined);
  assert.equal(updated.data.searchSelectedColumnId, 'public.members.owner_id');
  assert.equal(updated.data.activeFkColumnId, 'public.members.owner_id');
  assert.deepEqual(updated.data.relatedFkColumnIds, ['public.members.owner_id']);
  assert.equal(updated.data.onEditNote, onEditNote);
  assert.equal(updated.data.onFkColumnFocus, onFkColumnFocus);
  assert.equal(updated.data.onAnnotationChange, originalAnnotationChange);
  assert.equal(updated.data.layout, originalLayout);
});

test('does not treat keys from a nested column editor as FK focus shortcuts', () => {
  const row = {};
  const nestedEditor = {};

  assert.equal(shouldActivateFkFocus('Enter', row, row), true);
  assert.equal(shouldActivateFkFocus(' ', row, row), true);
  assert.equal(shouldActivateFkFocus('Enter', nestedEditor, row), false);
  assert.equal(shouldActivateFkFocus(' ', nestedEditor, row), false);
});

test('stops detail-popover clicks before they can change FK focus', () => {
  let stopped = false;
  stopFkFocusClickPropagation({
    stopPropagation() {
      stopped = true;
    },
  });

  assert.equal(stopped, true);
});
