import {
  DbmlCoreSchemaParser,
  applyDbmlTextEdit,
  createDbmlNoteEdit,
  type DbmlNoteTarget,
} from '@dbml-canvas/core';

const parser = new DbmlCoreSchemaParser();

export function applyValidatedNoteEdit(
  source: string,
  target: DbmlNoteTarget,
  note: string,
): string {
  const currentSchema = parser.parse(source);
  const currentTarget = target.kind === 'table'
    ? currentSchema.tables.find((table) => table.id === target.id)
    : currentSchema.tables.flatMap((table) => table.columns)
      .find((column) => column.id === target.id);
  if (!currentTarget?.source
    || !sameOffsets(currentTarget.source, target.source)
    || !sameOptionalOffsets(currentTarget.noteSource, target.noteSource)) {
    throw new Error('DBML source changed before the Note edit could be applied.');
  }

  const edit = createDbmlNoteEdit(source, target, note);
  const updated = applyDbmlTextEdit(source, edit);
  parser.parse(updated);
  return updated;
}

function sameOffsets(
  left: DbmlNoteTarget['source'],
  right: DbmlNoteTarget['source'],
): boolean {
  return left.start.offset === right.start.offset && left.end.offset === right.end.offset;
}

function sameOptionalOffsets(
  left: DbmlNoteTarget['noteSource'],
  right: DbmlNoteTarget['noteSource'],
): boolean {
  if (!left || !right) return left === right;
  return sameOffsets(left, right);
}
