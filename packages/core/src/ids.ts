const escapeSegment = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('.', '\\.');

export const makeTableId = (schema: string, table: string): string =>
  `${escapeSegment(schema)}.${escapeSegment(table)}`;

export const makeEnumId = (schema: string, enumName: string): string =>
  `${escapeSegment(schema)}.${escapeSegment(enumName)}`;

export const makeColumnId = (tableId: string, column: string): string =>
  `${tableId}.${escapeSegment(column)}`;

export const makeRelationshipId = (
  sourceTableId: string,
  sourceColumnIds: readonly string[],
  targetTableId: string,
  targetColumnIds: readonly string[],
  ordinal: number,
): string => [
  sourceTableId,
  sourceColumnIds.join(','),
  targetTableId,
  targetColumnIds.join(','),
  ordinal,
].join('->');
