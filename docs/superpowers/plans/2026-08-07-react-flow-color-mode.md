# React Flow Color Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate each host's active theme into React Flow so its controls, minimap, and built-in surfaces render legibly in dark mode.

**Architecture:** Extend the shared `ErdCanvas` contract with React Flow's official `ColorMode` type and pass it directly to `ReactFlow`. The web sandbox and shared IDE webview provide their existing light/dark state; VS Code and IntelliJ protocols remain unchanged.

**Tech Stack:** TypeScript 5.9, React 19, React DOM server rendering, React Flow 12.11, Node 22 built-in test runner, Vite 8.

## Global Constraints

- Preserve light mode when `ErdCanvas.colorMode` is omitted.
- Use React Flow's exported `ColorMode` instead of defining a parallel type.
- Keep existing DBML theme CSS variables and do not add control-specific color overrides.
- Do not change DBML parsing, ERD layout persistence, mouse interaction, or IDE host protocols.
- Add no runtime or test dependencies.

---

### Task 1: Shared renderer color-mode contract

**Files:**
- Create: `packages/renderer/test/color-mode.test.mjs`
- Modify: `packages/renderer/package.json`
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ColorMode` from `@xyflow/react`.
- Produces: optional `ErdCanvasProps.colorMode?: ColorMode`, defaulting to `light`, and forwards it to `<ReactFlow colorMode={colorMode}>`.

- [ ] **Step 1: Write the failing renderer test**

Create `packages/renderer/test/color-mode.test.mjs`:

```js
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
```

- [ ] **Step 2: Add and run the renderer test command to verify RED**

Add to `packages/renderer/package.json`:

```json
"test": "npm run build && node --test test/*.test.mjs"
```

Run: `npm run test -w @dbml-canvas/renderer`

Expected: FAIL because `ErdCanvas` ignores `colorMode` and React Flow renders with its light class.

- [ ] **Step 3: Add the renderer property and forwarding**

Add `type ColorMode` to the existing `@xyflow/react` imports. Extend the public props:

```ts
export interface ErdCanvasProps {
  schema: ErdSchema;
  layout: ErdLayout;
  colorMode?: ColorMode;
  onLayoutChange?: (layout: ErdLayout) => void;
  onOpenSource?: (range: SourceRange) => void;
  className?: string;
  showMiniMap?: boolean;
}
```

Destructure `colorMode = 'light'` in `ErdCanvasInner`, then pass it to React Flow:

```tsx
<ReactFlow<TableFlowNode>
  colorMode={colorMode}
  nodes={nodes}
```

- [ ] **Step 4: Run the renderer test to verify GREEN**

Run: `npm run test -w @dbml-canvas/renderer`

Expected: 1 test passes with 0 failures.

- [ ] **Step 5: Include renderer coverage in the root test command**

Change the root test script to:

```json
"test": "npm run test -w @dbml-canvas/core && npm run test -w @dbml-canvas/renderer && npm run test -w @dbml-canvas/web-sandbox"
```

- [ ] **Step 6: Commit the shared renderer contract**

```bash
git add package.json packages/renderer/package.json packages/renderer/src/ErdCanvas.tsx packages/renderer/test/color-mode.test.mjs
git commit -m "feat: expose React Flow color mode"
```

---

### Task 2: Web and IDE theme propagation

**Files:**
- Modify: `apps/web-sandbox/src/App.tsx`
- Modify: `apps/host-webview/src/App.tsx`

**Interfaces:**
- Consumes: `ErdCanvasProps.colorMode` from Task 1 and the existing `'light' | 'dark'` theme values.
- Produces: explicit `colorMode` values for both the browser sandbox and shared VS Code/IntelliJ webview.

- [ ] **Step 1: Pass the browser sandbox theme**

Add the existing state to the `ErdCanvas` invocation in `apps/web-sandbox/src/App.tsx`:

```tsx
<ErdCanvas
  schema={schema}
  layout={layout}
  colorMode={theme}
  onLayoutChange={setLayout}
  onOpenSource={(range) => console.info('Open source', range)}
/>
```

- [ ] **Step 2: Store and pass the IDE webview theme**

Add state in `apps/host-webview/src/App.tsx`:

```ts
const [theme, setTheme] = useState<'light' | 'dark'>('light');
```

Update the existing message branch:

```ts
if (message.type === 'host/set-theme') {
  setTheme(message.payload.theme);
  document.documentElement.dataset.theme = message.payload.theme;
  return;
}
```

Pass it to the shared renderer:

```tsx
<ErdCanvas
  schema={schema}
  layout={layout}
  colorMode={theme}
  onLayoutChange={handleLayoutChange}
  onOpenSource={(range) => postToHost({ type: 'webview/open-source', payload: { range } })}
/>
```

- [ ] **Step 3: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit 0. The production build may retain the existing large-chunk warning but must contain no errors.

- [ ] **Step 4: Perform manual dark-mode verification**

Run `npm run dev` and verify the web sandbox in both themes:

1. Dark mode shows visible zoom-in, zoom-out, and fit-view icons.
2. Light mode controls remain unchanged and legible.
3. The minimap and React Flow background switch consistently with the selected theme.
4. Table dragging, split-pane resizing, and DBML live parsing still work.

For the IDE webview, confirm the same control visibility after a `host/set-theme` dark message. The user may perform this manual verification when browser automation is unavailable.

- [ ] **Step 5: Commit host propagation**

```bash
git add apps/web-sandbox/src/App.tsx apps/host-webview/src/App.tsx
git commit -m "fix: propagate dark mode to React Flow"
```
