import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canOpenDetail, TableNode } from '../dist/TableNode.js';

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
