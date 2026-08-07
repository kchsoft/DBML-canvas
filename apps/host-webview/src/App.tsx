import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DbmlCoreSchemaParser,
  EMPTY_LAYOUT,
  type DbmlNoteTarget,
  type ErdLayout,
  type ErdSchema,
  type HostToWebviewMessage,
} from '@dbml-canvas/core';
import { ErdCanvas } from '@dbml-canvas/renderer';
import { postToHost } from './host.js';
import {
  readThemePreference,
  resolveCanvasTheme,
  toggleCanvasTheme,
  writeThemePreference,
  type CanvasTheme,
  type ThemePreference,
} from './theme-preference.js';
import { createNoteEditSession } from './note-edit-session.js';

const parser = new DbmlCoreSchemaParser();

function localThemeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function App() {
  const [schema, setSchema] = useState<ErdSchema | undefined>(undefined);
  const [layout, setLayout] = useState<ErdLayout>(EMPTY_LAYOUT);
  const [error, setError] = useState<string | undefined>(undefined);
  const [hostTheme, setHostTheme] = useState<CanvasTheme>('light');
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => (
    readThemePreference(typeof window === 'undefined' ? undefined : localThemeStorage())
  ));
  const saveTimer = useRef<number | undefined>(undefined);
  const sourceRef = useRef('');
  const revisionRef = useRef('');
  const noteEditSession = useMemo(() => createNoteEditSession(postToHost), []);
  const theme = resolveCanvasTheme(hostTheme, themePreference);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<HostToWebviewMessage>) => {
      const message = event.data;
      if (!message || typeof message !== 'object' || !('type' in message)) return;

      if (message.type === 'host/set-theme') {
        setHostTheme(message.payload.theme);
        return;
      }

      if (message.type === 'host/edit-note-result') {
        noteEditSession.settle(message);
        return;
      }

      if (message.type === 'host/load') {
        try {
          sourceRef.current = message.payload.source;
          revisionRef.current = message.payload.revision ?? '';
          const parsed = parser.parse(message.payload.source, {
            ...(message.payload.filepath ? { filepath: message.payload.filepath } : {}),
          });
          setSchema(parsed);
          setLayout(message.payload.layout);
          setError(undefined);
          document.title = message.payload.title ?? 'DBML Canvas';
        } catch (cause) {
          const messageText = cause instanceof Error ? cause.message : String(cause);
          setError(messageText);
          postToHost({ type: 'webview/error', payload: { message: messageText } });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    postToHost({ type: 'webview/ready' });
    return () => {
      window.removeEventListener('message', handleMessage);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [noteEditSession]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const handleLayoutChange = useCallback((nextLayout: ErdLayout) => {
    setLayout(nextLayout);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      postToHost({ type: 'webview/save-layout', payload: { layout: nextLayout } });
    }, 250);
  }, []);

  const handleThemeToggle = useCallback(() => {
    const nextTheme = toggleCanvasTheme(theme);
    setThemePreference(nextTheme);
    writeThemePreference(localThemeStorage(), nextTheme);
  }, [theme]);

  const handleEditNote = useCallback((target: DbmlNoteTarget, note: string) => (
    noteEditSession.request(sourceRef.current, revisionRef.current, target, note)
  ), [noteEditSession]);

  return (
    <div className="host-canvas-shell">
      <button
        type="button"
        className="host-theme-toggle"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        onClick={handleThemeToggle}
      >
        <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      </button>
      {error ? <pre className="host-error">{error}</pre> : null}
      {!error && !schema ? (
        <div className="host-empty">Open a DBML file and launch DBML Canvas.</div>
      ) : null}
      {!error && schema ? (
        <ErdCanvas
          schema={schema}
          layout={layout}
          colorMode={theme}
          onLayoutChange={handleLayoutChange}
          onEditNote={handleEditNote}
          onOpenSource={(range) => postToHost({ type: 'webview/open-source', payload: { range } })}
        />
      ) : null}
    </div>
  );
}
