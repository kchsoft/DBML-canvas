# Resizable Web Split Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, accessible desktop drag handle between the DBML editor and ERD canvas in the web sandbox.

**Architecture:** Keep the feature inside `apps/web-sandbox`. Put deterministic width parsing and clamping in a small pure TypeScript module, while `App` owns pointer/keyboard interaction and persistence and CSS owns the visual handle and responsive stacked fallback.

**Tech Stack:** TypeScript 5.9, React 19, CSS Grid, Pointer Events, browser `localStorage`, Node 22 built-in test runner, Vite 8.

## Global Constraints

- Apply only to `apps/web-sandbox`; do not change the shared renderer or IDE adapters.
- Desktop minimum source width is 260px and maximum source width is 70% of the workspace.
- Default source width is 34% of the workspace.
- Store the desktop source width in pixels in `localStorage`.
- Below 850px, preserve the existing 38%/62% stacked layout and hide the separator.
- Add no runtime or test dependencies.

---

### Task 1: Deterministic source-pane sizing

**Files:**
- Create: `apps/web-sandbox/src/split-pane.ts`
- Create: `apps/web-sandbox/test/split-pane.test.mjs`
- Modify: `apps/web-sandbox/package.json`

**Interfaces:**
- Consumes: workspace width in CSS pixels and an optional stored string.
- Produces: `DEFAULT_SOURCE_RATIO`, `MIN_SOURCE_WIDTH`, `MAX_SOURCE_RATIO`, `KEYBOARD_RESIZE_STEP`, `SOURCE_WIDTH_KEY`, `clampSourceWidth(width, workspaceWidth)`, `defaultSourceWidth(workspaceWidth)`, and `resolveSourceWidth(stored, workspaceWidth)`.

- [ ] **Step 1: Add a failing sizing test**

Create `apps/web-sandbox/test/split-pane.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampSourceWidth,
  defaultSourceWidth,
  resolveSourceWidth,
} from '../src/split-pane.ts';

test('defaults to 34 percent of the workspace', () => {
  assert.equal(defaultSourceWidth(1000), 340);
});

test('clamps source width between 260px and 70 percent', () => {
  assert.equal(clampSourceWidth(100, 1000), 260);
  assert.equal(clampSourceWidth(900, 1000), 700);
  assert.equal(clampSourceWidth(480, 1000), 480);
});

test('uses the default for malformed storage and clamps valid storage', () => {
  assert.equal(resolveSourceWidth(null, 1000), 340);
  assert.equal(resolveSourceWidth('not-a-number', 1000), 340);
  assert.equal(resolveSourceWidth('-20', 1000), 340);
  assert.equal(resolveSourceWidth('900', 1000), 700);
});
```

- [ ] **Step 2: Add and run the web-sandbox test command to verify RED**

Add this script to `apps/web-sandbox/package.json`:

```json
"test": "node --test test/*.test.mjs"
```

Run: `npm run test -w @dbml-canvas/web-sandbox`

Expected: FAIL because `src/split-pane.ts` does not exist.

- [ ] **Step 3: Implement the minimal sizing module**

Create `apps/web-sandbox/src/split-pane.ts`:

```ts
export const DEFAULT_SOURCE_RATIO = 0.34;
export const MIN_SOURCE_WIDTH = 260;
export const MAX_SOURCE_RATIO = 0.7;
export const KEYBOARD_RESIZE_STEP = 16;
export const SOURCE_WIDTH_KEY = 'dbml-canvas/source-pane-width';

export function clampSourceWidth(width: number, workspaceWidth: number): number {
  const maximum = Math.max(MIN_SOURCE_WIDTH, workspaceWidth * MAX_SOURCE_RATIO);
  return Math.min(Math.max(width, MIN_SOURCE_WIDTH), maximum);
}

export function defaultSourceWidth(workspaceWidth: number): number {
  return clampSourceWidth(workspaceWidth * DEFAULT_SOURCE_RATIO, workspaceWidth);
}

export function resolveSourceWidth(stored: string | null, workspaceWidth: number): number {
  const parsed = stored === null ? Number.NaN : Number(stored);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultSourceWidth(workspaceWidth);
  return clampSourceWidth(parsed, workspaceWidth);
}
```

- [ ] **Step 4: Run the sizing tests to verify GREEN**

Run: `npm run test -w @dbml-canvas/web-sandbox`

Expected: 3 tests pass with 0 failures.

- [ ] **Step 5: Commit the sizing unit**

```bash
git add apps/web-sandbox/package.json apps/web-sandbox/src/split-pane.ts apps/web-sandbox/test/split-pane.test.mjs
git commit -m "test: define split pane sizing behavior"
```

---

### Task 2: Accessible draggable separator

**Files:**
- Modify: `apps/web-sandbox/src/App.tsx`
- Modify: `apps/web-sandbox/src/sandbox.css`

**Interfaces:**
- Consumes: sizing constants and helpers from `./split-pane.js`.
- Produces: a `role="separator"` element that updates `--source-pane-width`, persists completed desktop changes, resets on double-click, and supports arrow keys.

- [ ] **Step 1: Add split-pane state and interaction handlers**

Update the React import in `App.tsx` to include `useCallback`, `useRef`, and the `CSSProperties`, `KeyboardEvent`, and `PointerEvent` types. Import the Task 1 interfaces:

```ts
import {
  KEYBOARD_RESIZE_STEP,
  MAX_SOURCE_RATIO,
  MIN_SOURCE_WIDTH,
  SOURCE_WIDTH_KEY,
  clampSourceWidth,
  defaultSourceWidth,
  resolveSourceWidth,
} from './split-pane.js';
```

Add `workspaceRef`, `sourceWidth`, `draggingSeparator`, and these responsibilities inside `App`:

```ts
const workspaceRef = useRef<HTMLElement>(null);
const [sourceWidth, setSourceWidth] = useState<number>();
const [draggingSeparator, setDraggingSeparator] = useState(false);

const workspaceWidth = useCallback(() => workspaceRef.current?.getBoundingClientRect().width ?? 0, []);

const persistSourceWidth = useCallback((width: number) => {
  localStorage.setItem(SOURCE_WIDTH_KEY, String(width));
}, []);

const applySourceWidth = useCallback((width: number, persist = false) => {
  const available = workspaceWidth();
  if (available <= 0) return;
  const next = clampSourceWidth(width, available);
  setSourceWidth(next);
  if (persist) persistSourceWidth(next);
}, [persistSourceWidth, workspaceWidth]);

useEffect(() => {
  const workspace = workspaceRef.current;
  if (!workspace) return;

  const syncWidth = () => {
    if (!window.matchMedia('(min-width: 851px)').matches) return;
    const available = workspace.getBoundingClientRect().width;
    if (available <= 0) return;
    setSourceWidth((current) => current === undefined
      ? resolveSourceWidth(localStorage.getItem(SOURCE_WIDTH_KEY), available)
      : clampSourceWidth(current, available));
  };

  syncWidth();
  const observer = new ResizeObserver(syncWidth);
  observer.observe(workspace);
  return () => observer.disconnect();
}, []);

const widthFromPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  const bounds = workspaceRef.current?.getBoundingClientRect();
  return bounds ? event.clientX - bounds.left : undefined;
}, []);

const handleSeparatorPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  if (!event.isPrimary) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  setDraggingSeparator(true);
  const width = widthFromPointer(event);
  if (width !== undefined) applySourceWidth(width);
}, [applySourceWidth, widthFromPointer]);

const handleSeparatorPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
  const width = widthFromPointer(event);
  if (width !== undefined) applySourceWidth(width);
}, [applySourceWidth, widthFromPointer]);

const handleSeparatorPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
  const width = widthFromPointer(event);
  if (width !== undefined) applySourceWidth(width, true);
  event.currentTarget.releasePointerCapture(event.pointerId);
  setDraggingSeparator(false);
}, [applySourceWidth, widthFromPointer]);

const handleSeparatorPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  setDraggingSeparator(false);
}, []);

const handleSeparatorDoubleClick = useCallback(() => {
  const available = workspaceWidth();
  if (available > 0) applySourceWidth(defaultSourceWidth(available), true);
}, [applySourceWidth, workspaceWidth]);

const handleSeparatorKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const available = workspaceWidth();
  if (available <= 0) return;
  const current = sourceWidth ?? resolveSourceWidth(localStorage.getItem(SOURCE_WIDTH_KEY), available);
  const direction = event.key === 'ArrowLeft' ? -1 : 1;
  applySourceWidth(current + direction * KEYBOARD_RESIZE_STEP, true);
}, [applySourceWidth, sourceWidth, workspaceWidth]);
```

- [ ] **Step 2: Render the grid width and separator semantics**

Apply the workspace ref, active class, and CSS custom property:

```tsx
<section
  ref={workspaceRef}
  className={`workspace${draggingSeparator ? ' is-resizing' : ''}`}
  style={sourceWidth === undefined
    ? undefined
    : { '--source-pane-width': `${sourceWidth}px` } as CSSProperties}
>
```

Insert this between `.source-pane` and `.canvas-pane`, wiring the handlers created in Step 2:

```tsx
<div
  className="pane-separator"
  role="separator"
  aria-label="Resize DBML editor"
  aria-orientation="vertical"
  aria-valuemin={MIN_SOURCE_WIDTH}
  aria-valuemax={Math.max(MIN_SOURCE_WIDTH, Math.round(workspaceWidth() * MAX_SOURCE_RATIO))}
  aria-valuenow={Math.round(sourceWidth ?? MIN_SOURCE_WIDTH)}
  tabIndex={0}
  onPointerDown={handleSeparatorPointerDown}
  onPointerMove={handleSeparatorPointerMove}
  onPointerUp={handleSeparatorPointerUp}
  onPointerCancel={handleSeparatorPointerCancel}
  onDoubleClick={handleSeparatorDoubleClick}
  onKeyDown={handleSeparatorKeyDown}
/>
```

- [ ] **Step 3: Style desktop resizing and preserve mobile stacking**

Replace the desktop workspace columns and source border with:

```css
.workspace {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(260px, var(--source-pane-width, 34%)) 8px minmax(0, 1fr);
}

.source-pane { display: grid; min-width: 0; min-height: 0; grid-template-rows: auto 1fr auto; }

.pane-separator {
  position: relative;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
  background: var(--dbml-surface);
  outline: 0;
}

.pane-separator::after {
  position: absolute;
  inset: 0 3px;
  content: '';
  background: var(--dbml-border);
  transition: background 120ms ease, box-shadow 120ms ease;
}

.pane-separator:hover::after,
.pane-separator:focus-visible::after,
.workspace.is-resizing .pane-separator::after {
  background: #4f8cff;
  box-shadow: 0 0 0 1px color-mix(in srgb, #4f8cff 32%, transparent);
}

.workspace.is-resizing { cursor: col-resize; user-select: none; }
```

Inside the existing `@media (max-width: 850px)` block, use `grid-template-columns: 1fr`, preserve `grid-template-rows: 38% 62%`, restore the source pane bottom border, and set `.pane-separator { display: none; }`.

- [ ] **Step 4: Run focused and full automated verification**

Run:

```bash
npm run test -w @dbml-canvas/web-sandbox
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0. The production build may report the existing large-chunk warning but no errors.

- [ ] **Step 5: Verify the real browser interaction**

Run `npm run dev`, open `http://localhost:5173/`, and verify:

1. Dragging the separator resizes the DBML editor and ERD canvas.
2. Dragging cannot make the editor narrower than 260px or wider than 70%.
3. Reload preserves the chosen width.
4. Double-click restores 34%.
5. Focus plus Left/Right Arrow changes width by 16px.
6. At a viewport narrower than 850px, the panes stack and the separator disappears.
7. Table dragging and DBML live parsing still work after resizing.

- [ ] **Step 6: Commit the completed feature**

```bash
git add apps/web-sandbox/src/App.tsx apps/web-sandbox/src/sandbox.css
git commit -m "feat: resize DBML and ERD panes"
```
