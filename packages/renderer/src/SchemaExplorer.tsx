import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import type { ErdSchema } from '@dbml-canvas/core';
import {
  buildSchemaExplorerResults,
  reconcileExpandedTableIds,
  type SchemaSearchSelection,
  type SchemaSortDirection,
  type TextMatchRange,
} from './schema-explorer.js';

export interface SchemaExplorerProps {
  schema: ErdSchema;
  selection?: SchemaSearchSelection;
  onSelectTable: (tableId: string) => void;
  onSelectColumn: (tableId: string, columnId: string) => void;
  onClose: () => void;
}

export interface SchemaExplorerPanelProps extends SchemaExplorerProps {
  query: string;
  sortDirection: SchemaSortDirection;
  expandedTableIds: ReadonlySet<string>;
  searchInputRef?: Ref<HTMLInputElement>;
  onQueryChange: (query: string) => void;
  onToggleSort: () => void;
  onToggleTable: (tableId: string) => void;
}

export function SchemaExplorer({
  schema,
  selection,
  onSelectTable,
  onSelectColumn,
  onClose,
}: SchemaExplorerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortDirection, setSortDirection] = useState<SchemaSortDirection>('asc');
  const [expandedTableIds, setExpandedTableIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExpandedTableIds((current) => reconcileExpandedTableIds(schema, current));
  }, [schema]);

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
    onClose();
  };

  const toggleOpen = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="dbml-schema-explorer-trigger nodrag nopan nowheel"
        aria-label={open ? 'Close schema explorer' : 'Open schema explorer'}
        aria-expanded={open}
        aria-controls="dbml-schema-explorer"
        onClick={toggleOpen}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
          <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      {open ? (
        <SchemaExplorerPanel
          schema={schema}
          {...(selection ? { selection } : {})}
          onSelectTable={onSelectTable}
          onSelectColumn={onSelectColumn}
          onClose={close}
          query={query}
          sortDirection={sortDirection}
          expandedTableIds={expandedTableIds}
          searchInputRef={searchInputRef}
          onQueryChange={setQuery}
          onToggleSort={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
          onToggleTable={(tableId) => setExpandedTableIds((current) => {
            const next = new Set(current);
            if (next.has(tableId)) next.delete(tableId);
            else next.add(tableId);
            return next;
          })}
        />
      ) : null}
    </>
  );
}

export function SchemaExplorerPanel({
  schema,
  selection,
  onSelectTable,
  onSelectColumn,
  onClose,
  query,
  sortDirection,
  expandedTableIds,
  searchInputRef,
  onQueryChange,
  onToggleSort,
  onToggleTable,
}: SchemaExplorerPanelProps) {
  const results = buildSchemaExplorerResults(schema, query, sortDirection);
  const displayExpandedTableIds = new Set(expandedTableIds);
  for (const result of results) {
    if (result.autoExpanded) displayExpandedTableIds.add(result.table.id);
  }
  const sortAction = sortDirection === 'asc' ? 'Sort tables descending' : 'Sort tables ascending';

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) onClose();
  };

  return (
    <section
      id="dbml-schema-explorer"
      className="dbml-schema-explorer nodrag nopan nowheel"
      aria-label="Schema explorer"
      onKeyDown={handleKeyDown}
    >
      <header className="dbml-schema-explorer-header">
        <label>
          <span className="dbml-schema-explorer-label">Search tables and columns</span>
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search tables and columns"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <button type="button" aria-label={sortAction} title={sortAction} onClick={onToggleSort}>
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
        <button type="button" aria-label="Close schema explorer" onClick={onClose}>×</button>
      </header>
      {results.length === 0 ? <p>검색 결과가 없습니다.</p> : (
        <ul className="dbml-schema-explorer-results">
          {results.map(({ table, tableMatchRanges, columns }) => {
            const expanded = displayExpandedTableIds.has(table.id);
            const tablePanelId = `dbml-schema-explorer-table-${table.id}`;
            const selectedTable = selection?.kind === 'table' && selection.tableId === table.id;
            return (
              <li key={table.id} className="dbml-schema-explorer-table">
                <div className="dbml-schema-explorer-table-row">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={tablePanelId}
                    aria-current={selectedTable ? 'true' : undefined}
                    onClick={() => {
                      onToggleTable(table.id);
                      onSelectTable(table.id);
                    }}
                  >
                    <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>
                    <span aria-hidden="true">▤</span>
                    {renderMatchFragments(table.displayName, tableMatchRanges)}
                  </button>
                  <span className="dbml-schema-explorer-column-count">{columns.length}</span>
                </div>
                {expanded ? (
                  <ul id={tablePanelId} className="dbml-schema-explorer-columns">
                    {columns.map(({ column, matchRanges }) => {
                      const selectedColumn = selection?.kind === 'column'
                        && selection.tableId === table.id
                        && selection.columnId === column.id;
                      return (
                        <li key={column.id}>
                          <button
                            type="button"
                            aria-current={selectedColumn ? 'true' : undefined}
                            onClick={() => onSelectColumn(table.id, column.id)}
                          >
                            {renderMatchFragments(column.name, matchRanges)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function renderMatchFragments(value: string, ranges: readonly TextMatchRange[]) {
  if (ranges.length === 0) return value;
  const fragments: ReactNode[] = [];
  let start = 0;
  ranges.forEach((range, index) => {
    if (start < range.start) fragments.push(value.slice(start, range.start));
    fragments.push(<mark key={`${range.start}:${range.end}:${index}`}>{value.slice(range.start, range.end)}</mark>);
    start = range.end;
  });
  if (start < value.length) fragments.push(value.slice(start));
  return fragments;
}
