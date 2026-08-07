# DBML Note Details and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dbdiagram-style table and column detail cards, edit DBML Notes safely from every host, simplify compact constraint labels, and remove layout-backed memos.

**Architecture:** Core owns stable DBML metadata, source-range mapping, minimal Note text edits, and host protocol types. The shared renderer derives relationship details and emits semantic Note edits without writing files; the browser, VS Code, and IntelliJ hosts apply validated minimal edits through their native document mechanisms. Table colors remain layout metadata, while notes live only in DBML.

**Tech Stack:** TypeScript 5.8, React 19, React Flow 12, Node 22 test runner, VS Code extension API, Kotlin 2.2, IntelliJ Platform 2025.3/JDK 21.

## Global Constraints

- `.dbml` is the only source of truth for table and column notes.
- Remove layout `memo` support without migration or compatibility code.
- Compact rows show only `PK`, `FK`, and `UNIQUE`, in that order; detailed cards may show full constraint names including `AUTO INCREMENT`.
- Keep exactly five theme-aware table colors plus reset; do not add custom colors.
- Preserve unrelated DBML formatting by applying one validated text edit.
- Reject stale edits instead of overwriting newer document content.
- Support light and dark themes plus keyboard focus and Escape dismissal.
- Do not build or install an IntelliJ plugin ZIP.

---

### Task 1: Stable schema metadata and layout memo removal

**Files:**
- Modify: `packages/core/src/model.ts`
- Modify: `packages/core/src/dbml-core-adapter.ts`
- Modify: `packages/core/src/layout.ts`
- Modify: `packages/core/test/core.test.mjs`

**Interfaces:**
- Produces: `ErdIndex`, `ErdIndexMember`, `ErdTable.indexes`, `ErdColumn.defaultValue`, `ErdTable.noteSource`, and `ErdColumn.noteSource`.
- Produces: `NodeAnnotationPatch` with only `color?: TableColor | null` and `NodeLayout` with no `memo`.

- [ ] **Step 1: Add failing core tests**

Extend the mapping test with a parameterized type, default, table/column notes and tokens, and indexes:

```js
const token = (start, end) => ({
  start: { line: 1, column: start + 1, offset: start },
  end: { line: 1, column: end + 1, offset: end },
});
const schema = mapDatabase({
  schemas: [{
    name: 'public',
    tables: [{
      name: 'member',
      note: 'Member aggregate',
      noteToken: token(90, 114),
      fields: [{
        name: 'email',
        type: { type_name: 'varchar(255)', args: '255' },
        unique: true,
        not_null: true,
        note: 'Login address',
        noteToken: token(42, 63),
        dbdefault: { value: 'unknown@example.com', type: 'string' },
      }],
      indexes: [{
        name: 'uq_member_email',
        unique: true,
        columns: [{ value: 'email' }],
      }],
    }],
    refs: [],
  }],
});
assert.equal(schema.tables[0].columns[0].type, 'varchar(255)');
assert.equal(schema.tables[0].columns[0].defaultValue, "'unknown@example.com'");
assert.deepEqual(schema.tables[0].indexes[0], {
  name: 'uq_member_email',
  members: [{ value: 'email' }],
  unique: true,
  primaryKey: false,
});
```

Change the layout test so an input `memo` is omitted, annotation updates accept only colors, and serialized output contains no `memo`.

- [ ] **Step 2: Run the core test and verify RED**

Run: `npm run test -w @dbml-canvas/core`

Expected: FAIL because parameterized types are duplicated, index/default/note ranges are absent, and layout parsing still preserves `memo`.

- [ ] **Step 3: Implement minimal schema mapping and remove memo state**

Add these stable model shapes:

```ts
export interface ErdIndexMember { value: string; }
export interface ErdIndex {
  name?: string;
  members: ErdIndexMember[];
  unique: boolean;
  primaryKey: boolean;
  note?: string;
}
```

Map parser `indexes`, `dbdefault`, and `noteToken` into those types. Normalize a type by appending `(${args})` only when `type_name` does not already end with the same argument list. Remove `memo` from `NodeLayout`, `NodeAnnotationPatch`, `updateNodeAnnotation`, and `parseLayout`.

- [ ] **Step 4: Run the core test and verify GREEN**

Run: `npm run test -w @dbml-canvas/core`

Expected: all core tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/core/src/model.ts packages/core/src/dbml-core-adapter.ts packages/core/src/layout.ts packages/core/test/core.test.mjs
git commit -m "feat: expose DBML detail metadata"
```

---

### Task 2: Minimal DBML Note text edits and protocol

**Files:**
- Create: `packages/core/src/note-edit.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/protocol.ts`
- Create: `packages/core/test/note-edit.test.mjs`

**Interfaces:**
- Produces: `DbmlNoteTarget`, `DbmlTextEdit`, `createDbmlNoteEdit(source, target, note)`, `applyDbmlTextEdit(source, edit)`.
- Produces: `WebviewEditNoteMessage`, `HostEditNoteResultMessage`, and `HostLoadMessage.payload.revision`.

- [ ] **Step 1: Write failing edit tests**

Cover table and column Note creation, replacement, deletion, escaping, and stale expected text:

```js
const edit = createDbmlNoteEdit(source, {
  kind: 'column',
  id: 'public.member.email',
  source: column.source,
  noteSource: column.noteSource,
}, "Owner's login\naddress");
const updated = applyDbmlTextEdit(source, edit);
const reparsed = parser.parse(updated);
assert.equal(reparsed.tables[0].columns[0].note, "Owner's login\naddress");
assert.throws(
  () => applyDbmlTextEdit(source.replace('email', 'login'), edit),
  /source changed/i,
);
```

For a missing table Note, assert insertion immediately before the closing table brace. For a missing column Note, assert insertion into an existing settings list or creation of `[note: '...']`. For an empty note, assert removal of the entire Note setting without a dangling comma.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run build -w @dbml-canvas/core && node --test packages/core/test/note-edit.test.mjs`

Expected: FAIL because `note-edit.js` and its exports do not exist.

- [ ] **Step 3: Implement minimal edit generation and validation**

Define exact transport-safe edits:

```ts
export interface DbmlTextEdit {
  startOffset: number;
  endOffset: number;
  expectedText: string;
  newText: string;
}

export type DbmlNoteTarget =
  | { kind: 'table'; id: string; source: SourceRange; noteSource?: SourceRange }
  | { kind: 'column'; id: string; source: SourceRange; noteSource?: SourceRange };
```

`createDbmlNoteEdit` trims no meaningful note content, escapes backslashes, quotes and newlines, edits an existing `noteSource`, or uses the target source range as an insertion anchor. `applyDbmlTextEdit` verifies bounds and exact `expectedText` before splicing.

Add protocol messages with request correlation:

```ts
interface WebviewEditNoteMessage {
  type: 'webview/edit-note';
  payload: {
    requestId: string;
    revision: string;
    target: { kind: 'table' | 'column'; id: string };
    note: string;
    edit: DbmlTextEdit;
  };
}
interface HostEditNoteResultMessage {
  type: 'host/edit-note-result';
  payload: { requestId: string; ok: boolean; message?: string };
}
```

- [ ] **Step 4: Run core tests and verify GREEN**

Run: `npm run test -w @dbml-canvas/core`

Expected: all core tests PASS, including parse-after-edit assertions.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/core/src/note-edit.ts packages/core/src/index.ts packages/core/src/protocol.ts packages/core/test/note-edit.test.mjs
git commit -m "feat: create safe DBML note edits"
```

---

### Task 3: Derived relationship and detail-card data

**Files:**
- Create: `packages/renderer/src/schema-details.ts`
- Modify: `packages/renderer/src/index.ts`
- Modify: `packages/renderer/src/graph.ts`
- Modify: `packages/renderer/src/ErdCanvas.tsx`
- Create: `packages/renderer/test/schema-details.test.mjs`
- Modify: `packages/renderer/test/table-annotations.test.mjs`

**Interfaces:**
- Produces: `TableDetails`, `ColumnDetails`, `ForeignKeyDetail`, and `createSchemaDetails(schema)`.
- Produces: `TableNodeData.details` and `TableNodeData.onEditNote`.
- `ErdCanvasProps.onEditNote` consumes `(target: DbmlNoteTarget, note: string) => Promise<void> | void` so native host failures can remain attached to the pinned editor.

- [ ] **Step 1: Write failing renderer detail tests**

Create a schema with a referenced PK, a referencing FK, a unique column, indexes, defaults, and increments. Assert:

```js
const details = createSchemaDetails(schema);
assert.deepEqual(details['public.posts'].columns['public.posts.member_id'].compactLabels, ['FK']);
assert.deepEqual(details['public.members'].columns['public.members.id'].compactLabels, ['PK']);
assert.deepEqual(details['public.members'].columns['public.members.email'].compactLabels, ['UNIQUE']);
assert.deepEqual(details['public.posts'].columns['public.posts.id'].fullConstraints,
  ['PRIMARY KEY', 'AUTO INCREMENT', 'NOT NULL']);
assert.equal(details['public.members'].indexes[0].name, 'uq_members_email');
```

Also assert the referenced PK is not marked `FK`, and an ambiguous one-to-one relationship is not guessed.

- [ ] **Step 2: Run the focused renderer test and verify RED**

Run: `npm run build -w @dbml-canvas/core && npm run build -w @dbml-canvas/renderer && node --test packages/renderer/test/schema-details.test.mjs`

Expected: FAIL because `schema-details.js` does not exist.

- [ ] **Step 3: Implement pure detail derivation and node data flow**

Use relationship cardinality `*` to identify the referencing endpoint. For one-to-one relationships, choose the only endpoint whose participating columns are not primary keys; otherwise leave FK ownership unresolved. Build full constraints in the fixed order and attach referenced table/column labels. Pass the per-table details and Note edit callback into every flow node.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run: `npm run test -w @dbml-canvas/renderer`

Expected: all renderer tests PASS, and the annotation test expects only `{ x, y, color }` layout data.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/renderer/src/schema-details.ts packages/renderer/src/index.ts packages/renderer/src/graph.ts packages/renderer/src/ErdCanvas.tsx packages/renderer/test/schema-details.test.mjs packages/renderer/test/table-annotations.test.mjs
git commit -m "feat: derive table and column details"
```

---

### Task 4: Hover detail cards and five-color settings UI

**Files:**
- Create: `packages/renderer/src/DetailsCard.tsx`
- Create: `packages/renderer/src/TableColorSettings.tsx`
- Modify: `packages/renderer/src/TableNode.tsx`
- Modify: `packages/renderer/src/styles.css`
- Create: `packages/renderer/test/details-content.test.mjs`

**Interfaces:**
- `DetailsCard` consumes one `TableDetails` or `ColumnDetails`, edit state, and async Save/Cancel callbacks plus an optional save error.
- `TableColorSettings` consumes `color?: TableColor` and `onChange(color: TableColor | null)`.
- `TableNode` opens table details only from the header and column details only from the corresponding row.

- [ ] **Step 1: Write failing presentational tests**

Render the standalone cards with `renderToStaticMarkup` and assert semantic content:

```js
const markup = renderToStaticMarkup(createElement(DetailsCard, {
  detail: columnDetails,
  mode: 'view',
  onEdit: () => {},
}));
assert.match(markup, /FOREIGN KEY/);
assert.match(markup, /AUTO INCREMENT/);
assert.match(markup, /Login address/);
assert.match(markup, /uq_members_email/);
```

Render `TableColorSettings`, assert five color buttons and reset, and assert no `Custom`, memo, or `AI` control appears.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run build -w @dbml-canvas/core && npm run build -w @dbml-canvas/renderer && node --test packages/renderer/test/details-content.test.mjs`

Expected: FAIL because the presentational components do not exist.

- [ ] **Step 3: Implement cards, editing, hover delay, and settings**

Use a 200 ms open timer and short close timer in `TableNode`. Focus opens immediately. `Edit note` pins the active card, Save awaits `onEditNote` with the table/column target and keeps the editor open with a readable error when it rejects, Cancel restores the parsed Note, and Escape closes pinned UI. Replace the selected-node toolbar with a header settings button and five-color popover. Add `nodrag nopan nowheel` guards and remove all memo classes and controls.

Update the compact grid so `PK`, `FK`, and `UNIQUE` fit without truncation. Use shared CSS variables for light/dark cards, restrained shadows, viewport-aware left/right placement classes, and accessible focus outlines.

- [ ] **Step 4: Run renderer tests and verify GREEN**

Run: `npm run test -w @dbml-canvas/renderer`

Expected: all renderer tests PASS with no layout memo references.

- [ ] **Step 5: Commit Task 4**

```bash
git add packages/renderer/src/DetailsCard.tsx packages/renderer/src/TableColorSettings.tsx packages/renderer/src/TableNode.tsx packages/renderer/src/styles.css packages/renderer/test/details-content.test.mjs
git commit -m "feat: add schema detail hover cards"
```

---

### Task 5: Browser sandbox and shared host webview Note editing

**Files:**
- Modify: `apps/web-sandbox/src/App.tsx`
- Create: `apps/web-sandbox/src/source-edit.ts`
- Create: `apps/web-sandbox/test/source-edit.test.mjs`
- Modify: `apps/host-webview/src/App.tsx`
- Create: `apps/host-webview/src/note-edit-session.ts`
- Create: `apps/host-webview/test/note-edit-session.test.mjs`

**Interfaces:**
- Browser `applyValidatedNoteEdit(source, target, note)` returns reparsed source or a readable error.
- Host webview `createNoteEditRequest(source, revision, target, note)` returns a protocol message after reparsing the candidate source.
- Host webview `createNoteEditSession()` exposes `request(source, revision, target, note): Promise<WebviewEditNoteMessage>` and `settle(result): void`; result correlation resolves or rejects only the matching request.

- [ ] **Step 1: Write failing browser and webview session tests**

Assert that a valid edit returns reparsable DBML, an invalid/stale edit returns an error, the request carries the current revision, and result correlation matches `requestId`.

```js
const request = createNoteEditRequest(source, '17', target, 'Updated note', 'request-1');
assert.equal(request.payload.revision, '17');
assert.equal(request.payload.target.id, target.id);
assert.doesNotThrow(() => parser.parse(applyDbmlTextEdit(source, request.payload.edit)));
```

- [ ] **Step 2: Run app tests and verify RED**

Run: `npm run test -w @dbml-canvas/web-sandbox && npm run test -w @dbml-canvas/host-webview`

Expected: FAIL because the source-edit/session modules do not exist.

- [ ] **Step 3: Wire source edits into both React apps**

The sandbox calls its validated helper and updates controlled `source`. The host webview stores the latest `host/load` source and revision, builds and posts a validated minimal request on Save, awaits its correlated result, and handles `host/edit-note-result` through the session. Pass the promise-returning `onEditNote` into `ErdCanvas` in both apps.

- [ ] **Step 4: Run app tests and verify GREEN**

Run: `npm run test -w @dbml-canvas/web-sandbox && npm run test -w @dbml-canvas/host-webview`

Expected: all sandbox and host-webview tests PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/web-sandbox/src/App.tsx apps/web-sandbox/src/source-edit.ts apps/web-sandbox/test/source-edit.test.mjs apps/host-webview/src/App.tsx apps/host-webview/src/note-edit-session.ts apps/host-webview/test/note-edit-session.test.mjs
git commit -m "feat: edit DBML notes from web canvases"
```

---

### Task 6: Native VS Code document edits

**Files:**
- Modify: `apps/vscode-extension/src/extension.ts`

**Interfaces:**
- Consumes: `WebviewEditNoteMessage.payload.edit` and `.revision`.
- Produces: `host/edit-note-result` and a following `host/load` from the existing document change listener.

- [ ] **Step 1: Establish the failing type boundary**

Add the new protocol message branch and call an intentionally missing private `applyNoteEdit(message)` method.

- [ ] **Step 2: Run typecheck and verify RED**

Run: `npm run typecheck -w dbml-canvas-vscode`

Expected: FAIL because `applyNoteEdit` is missing.

- [ ] **Step 3: Implement versioned WorkspaceEdit handling**

Send `String(document.version)` in every `host/load`. In `applyNoteEdit`, reject a revision mismatch, validate offsets and `expectedText` against `document.getText()`, convert offsets with `document.positionAt`, and apply one `vscode.WorkspaceEdit.replace`. Send a correlated success or failure result; rely on `onDidChangeTextDocument` for the refreshed load.

- [ ] **Step 4: Run VS Code typecheck and build**

Run: `npm run typecheck -w dbml-canvas-vscode && npm run build:vscode-host`

Expected: both commands PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add apps/vscode-extension/src/extension.ts
git commit -m "feat: apply DBML note edits in VS Code"
```

---

### Task 7: Native IntelliJ document edits

**Files:**
- Modify: `apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt`

**Interfaces:**
- Consumes the same JSON edit payload as VS Code.
- Produces `host/edit-note-result`, native undo/redo, and an updated `host/load`.

- [ ] **Step 1: Add the protocol branch and verify compilation fails**

Route `webview/edit-note` to a missing `editNote(message)` method in `HostMessageHandler`.

- [ ] **Step 2: Run Kotlin compilation and verify RED**

Run from `apps/intellij-plugin` with JDK 21:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home ./gradlew --no-daemon --console=plain compileKotlin
```

Expected: FAIL because `editNote` is unresolved.

- [ ] **Step 3: Implement guarded IntelliJ document editing**

Resolve the current file's `Document` through `FileDocumentManager`, compare `modificationStamp.toString()` with the request revision, validate offsets and expected text, then call `WriteCommandAction.runWriteCommandAction(project, "Edit DBML Note")` to replace the range. Commit through `PsiDocumentManager`, send the correlated result, and call `refresh(file)`. `host/load` sends the current document text and modification stamp rather than reading stale bytes from disk.

- [ ] **Step 4: Compile plugin source without packaging**

Run the same `compileKotlin` command.

Expected: `BUILD SUCCESSFUL`; do not run `buildPlugin`.

- [ ] **Step 5: Commit Task 7**

```bash
git add apps/intellij-plugin/src/main/kotlin/dev/dbmlcanvas/intellij/DbmlCanvasToolWindowFactory.kt
git commit -m "feat: apply DBML note edits in IntelliJ"
```

---

### Task 8: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `VALIDATION.md`

**Interfaces:**
- Documents DBML Note edit ownership, hover details, five-color settings, and host write behavior.

- [ ] **Step 1: Update documentation**

Replace the statement that schema UI is read-only with the exact exception: table and column DBML Notes are editable through minimal native document edits. Document that layout JSON contains positions, viewport, and color only.

- [ ] **Step 2: Run all JavaScript verification**

Run: `npm test && npm run typecheck`

Expected: every core, renderer, sandbox, and host-webview test passes; all TypeScript workspaces typecheck.

- [ ] **Step 3: Compile IntelliJ source without building a ZIP**

Run from `apps/intellij-plugin`:

```bash
JAVA_HOME=/Users/changhyeonkim/Library/Java/JavaVirtualMachines/temurin-21.0.11/Contents/Home ./gradlew --no-daemon --console=plain compileKotlin
```

Expected: `BUILD SUCCESSFUL` and no new file under `build/distributions`.

- [ ] **Step 4: Check diff hygiene and memo removal**

Run:

```bash
rg -n "layout\.memo|memoOpen|memoDraft|dbml-memo" packages apps --glob '!**/dist/**' --glob '!**/build/**'
git diff --check
git status --short
```

Expected: the memo search returns no source matches; diff check is clean; only intentional files and the user's untracked reference images are present.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs/architecture.md VALIDATION.md
git commit -m "docs: describe DBML note editing"
```
