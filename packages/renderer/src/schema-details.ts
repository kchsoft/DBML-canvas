import type {
  DbmlNoteTarget,
  ErdIndex,
  ErdRelationshipEndpoint,
  ErdSchema,
} from '@dbml-canvas/core';

export type CompactConstraintLabel = 'PK' | 'FK' | 'UNIQUE';

export interface ForeignKeyDetail {
  tableId: string;
  tableName: string;
  columnIds: string[];
  columnNames: string[];
}

export interface ColumnDetails {
  kind: 'column';
  id: string;
  name: string;
  type: string;
  note?: string;
  defaultValue?: string;
  indexes: ErdIndex[];
  compactLabels: CompactConstraintLabel[];
  fullConstraints: string[];
  foreignKeys: ForeignKeyDetail[];
  noteTarget?: DbmlNoteTarget;
}

export interface TableDetails {
  kind: 'table';
  id: string;
  name: string;
  note?: string;
  indexes: ErdIndex[];
  columns: Record<string, ColumnDetails>;
  noteTarget?: DbmlNoteTarget;
}

export type SchemaDetails = Record<string, TableDetails>;

export function createSchemaDetails(schema: ErdSchema): SchemaDetails {
  const tablesById = new Map(schema.tables.map((table) => [table.id, table]));
  const columnsById = new Map(
    schema.tables.flatMap((table) => table.columns.map((column) => [column.id, column] as const)),
  );
  const foreignKeys = new Map<string, ForeignKeyDetail[]>();

  for (const relationship of schema.relationships) {
    const endpoints = findReferencingEndpoint(relationship.source, relationship.target, columnsById);
    if (!endpoints) continue;
    const [referencing, referenced] = endpoints;
    const referencedTable = tablesById.get(referenced.tableId);
    const detail: ForeignKeyDetail = {
      tableId: referenced.tableId,
      tableName: referencedTable?.displayName ?? referenced.tableId,
      columnIds: referenced.columnIds,
      columnNames: referenced.columnIds.map((id) => columnsById.get(id)?.name ?? id.split('.').at(-1) ?? id),
    };

    for (const columnId of referencing.columnIds) {
      const current = foreignKeys.get(columnId) ?? [];
      current.push(detail);
      foreignKeys.set(columnId, current);
    }
  }

  return Object.fromEntries(schema.tables.map((table) => {
    const indexes = table.indexes ?? [];
    const columns = Object.fromEntries(table.columns.map((column) => {
      const columnForeignKeys = foreignKeys.get(column.id) ?? [];
      const compactLabels: CompactConstraintLabel[] = [];
      if (column.primaryKey) compactLabels.push('PK');
      if (columnForeignKeys.length > 0) compactLabels.push('FK');
      if (column.unique) compactLabels.push('UNIQUE');

      const fullConstraints: string[] = [];
      if (column.primaryKey) fullConstraints.push('PRIMARY KEY');
      if (columnForeignKeys.length > 0) fullConstraints.push('FOREIGN KEY');
      if (column.unique) fullConstraints.push('UNIQUE');
      if (column.increment) fullConstraints.push('AUTO INCREMENT');
      if (!column.nullable) fullConstraints.push('NOT NULL');

      const detail: ColumnDetails = {
        kind: 'column',
        id: column.id,
        name: column.name,
        type: column.type,
        indexes: indexes.filter((index) => index.members.some((member) => member.value === column.name)),
        compactLabels,
        fullConstraints,
        foreignKeys: columnForeignKeys,
        ...(column.note ? { note: column.note } : {}),
        ...(column.defaultValue ? { defaultValue: column.defaultValue } : {}),
        ...(column.source ? {
          noteTarget: {
            kind: 'column',
            id: column.id,
            source: column.source,
            ...(column.noteSource ? { noteSource: column.noteSource } : {}),
          },
        } : {}),
      };
      return [column.id, detail];
    }));

    const detail: TableDetails = {
      kind: 'table',
      id: table.id,
      name: table.displayName,
      indexes,
      columns,
      ...(table.note ? { note: table.note } : {}),
      ...(table.source ? {
        noteTarget: {
          kind: 'table',
          id: table.id,
          source: table.source,
          ...(table.noteSource ? { noteSource: table.noteSource } : {}),
        },
      } : {}),
    };
    return [table.id, detail];
  }));
}

function findReferencingEndpoint(
  source: ErdRelationshipEndpoint,
  target: ErdRelationshipEndpoint,
  columnsById: Map<string, ErdSchema['tables'][number]['columns'][number]>,
): [ErdRelationshipEndpoint, ErdRelationshipEndpoint] | undefined {
  if (source.cardinality === '*' && target.cardinality !== '*') return [source, target];
  if (target.cardinality === '*' && source.cardinality !== '*') return [target, source];

  if (source.cardinality === '1' && target.cardinality === '1') {
    const sourceIsPrimary = endpointIsPrimary(source, columnsById);
    const targetIsPrimary = endpointIsPrimary(target, columnsById);
    if (sourceIsPrimary && !targetIsPrimary) return [target, source];
    if (targetIsPrimary && !sourceIsPrimary) return [source, target];
  }
  return undefined;
}

function endpointIsPrimary(
  endpoint: ErdRelationshipEndpoint,
  columnsById: Map<string, ErdSchema['tables'][number]['columns'][number]>,
): boolean {
  return endpoint.columnIds.length > 0
    && endpoint.columnIds.every((columnId) => columnsById.get(columnId)?.primaryKey === true);
}
