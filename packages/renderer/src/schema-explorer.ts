import type { ErdColumn, ErdSchema, ErdTable } from '@dbml-canvas/core';

export type SchemaSortDirection = 'asc' | 'desc';

export interface TextMatchRange {
  start: number;
  end: number;
}

export interface SchemaExplorerColumnResult {
  column: ErdColumn;
  matchRanges: TextMatchRange[];
}

export interface SchemaExplorerTableResult {
  table: ErdTable;
  tableMatchRanges: TextMatchRange[];
  columns: SchemaExplorerColumnResult[];
  matchingColumnIds: string[];
  autoExpanded: boolean;
}

export type SchemaSearchSelection =
  | { kind: 'table'; tableId: string }
  | { kind: 'column'; tableId: string; columnId: string };

export function normalizeSchemaQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function findTextMatchRanges(value: string, normalizedQuery: string): TextMatchRange[] {
  if (!normalizedQuery) return [];
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  let originalIndex = 0;
  for (const character of value) {
    const normalizedCharacter = character.toLowerCase();
    for (let index = 0; index < normalizedCharacter.length; index += 1) {
      originalStarts.push(originalIndex);
      originalEnds.push(originalIndex + character.length);
    }
    originalIndex += character.length;
  }
  const normalizedValue = value.toLowerCase();
  const ranges: TextMatchRange[] = [];
  let from = 0;
  while (from <= normalizedValue.length - normalizedQuery.length) {
    const start = normalizedValue.indexOf(normalizedQuery, from);
    if (start < 0) break;
    ranges.push({
      start: originalStarts[start]!,
      end: originalEnds[start + normalizedQuery.length - 1]!,
    });
    from = start + normalizedQuery.length;
  }
  return ranges;
}

export function buildSchemaExplorerResults(
  schema: ErdSchema,
  query: string,
  direction: SchemaSortDirection,
): SchemaExplorerTableResult[] {
  const normalizedQuery = normalizeSchemaQuery(query);
  return schema.tables
    .map((table, index) => ({ table, index }))
    .sort((left, right) => {
      const leftName = left.table.displayName.toLowerCase();
      const rightName = right.table.displayName.toLowerCase();
      const nameComparison = leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      if (nameComparison === 0) return left.index - right.index;
      return direction === 'desc' ? -nameComparison : nameComparison;
    })
    .map(({ table }) => {
      const tableMatchRanges = findTextMatchRanges(table.displayName, normalizedQuery);
      const columns = table.columns.map((column) => ({
        column,
        matchRanges: findTextMatchRanges(column.name, normalizedQuery),
      }));
      const matchingColumnIds = columns
        .filter(({ matchRanges }) => matchRanges.length > 0)
        .map(({ column }) => column.id);
      if (!normalizedQuery || tableMatchRanges.length > 0 || matchingColumnIds.length > 0) {
        return {
          table,
          tableMatchRanges,
          columns,
          matchingColumnIds,
          autoExpanded: matchingColumnIds.length > 0,
        };
      }
      return undefined;
    })
    .filter((result): result is SchemaExplorerTableResult => result !== undefined);
}

export function reconcileExpandedTableIds(
  schema: ErdSchema,
  expandedTableIds: ReadonlySet<string>,
): Set<string> {
  const tableIds = new Set(schema.tables.map((table) => table.id));
  return new Set([...expandedTableIds].filter((tableId) => tableIds.has(tableId)));
}

export function reconcileSchemaSearchSelection(
  schema: ErdSchema,
  selection: SchemaSearchSelection | undefined,
): SchemaSearchSelection | undefined {
  if (!selection) return undefined;
  const table = schema.tables.find(({ id }) => id === selection.tableId);
  if (!table) return undefined;
  if (selection.kind === 'table') return selection;
  return table.columns.some(({ id }) => id === selection.columnId) ? selection : undefined;
}
