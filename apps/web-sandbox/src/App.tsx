import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  DbmlCoreSchemaParser,
  EMPTY_LAYOUT,
  parseLayout,
  pruneLayout,
  serializeLayout,
  type ErdLayout,
  type DbmlNoteTarget,
  type ErdSchema,
} from '@dbml-canvas/core';
import { ErdCanvas } from '@dbml-canvas/renderer';
import { SAMPLE_DBML } from './sample.js';
import {
  KEYBOARD_RESIZE_STEP,
  MAX_SOURCE_RATIO,
  MIN_SOURCE_WIDTH,
  SOURCE_WIDTH_KEY,
  clampSourceWidth,
  defaultSourceWidth,
  resolveSourceWidth,
} from './split-pane.js';
import { applyValidatedNoteEdit } from './source-edit.js';

const parser = new DbmlCoreSchemaParser();
const SOURCE_KEY = 'dbml-canvas/source';
const LAYOUT_KEY = 'dbml-canvas/layout';

export function App() {
  const workspaceRef = useRef<HTMLElement>(null);
  const [source, setSource] = useState(() => localStorage.getItem(SOURCE_KEY) ?? SAMPLE_DBML);
  const [layout, setLayout] = useState<ErdLayout>(() => {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (!saved) return EMPTY_LAYOUT;
    try {
      return parseLayout(JSON.parse(saved));
    } catch {
      return EMPTY_LAYOUT;
    }
  });
  const [schema, setSchema] = useState<ErdSchema | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [sourceWidth, setSourceWidth] = useState<number>();
  const [draggingSeparator, setDraggingSeparator] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const nextSchema = parser.parse(source, { filepath: 'schema.dbml' });
        setSchema(nextSchema);
        setError(undefined);
        setLayout((current) => pruneLayout(current, nextSchema));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        parser.parse(source, { filepath: 'schema.dbml' });
        localStorage.setItem(SOURCE_KEY, source);
      } catch {
        // Keep the last valid save; don't persist unparseable DBML.
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [source]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, serializeLayout(layout));
  }, [layout]);

  const workspaceWidth = useCallback(
    () => workspaceRef.current?.getBoundingClientRect().width ?? 0,
    [],
  );

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

  const handleSeparatorLostPointerCapture = useCallback(() => {
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
    const current = sourceWidth
      ?? resolveSourceWidth(localStorage.getItem(SOURCE_WIDTH_KEY), available);
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    applySourceWidth(current + direction * KEYBOARD_RESIZE_STEP, true);
  }, [applySourceWidth, sourceWidth, workspaceWidth]);

  const stats = useMemo(() => ({
    tables: schema?.tables.length ?? 0,
    relationships: schema?.relationships.length ?? 0,
  }), [schema]);

  const downloadLayout = () => {
    const blob = new Blob([serializeLayout(layout)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'schema.dbml.layout.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleEditNote = useCallback(async (target: DbmlNoteTarget, note: string) => {
    const updated = applyValidatedNoteEdit(source, target, note);
    setSource(updated);
  }, [source]);

  return (
    <main className="sandbox" data-theme={theme}>
      <header className="sandbox-toolbar">
        <div>
          <h1>DBML Canvas</h1>
          <p>{stats.tables} tables · {stats.relationships} relationships</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" onClick={() => setLayout(EMPTY_LAYOUT)}>Reset layout</button>
          <button type="button" onClick={downloadLayout}>Download layout</button>
        </div>
      </header>

      <section
        ref={workspaceRef}
        className={`workspace${draggingSeparator ? ' is-resizing' : ''}`}
        style={sourceWidth === undefined
          ? undefined
          : { '--source-pane-width': `${sourceWidth}px` } as CSSProperties}
      >
        <aside className="source-pane">
          <div className="pane-title">schema.dbml</div>
          <textarea
            aria-label="DBML source"
            spellCheck={false}
            value={source}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setSource(event.target.value)}
          />
          {error ? <pre className="parse-error">{error}</pre> : null}
        </aside>

        <div
          className="pane-separator"
          role="separator"
          aria-label="Resize DBML editor"
          aria-orientation="vertical"
          aria-valuemin={MIN_SOURCE_WIDTH}
          aria-valuemax={Math.max(
            MIN_SOURCE_WIDTH,
            Math.round(workspaceWidth() * MAX_SOURCE_RATIO),
          )}
          aria-valuenow={Math.round(sourceWidth ?? MIN_SOURCE_WIDTH)}
          tabIndex={0}
          onPointerDown={handleSeparatorPointerDown}
          onPointerMove={handleSeparatorPointerMove}
          onPointerUp={handleSeparatorPointerUp}
          onPointerCancel={handleSeparatorPointerCancel}
          onLostPointerCapture={handleSeparatorLostPointerCapture}
          onDoubleClick={handleSeparatorDoubleClick}
          onKeyDown={handleSeparatorKeyDown}
        />

        <section className="canvas-pane">
          {schema ? (
            <ErdCanvas
              schema={schema}
              layout={layout}
              colorMode={theme}
              onLayoutChange={setLayout}
              onEditNote={handleEditNote}
              onOpenSource={(range) => console.info('Open source', range)}
            />
          ) : (
            <div className="empty-state">Enter valid DBML to render the diagram.</div>
          )}
        </section>
      </section>
    </main>
  );
}
