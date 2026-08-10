# Enum Values in Column Hover Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show ordered DBML enum values and optional value notes in the existing hover/focus details card for enum-typed columns.

**Architecture:** Extend the stable core schema with explicit enum definitions and parser-resolved column associations. Derive an optional enum summary in `createSchemaDetails`, then render it as a bounded semantic list inside the existing shared details card so browser, VS Code, and IntelliJ receive the same UI.

**Tech Stack:** TypeScript 5.8, React 19 server-rendered component tests, `@dbml/core` DBML parser, Node.js 22 test runner, shared React Flow renderer, Gradle/JCEF IntelliJ packaging.

## Global Constraints

- DBML remains the schema source of truth; this feature is read-only.
- Use the parser's resolved enum association rather than matching a field type string.
- Preserve enum and enum-value declaration order.
- Show value notes directly; do not add a nested hover interaction.
- Keep the current 332px detail-card width and existing hover, focus, Escape, note-editing, and FK-focus behavior.
- Ordinary columns and unresolved custom types must not show `Allowed values`.
- Do not add runtime dependencies.
- Every shell command is prefixed with `rtk` per the repository instructions.

---

### Task 1: Stable Enum Model and Parser Mapping

**Files:**
- Modify: `packages/core/src/ids.ts`
- Modify: `packages/core/src/model.ts`
- Modify: `packages/core/src/dbml-core-adapter.ts`
- Test: `packages/core/test/core.test.mjs`

**Interfaces:**
- Produces: `makeEnumId(schema: string, enumName: string): string`
- Produces: `ErdEnumValue { name: string; note?: string }`
- Produces: `ErdEnum { id; schema; name; displayName; values }`
- Produces: `ErdColumn.enumId?: string`
- Produces: `ErdSchema.enums: ErdEnum[]`

- [ ] **Step 1: Write the failing core adapter test**

Extend `packages/core/test/core.test.mjs` with a real `mapDatabase` fixture whose
schema exposes one enum and whose field points to that same raw enum object:

```js
test('maps resolved enum definitions and column associations in declaration order', () => {
  const statusEnum = {
    name: 'member_status',
    values: [
      { name: 'pending', note: { value: 'Awaiting review' } },
      { name: 'active' },
    ],
  };
  const schema = mapDatabase({
    schemas: [{
      name: 'account',
      enums: [statusEnum],
      tables: [{
        name: 'member',
        fields: [
          { name: 'status', type: { type_name: 'member_status' }, _enum: statusEnum },
          { name: 'external_type', type: { type_name: 'member_status' } },
        ],
      }],
      refs: [],
    }],
  });

  assert.deepEqual(schema.enums, [{
    id: 'account.member_status',
    schema: 'account',
    name: 'member_status',
    displayName: 'account.member_status',
    values: [
      { name: 'pending', note: 'Awaiting review' },
      { name: 'active' },
    ],
  }]);
  assert.equal(schema.tables[0].columns[0].enumId, 'account.member_status');
  assert.equal(schema.tables[0].columns[1].enumId, undefined);
});
```

The production mutation this catches is dropping enum definitions, reordering
values, discarding notes, or guessing enum membership from the field type.

- [ ] **Step 2: Run the core test and verify RED**

Run:

```bash
rtk npm run test -w @dbml-canvas/core
```

Expected: FAIL because `schema.enums` and `column.enumId` do not exist.

- [ ] **Step 3: Add the stable enum interfaces and ID helper**

In `packages/core/src/ids.ts`, add:

```ts
export const makeEnumId = (schema: string, enumName: string): string =>
  `${escapeSegment(schema)}.${escapeSegment(enumName)}`;
```

In `packages/core/src/model.ts`, add:

```ts
export interface ErdEnumValue {
  name: string;
  note?: string;
}

export interface ErdEnum {
  id: string;
  schema: string;
  name: string;
  displayName: string;
  values: ErdEnumValue[];
}
```

Add `enumId?: string` to `ErdColumn` and `enums: ErdEnum[]` to `ErdSchema`.

- [ ] **Step 4: Map parser-resolved enum data minimally**

In `packages/core/src/dbml-core-adapter.ts`:

- Add raw interfaces for enums and enum values.
- Add `_enum?: DbmlEnum` to `DbmlField` and `enums?: DbmlEnum[]` to `DbmlSchema`.
- Import `makeEnumId`.
- For each schema, map named enum definitions before mapping its tables.
- Preserve value order and use the existing `optionalString` logic for notes,
  including parser notes shaped as `{ value }`.
- Set `enumId` only from `field._enum?.name`, using the resolved enum's schema
  name when present and the current table schema otherwise.
- Return `enums` from `mapDatabase`.
- Skip unnamed enum definitions or values and append explicit warnings.

Use one helper to normalize raw note values without changing existing table and
column note behavior:

```ts
function asOptionalNote(value: unknown): string | undefined {
  if (isRecord(value) && 'value' in value) return asNonEmptyString(value.value);
  return asNonEmptyString(value);
}
```

- [ ] **Step 5: Run core tests and verify GREEN**

Run:

```bash
rtk npm run test -w @dbml-canvas/core
```

Expected: all core tests PASS.

- [ ] **Step 6: Commit the core model slice**

```bash
rtk git add packages/core/src/ids.ts packages/core/src/model.ts packages/core/src/dbml-core-adapter.ts packages/core/test/core.test.mjs
rtk git commit -m "feat(core): preserve DBML enum definitions"
```

---

### Task 2: Derive Enum Details for Columns

**Files:**
- Modify: `packages/renderer/src/schema-details.ts`
- Test: `packages/renderer/test/schema-details.test.mjs`

**Interfaces:**
- Consumes: `ErdSchema.enums` and `ErdColumn.enumId` from Task 1.
- Produces: `EnumDetail { id; name; values }`
- Produces: `ColumnDetails.enum?: EnumDetail`

- [ ] **Step 1: Write the failing schema-details test**

Add a named enum and two columns to the fixture in
`packages/renderer/test/schema-details.test.mjs`, one with `enumId` and one with
the same type string but no `enumId`. Assert literal output:

```js
test('attaches ordered enum values only to parser-resolved enum columns', () => {
  const details = createSchemaDetails(schema);
  assert.deepEqual(details['public.members'].columns['public.members.status'].enum, {
    id: 'public.member_status',
    name: 'member_status',
    values: [
      { name: 'pending', note: 'Awaiting review' },
      { name: 'active' },
    ],
  });
  assert.equal(
    details['public.members'].columns['public.members.external_status'].enum,
    undefined,
  );
});
```

The production mutation this catches is matching on `column.type`, attaching the
wrong enum, dropping notes, or changing declaration order.

- [ ] **Step 2: Run renderer tests and verify RED**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: FAIL because `ColumnDetails.enum` is absent.

- [ ] **Step 3: Add minimal enum detail derivation**

In `packages/renderer/src/schema-details.ts`, define:

```ts
export interface EnumDetail {
  id: string;
  name: string;
  values: ErdSchema['enums'][number]['values'];
}
```

Add `enum?: EnumDetail` to `ColumnDetails`. Build `enumsById` once at the start of
`createSchemaDetails`, resolve `column.enumId`, and attach a copied summary only
when a matching enum exists and has at least one value. Use the enum's
`displayName` only when disambiguation is needed in the UI; the section heading
remains `Allowed values`.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS.

- [ ] **Step 5: Commit the renderer data slice**

```bash
rtk git add packages/renderer/src/schema-details.ts packages/renderer/test/schema-details.test.mjs
rtk git commit -m "feat(renderer): derive enum column details"
```

---

### Task 3: Render the Allowed Values Section

**Files:**
- Modify: `packages/renderer/src/DetailsCard.tsx`
- Modify: `packages/renderer/src/styles.css`
- Create: `packages/renderer/test/details-card.test.mjs`

**Interfaces:**
- Consumes: `ColumnDetails.enum` from Task 2.
- Produces: semantic `.dbml-enum-values` list inside the existing details card.

- [ ] **Step 1: Write the failing real-component render test**

Create `packages/renderer/test/details-card.test.mjs` and render the real
`DetailsCard` with `react-dom/server`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailsCard } from '../dist/DetailsCard.js';

const baseColumn = {
  kind: 'column',
  id: 'public.members.status',
  name: 'status',
  type: 'member_status',
  indexes: [],
  compactLabels: [],
  fullConstraints: [],
  foreignKeys: [],
};

test('renders enum values and notes in declaration order', async () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: {
      ...baseColumn,
      enum: {
        id: 'public.member_status',
        name: 'member_status',
        values: [
          { name: 'pending', note: 'Awaiting review' },
          { name: 'active' },
        ],
      },
    },
    mode: 'view',
  }));
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(markup, /<h4>Allowed values<\/h4>/);
  assert.match(markup, /<code>pending<\/code>[\s\S]*Awaiting review[\s\S]*<code>active<\/code>/);
  assert.match(markup, /<ul class="dbml-details-list dbml-enum-values"/);
  assert.match(css, /\.dbml-enum-values\s*\{[^}]*max-height:/s);
  assert.match(css, /\.dbml-enum-values\s*\{[^}]*overflow-y:\s*auto;/s);
});

test('omits allowed values for a normal column', () => {
  const markup = renderToStaticMarkup(createElement(DetailsCard, {
    detail: baseColumn,
    mode: 'view',
  }));
  assert.doesNotMatch(markup, /Allowed values/);
});
```

The production mutation this catches is hiding enum data, dropping notes,
reordering values, showing the section on every column, or removing bounded
scrolling.

- [ ] **Step 2: Run the focused renderer test and verify RED**

Run:

```bash
rtk npm run build -w @dbml-canvas/renderer
rtk node --test packages/renderer/test/details-card.test.mjs
```

Expected: FAIL because the `Allowed values` markup and styles do not exist.

- [ ] **Step 3: Implement the minimal semantic enum list**

In `DetailsCard.tsx`, between Default and References, render only for a column
whose enum has values:

```tsx
{isColumn && detail.enum && detail.enum.values.length > 0 ? (
  <section className="dbml-details-section">
    <h4>Allowed values</h4>
    <ul className="dbml-details-list dbml-enum-values" aria-label={`${detail.enum.name} values`}>
      {detail.enum.values.map((value) => (
        <li key={value.name}>
          <code>{value.name}</code>
          {value.note ? <span>{value.note}</span> : null}
        </li>
      ))}
    </ul>
  </section>
) : null}
```

In `styles.css`, use existing theme tokens and add a bounded list with a subtle
accent rail:

```css
.dbml-enum-values {
  max-height: 180px;
  overflow-y: auto;
  border-left: 2px solid color-mix(in srgb, var(--dbml-accent) 45%, transparent);
}

.dbml-enum-values li {
  display: grid;
  gap: 2px;
  padding-left: 10px;
}

.dbml-enum-values code { color: var(--dbml-accent); }
.dbml-enum-values span { color: var(--dbml-muted); }
```

Adapt spacing to the existing `.dbml-details-list` rules without changing the
card width or introducing new colors or fonts.

- [ ] **Step 4: Run focused and full renderer tests and verify GREEN**

Run:

```bash
rtk npm run test -w @dbml-canvas/renderer
```

Expected: all renderer tests PASS.

- [ ] **Step 5: Commit the enum UI slice**

```bash
rtk git add packages/renderer/src/DetailsCard.tsx packages/renderer/src/styles.css packages/renderer/test/details-card.test.mjs
rtk git commit -m "feat(renderer): show enum values in column details"
```

---

### Task 4: Shared-Host Verification and Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed core and renderer changes.
- Produces: verified web, VS Code, and IntelliJ artifacts using the shared renderer.

- [ ] **Step 1: Update the implemented-feature summary**

Change the README hover detail bullet to explicitly include enum allowed values
and optional value notes. Do not add a separate architecture section because the
shared renderer boundary is already documented.

- [ ] **Step 2: Run the full JavaScript verification**

```bash
rtk npm test
rtk npm run build
rtk npm run build:vscode
rtk git diff --check
```

Expected: every command exits 0. The existing Vite large-chunk warning is
non-blocking.

- [ ] **Step 3: Run IntelliJ packaging verification**

From `apps/intellij-plugin`:

```bash
rtk /bin/zsh -lc 'JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.8/Contents/Home ./gradlew build --no-daemon'
```

Expected: `BUILD SUCCESSFUL` and the `copyWebview` task runs or is up to date.

- [ ] **Step 4: Commit documentation**

```bash
rtk git add README.md
rtk git commit -m "docs: document enum hover details"
```

- [ ] **Step 5: Perform a fresh review and inspect repository state**

Review the complete branch for enum resolution correctness, hover-card UX,
accessibility, and regressions. Then run:

```bash
rtk git status --short --branch
rtk git log --oneline -5
```

Expected: clean worktree on `feat/enum-hover-values` with all verification
commands recorded as passing.
