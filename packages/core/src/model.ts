export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
  filepath?: string;
}

export interface ErdColumn {
  id: string;
  tableId: string;
  name: string;
  type: string;
  primaryKey: boolean;
  unique: boolean;
  nullable: boolean;
  increment: boolean;
  defaultValue?: string;
  note?: string;
  noteSource?: SourceRange;
  source?: SourceRange;
}

export interface ErdIndexMember {
  value: string;
}

export interface ErdIndex {
  name?: string;
  members: ErdIndexMember[];
  unique: boolean;
  primaryKey: boolean;
  note?: string;
}

export interface ErdTable {
  id: string;
  schema: string;
  name: string;
  displayName: string;
  columns: ErdColumn[];
  indexes: ErdIndex[];
  note?: string;
  noteSource?: SourceRange;
  headerColor?: string;
  source?: SourceRange;
}

export interface ErdRelationshipEndpoint {
  tableId: string;
  columnIds: string[];
  cardinality: string;
}

export interface ErdRelationship {
  id: string;
  name?: string;
  source: ErdRelationshipEndpoint;
  target: ErdRelationshipEndpoint;
  onDelete?: string;
  onUpdate?: string;
  sourceRange?: SourceRange;
}

export interface ErdSchema {
  version: 1;
  name?: string;
  tables: ErdTable[];
  relationships: ErdRelationship[];
  warnings: string[];
}

export interface SchemaParser {
  parse(source: string, options?: ParseOptions): ErdSchema;
}

export interface ParseOptions {
  filepath?: string;
}
