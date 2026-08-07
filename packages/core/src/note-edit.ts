import type { SourceRange } from './model.js';

export interface DbmlTextEdit {
  startOffset: number;
  endOffset: number;
  expectedText: string;
  newText: string;
}

export type DbmlNoteTarget =
  | { kind: 'table'; id: string; source: SourceRange; noteSource?: SourceRange }
  | { kind: 'column'; id: string; source: SourceRange; noteSource?: SourceRange };

export function createDbmlNoteEdit(
  source: string,
  target: DbmlNoteTarget,
  note: string,
): DbmlTextEdit {
  assertRange(source, target.source, 'target');
  if (target.noteSource) assertRange(source, target.noteSource, 'Note');

  const hasNote = note.trim().length > 0;
  if (target.noteSource) {
    if (hasNote) {
      return createEdit(
        source,
        target.noteSource.start.offset,
        target.noteSource.end.offset,
        formatNote(target.kind, note),
      );
    }
    return target.kind === 'table'
      ? removeTableNote(source, target.noteSource)
      : removeColumnNote(source, target.source, target.noteSource);
  }

  if (!hasNote) {
    const offset = target.source.end.offset;
    return createEdit(source, offset, offset, '');
  }

  return target.kind === 'table'
    ? insertTableNote(source, target.source, note)
    : insertColumnNote(source, target.source, note);
}

export function applyDbmlTextEdit(source: string, edit: DbmlTextEdit): string {
  if (!Number.isInteger(edit.startOffset)
    || !Number.isInteger(edit.endOffset)
    || edit.startOffset < 0
    || edit.endOffset < edit.startOffset
    || edit.endOffset > source.length) {
    throw new Error('DBML Note edit has an invalid source range.');
  }

  const currentText = source.slice(edit.startOffset, edit.endOffset);
  if (currentText !== edit.expectedText) {
    throw new Error('DBML source changed before the Note edit could be applied.');
  }

  return `${source.slice(0, edit.startOffset)}${edit.newText}${source.slice(edit.endOffset)}`;
}

function insertTableNote(source: string, range: SourceRange, note: string): DbmlTextEdit {
  const tableText = source.slice(range.start.offset, range.end.offset);
  const closeRelative = tableText.lastIndexOf('}');
  if (closeRelative < 0) throw new Error('Cannot find the table closing brace for this Note.');

  const closeOffset = range.start.offset + closeRelative;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lineStart = source.lastIndexOf('\n', closeOffset - 1) + 1;
  const beforeClose = source.slice(lineStart, closeOffset);
  const closeOnOwnLine = /^[\t ]*$/.test(beforeClose);
  const indent = inferTableIndent(tableText);
  const newText = closeOnOwnLine
    ? `${indent}${formatNote('table', note)}${newline}`
    : `${newline}${indent}${formatNote('table', note)}${newline}`;
  const insertOffset = closeOnOwnLine ? lineStart : closeOffset;
  return createEdit(source, insertOffset, insertOffset, newText);
}

function insertColumnNote(source: string, range: SourceRange, note: string): DbmlTextEdit {
  const fieldText = source.slice(range.start.offset, range.end.offset);
  const closeBracket = fieldText.lastIndexOf(']');
  const formatted = formatNote('column', note);

  if (closeBracket >= 0) {
    const openBracket = fieldText.lastIndexOf('[', closeBracket);
    if (openBracket >= 0) {
      const content = fieldText.slice(openBracket + 1, closeBracket).trim();
      const insertOffset = range.start.offset + closeBracket;
      return createEdit(source, insertOffset, insertOffset, `${content ? ', ' : ''}${formatted}`);
    }
  }

  return createEdit(source, range.end.offset, range.end.offset, ` [${formatted}]`);
}

function removeTableNote(source: string, noteRange: SourceRange): DbmlTextEdit {
  const lineStart = source.lastIndexOf('\n', noteRange.start.offset - 1) + 1;
  const newlineOffset = source.indexOf('\n', noteRange.end.offset);
  const lineEnd = newlineOffset < 0 ? source.length : newlineOffset;
  const noteHasOwnLine = /^[\t ]*$/.test(source.slice(lineStart, noteRange.start.offset))
    && /^[\t ]*$/.test(source.slice(noteRange.end.offset, lineEnd));

  if (noteHasOwnLine) {
    const endOffset = newlineOffset < 0 ? lineEnd : newlineOffset + 1;
    return createEdit(source, lineStart, endOffset, '');
  }
  return createEdit(source, noteRange.start.offset, noteRange.end.offset, '');
}

function removeColumnNote(
  source: string,
  fieldRange: SourceRange,
  noteRange: SourceRange,
): DbmlTextEdit {
  const afterNote = source.slice(noteRange.end.offset, fieldRange.end.offset);
  const followingSeparator = afterNote.match(/^[\t ]*,[\t ]*/);
  if (followingSeparator) {
    return createEdit(
      source,
      noteRange.start.offset,
      noteRange.end.offset + followingSeparator[0].length,
      '',
    );
  }

  const beforeNote = source.slice(fieldRange.start.offset, noteRange.start.offset);
  const precedingSeparator = beforeNote.match(/,[\t ]*$/);
  if (precedingSeparator?.index !== undefined) {
    return createEdit(
      source,
      fieldRange.start.offset + precedingSeparator.index,
      noteRange.end.offset,
      '',
    );
  }

  const openBracket = beforeNote.lastIndexOf('[');
  const closeBracketRelative = afterNote.indexOf(']');
  if (openBracket >= 0
    && closeBracketRelative >= 0
    && /^[\t ]*$/.test(beforeNote.slice(openBracket + 1))
    && /^[\t ]*$/.test(afterNote.slice(0, closeBracketRelative))) {
    let startOffset = fieldRange.start.offset + openBracket;
    if (startOffset > fieldRange.start.offset && /[\t ]/.test(source[startOffset - 1] ?? '')) {
      startOffset -= 1;
    }
    return createEdit(
      source,
      startOffset,
      noteRange.end.offset + closeBracketRelative + 1,
      '',
    );
  }

  return createEdit(source, noteRange.start.offset, noteRange.end.offset, '');
}

function inferTableIndent(tableText: string): string {
  const bodyStart = tableText.indexOf('{');
  if (bodyStart < 0) return '  ';
  const body = tableText.slice(bodyStart + 1);
  const match = body.match(/(?:\r?\n)([\t ]+)\S/);
  return match?.[1] ?? '  ';
}

function formatNote(kind: DbmlNoteTarget['kind'], note: string): string {
  const escaped = note
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\t', '\\t');
  return `${kind === 'table' ? 'Note' : 'note'}: '${escaped}'`;
}

function createEdit(
  source: string,
  startOffset: number,
  endOffset: number,
  newText: string,
): DbmlTextEdit {
  return {
    startOffset,
    endOffset,
    expectedText: source.slice(startOffset, endOffset),
    newText,
  };
}

function assertRange(source: string, range: SourceRange, label: string): void {
  if (!Number.isInteger(range.start.offset)
    || !Number.isInteger(range.end.offset)
    || range.start.offset < 0
    || range.end.offset < range.start.offset
    || range.end.offset > source.length) {
    throw new Error(`Cannot edit ${label}: its DBML source range is invalid.`);
  }
}
