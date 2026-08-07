import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErdCanvas } from '../dist/ErdCanvas.js';

const schema = {
  version: 1,
  tables: [],
  relationships: [],
  warnings: [],
};

const layout = { version: 1, nodes: {} };

test('forwards dark color mode to React Flow', () => {
  const markup = renderToStaticMarkup(createElement(ErdCanvas, {
    schema,
    layout,
    colorMode: 'dark',
    showMiniMap: false,
  }));

  assert.match(markup, /class="react-flow dark"/);
});
