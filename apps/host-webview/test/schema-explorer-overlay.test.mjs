import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { SchemaExplorer } from '@dbml-canvas/renderer';

const hostRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(hostRoot, '../..');

const schema = {
  version: 1,
  enums: [],
  tables: [],
  relationships: [],
  warnings: [],
};

function declarationsFor(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return Object.fromEntries(match[1]
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
    }));
}

function pixelValue(declarations, property) {
  const value = declarations[property];
  assert.match(value ?? '', /^-?\d+(?:\.\d+)?px$/, `${property} must use a fixed pixel value`);
  return Number.parseFloat(value);
}

function anchoredRect(declarations, viewportWidth) {
  const width = pixelValue(declarations, 'width');
  const height = pixelValue(declarations, 'height');
  const left = declarations.left === undefined
    ? viewportWidth - pixelValue(declarations, 'right') - width
    : pixelValue(declarations, 'left');
  return {
    left,
    right: left + width,
    top: pixelValue(declarations, 'top'),
    bottom: pixelValue(declarations, 'top') + height,
  };
}

function overlaps(left, right) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

async function renderHostApp() {
  const cacheRoot = path.join(workspaceRoot, 'node_modules/.cache');
  await mkdir(cacheRoot, { recursive: true });
  const outputDirectory = await mkdtemp(path.join(cacheRoot, 'host-overlay-test-'));
  try {
    await build({
      root: hostRoot,
      configFile: false,
      logLevel: 'silent',
      build: {
        ssr: path.join(hostRoot, 'src/App.tsx'),
        outDir: outputDirectory,
        emptyOutDir: false,
        rollupOptions: { output: { entryFileNames: 'app.mjs' } },
      },
    });
    globalThis.window = {};
    const { App } = await import(`${pathToFileURL(path.join(outputDirectory, 'app.mjs')).href}?test`);
    return renderToStaticMarkup(createElement(App));
  } finally {
    delete globalThis.window;
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

test('keeps the real packaged-host theme control clear of the explorer trigger and drawer', async () => {
  const [appMarkup, hostCss, rendererCss] = await Promise.all([
    renderHostApp(),
    readFile(path.join(hostRoot, 'src/webview.css'), 'utf8'),
    readFile(path.join(workspaceRoot, 'packages/renderer/src/styles.css'), 'utf8'),
  ]);
  const triggerMarkup = renderToStaticMarkup(createElement(SchemaExplorer, {
    schema,
    open: false,
    onOpenChange: () => {},
    onSelectTable: () => {},
    onSelectColumn: () => {},
    onClose: () => {},
  }));

  assert.match(appMarkup, /class="host-theme-toggle"/);
  assert.match(triggerMarkup, /class="dbml-schema-explorer-trigger nodrag nopan nowheel"/);

  const themeControl = declarationsFor(hostCss, '.host-theme-toggle');
  const closedTrigger = declarationsFor(rendererCss, '.dbml-schema-explorer-trigger');
  assert.equal(themeControl.position, 'absolute');
  assert.equal(closedTrigger.position, 'absolute');
  assert.match(
    rendererCss,
    /\.dbml-canvas:has\(\.dbml-schema-explorer\) \.dbml-schema-explorer-trigger\s*\{[^}]*right:\s*calc\(min\(320px, calc\(100% - 64px\)\) \+ 20px\)/s,
  );
  assert.match(
    rendererCss,
    /\.dbml-schema-explorer\s*\{[^}]*right:\s*12px[^}]*width:\s*min\(320px, calc\(100% - 64px\)\)/s,
  );

  for (const viewportWidth of [96, 384, 400, 1024]) {
    const drawerWidth = Math.min(320, viewportWidth - 64);
    const themeRect = anchoredRect(themeControl, viewportWidth);
    const closedTriggerRect = anchoredRect(closedTrigger, viewportWidth);
    const openTriggerRect = {
      ...closedTriggerRect,
      left: viewportWidth - drawerWidth - 20 - pixelValue(closedTrigger, 'width'),
      right: viewportWidth - drawerWidth - 20,
    };
    const drawerRect = {
      left: viewportWidth - drawerWidth - 12,
      right: viewportWidth - 12,
      top: 12,
      bottom: 308,
    };

    assert.equal(overlaps(themeRect, closedTriggerRect), false, `closed trigger at ${viewportWidth}px`);
    assert.equal(overlaps(themeRect, openTriggerRect), false, `open trigger at ${viewportWidth}px`);
    assert.equal(overlaps(themeRect, drawerRect), false, `open drawer at ${viewportWidth}px`);
  }
});
