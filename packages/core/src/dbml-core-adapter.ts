import { Parser } from '@dbml/core';
import { makeColumnId, makeRelationshipId, makeTableId } from './ids.js';
import type {
  ErdColumn,
  ErdRelationship,
  ErdSchema,
  ErdTable,
  ParseOptions,
  SchemaParser,
  SourceRange,
} from './model.js';

interface DbmlToken {
  start?: { line?: number; column?: number; offset?: number };
  end?: { line?: number; column?: number; offset?: number };
  filepath?: unknown;
}

interface DbmlField {
  name?: unknown;
  type?: unknown;
  pk?: unknown;
  unique?: unknown;
  not_null?: unknown;
  increment?: unknown;
  dbdefault?: unknown;
  note?: unknown;
  noteToken?: DbmlToken;
  token?: DbmlToken;
  table?: DbmlTable;
}

interface DbmlIndexColumn {
  value?: unknown;
}

interface DbmlIndex {
  name?: unknown;
  unique?: unknown;
  pk?: unknown;
  note?: unknown;
  columns?: DbmlIndexColumn[];
}

interface DbmlTable {
  name?: unknown;
  note?: unknown;
  headerColor?: unknown;
  fields?: DbmlField[];
  indexes?: DbmlIndex[];
  noteToken?: DbmlToken;
  token?: DbmlToken;
  schema?: DbmlSchema;
}

interface DbmlEndpoint {
  relation?: unknown;
  schemaName?: unknown;
  tableName?: unknown;
  fieldNames?: unknown;
  fields?: DbmlField[];
  token?: DbmlToken;
}

interface DbmlRef {
  name?: unknown;
  endpoints?: DbmlEndpoint[];
  onDelete?: unknown;
  onUpdate?: unknown;
  token?: DbmlToken;
}

interface DbmlSchema {
  name?: unknown;
  tables?: DbmlTable[];
  refs?: DbmlRef[];
}

interface DbmlDatabase {
  name?: unknown;
  schemas?: DbmlSchema[];
}

export class DbmlCoreSchemaParser implements SchemaParser {
  private readonly parser = new Parser();

  parse(source: string, options: ParseOptions = {}): ErdSchema {
    const database = this.parser.parse(source, 'dbmlv2') as unknown as DbmlDatabase;
    return mapDatabase(database, options);
  }
}

export function mapDatabase(database: DbmlDatabase, options: ParseOptions = {}): ErdSchema {
  const warnings: string[] = [];
  const tables: ErdTable[] = [];
  const relationships: ErdRelationship[] = [];
  const schemas = Array.isArray(database.schemas) ? database.schemas : [];

  for (const rawSchema of schemas) {
    const schemaName = asNonEmptyString(rawSchema.name) ?? 'public';
    const rawTables = Array.isArray(rawSchema.tables) ? rawSchema.tables : [];

    for (const rawTable of rawTables) {
      const tableName = asNonEmptyString(rawTable.name);
      if (!tableName) {
        warnings.push(`Skipped a table without a name in schema ${schemaName}.`);
        continue;
      }

      const tableId = makeTableId(schemaName, tableName);
      const rawFields = Array.isArray(rawTable.fields) ? rawTable.fields : [];
      const columns: ErdColumn[] = rawFields.flatMap((field) => {
        const fieldName = asNonEmptyString(field.name);
        if (!fieldName) {
          warnings.push(`Skipped a field without a name in ${schemaName}.${tableName}.`);
          return [];
        }

        return [{
          id: makeColumnId(tableId, fieldName),
          tableId,
          name: fieldName,
          type: formatFieldType(field.type),
          primaryKey: Boolean(field.pk),
          unique: Boolean(field.unique),
          nullable: !Boolean(field.not_null) && !Boolean(field.pk),
          increment: Boolean(field.increment),
          ...optionalDefaultValue(field.dbdefault),
          ...optionalString('note', field.note),
          ...optionalNamedRange('noteSource', field.noteToken, options.filepath),
          ...optionalRange(field.token, options.filepath),
        }];
      });

      const rawIndexes = Array.isArray(rawTable.indexes) ? rawTable.indexes : [];
      const indexes = rawIndexes.map((index) => ({
        ...optionalString('name', index.name),
        members: (Array.isArray(index.columns) ? index.columns : [])
          .map((column) => asNonEmptyString(column.value))
          .filter((value): value is string => Boolean(value))
          .map((value) => ({ value })),
        unique: Boolean(index.unique),
        primaryKey: Boolean(index.pk),
        ...optionalString('note', index.note),
      }));

      tables.push({
        id: tableId,
        schema: schemaName,
        name: tableName,
        displayName: schemaName === 'public' ? tableName : `${schemaName}.${tableName}`,
        columns,
        indexes,
        ...optionalString('note', rawTable.note),
        ...optionalNamedRange('noteSource', rawTable.noteToken, options.filepath),
        ...optionalString('headerColor', rawTable.headerColor),
        ...optionalRange(rawTable.token, options.filepath),
      });
    }
  }

  let relationshipOrdinal = 0;
  for (const rawSchema of schemas) {
    const refs = Array.isArray(rawSchema.refs) ? rawSchema.refs : [];
    for (const ref of refs) {
      const endpoints = Array.isArray(ref.endpoints) ? ref.endpoints : [];
      const left = endpoints[0];
      const right = endpoints[1];
      if (!left || !right) {
        warnings.push('Skipped a relationship that did not have exactly two endpoints.');
        continue;
      }

      const sourceEndpoint = mapEndpoint(left, warnings);
      const targetEndpoint = mapEndpoint(right, warnings);
      if (!sourceEndpoint || !targetEndpoint) continue;

      relationships.push({
        id: makeRelationshipId(
          sourceEndpoint.tableId,
          sourceEndpoint.columnIds,
          targetEndpoint.tableId,
          targetEndpoint.columnIds,
          relationshipOrdinal++,
        ),
        ...optionalString('name', ref.name),
        source: sourceEndpoint,
        target: targetEndpoint,
        ...optionalString('onDelete', ref.onDelete),
        ...optionalString('onUpdate', ref.onUpdate),
        ...optionalNamedRange('sourceRange', ref.token, options.filepath),
      });
    }
  }

  return {
    version: 1,
    ...optionalString('name', database.name),
    tables,
    relationships,
    warnings,
  };
}

function mapEndpoint(endpoint: DbmlEndpoint, warnings: string[]) {
  const inferredSchemaName = asNonEmptyString(endpoint.fields?.[0]?.table?.schema?.name);
  const schemaName = asNonEmptyString(endpoint.schemaName) ?? inferredSchemaName ?? 'public';
  const tableName = asNonEmptyString(endpoint.tableName)
    ?? asNonEmptyString(endpoint.fields?.[0]?.table?.name);

  if (!tableName) {
    warnings.push('Skipped a relationship endpoint without a table name.');
    return undefined;
  }

  const tableId = makeTableId(schemaName, tableName);
  const fieldNames = getFieldNames(endpoint);
  if (fieldNames.length === 0) {
    warnings.push(`Relationship endpoint ${schemaName}.${tableName} did not expose any fields.`);
  }

  return {
    tableId,
    columnIds: fieldNames.map((fieldName) => makeColumnId(tableId, fieldName)),
    cardinality: String(endpoint.relation ?? '?'),
  };
}

function getFieldNames(endpoint: DbmlEndpoint): string[] {
  if (Array.isArray(endpoint.fields) && endpoint.fields.length > 0) {
    return endpoint.fields
      .map((field) => asNonEmptyString(field.name))
      .filter((name): name is string => Boolean(name));
  }

  if (Array.isArray(endpoint.fieldNames)) {
    return endpoint.fieldNames
      .map((name) => asNonEmptyString(name))
      .filter((name): name is string => Boolean(name));
  }

  return [];
}

function formatFieldType(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return 'unknown';

  const name = asNonEmptyString(value.type_name) ?? asNonEmptyString(value.name) ?? 'unknown';
  const args = asNonEmptyString(value.args);
  if (!args) return name;
  const suffix = args.startsWith('(') && args.endsWith(')') ? args : `(${args})`;
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

function optionalDefaultValue(value: unknown): { defaultValue?: string } {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return { defaultValue: String(value) };

  const rawValue = value.value;
  if (rawValue === undefined || rawValue === null) return {};
  const formatted = value.type === 'string'
    ? `'${String(rawValue).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
    : String(rawValue);
  return { defaultValue: formatted };
}

function optionalString<K extends string>(key: K, value: unknown): Partial<Record<K, string>> {
  const stringValue = asNonEmptyString(value);
  return stringValue ? { [key]: stringValue } as Partial<Record<K, string>> : {};
}

function optionalRange(token: DbmlToken | undefined, fallbackFilepath?: string): { source?: SourceRange } {
  const source = toSourceRange(token, fallbackFilepath);
  return source ? { source } : {};
}

function optionalNamedRange<K extends string>(
  key: K,
  token: DbmlToken | undefined,
  fallbackFilepath?: string,
): Partial<Record<K, SourceRange>> {
  const range = toSourceRange(token, fallbackFilepath);
  return range ? { [key]: range } as Partial<Record<K, SourceRange>> : {};
}

function toSourceRange(token: DbmlToken | undefined, fallbackFilepath?: string): SourceRange | undefined {
  if (!token?.start || !token.end) return undefined;
  const start = toPosition(token.start);
  const end = toPosition(token.end);
  if (!start || !end) return undefined;

  const filepath = typeof token.filepath === 'string' ? token.filepath : fallbackFilepath;
  return {
    start,
    end,
    ...(filepath ? { filepath } : {}),
  };
}

function toPosition(value: { line?: number; column?: number; offset?: number }) {
  if (![value.line, value.column, value.offset].every((item) => typeof item === 'number')) {
    return undefined;
  }
  return {
    line: value.line as number,
    column: value.column as number,
    offset: value.offset as number,
  };
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
