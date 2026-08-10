import type { ErdSchema } from '@dbml-canvas/core';

export type FkFocus =
  | { kind: 'column'; columnId: string; relationshipIds: string[] }
  | { kind: 'edge'; relationshipId: string; relationshipIds: [string] };

export type FkFocusState = 'idle' | 'focused' | 'dimmed';

export type FkFocusEvent =
  | { type: 'column'; columnId: string }
  | { type: 'edge'; relationshipId: string }
  | { type: 'clear' }
  | { type: 'schema' };

export interface FkFocusPresentation {
  relationshipIds: ReadonlySet<string>;
  endpointColumnIds: ReadonlySet<string>;
  activeColumnId?: string;
}

export function createColumnFkFocus(
  schema: ErdSchema,
  columnId: string,
): FkFocus | undefined {
  const relationshipIds = schema.relationships
    .filter((relationship) => (
      relationship.source.columnIds.includes(columnId)
      || relationship.target.columnIds.includes(columnId)
    ))
    .map((relationship) => relationship.id);

  return relationshipIds.length > 0
    ? { kind: 'column', columnId, relationshipIds }
    : undefined;
}

export function createEdgeFkFocus(
  schema: ErdSchema,
  relationshipId: string,
): FkFocus | undefined {
  return schema.relationships.some(({ id }) => id === relationshipId)
    ? { kind: 'edge', relationshipId, relationshipIds: [relationshipId] }
    : undefined;
}

export function reconcileFkFocus(
  schema: ErdSchema,
  focus: FkFocus | undefined,
): FkFocus | undefined {
  if (!focus) return undefined;
  return focus.kind === 'column'
    ? createColumnFkFocus(schema, focus.columnId)
    : createEdgeFkFocus(schema, focus.relationshipId);
}

export function deriveFkFocusPresentation(
  schema: ErdSchema,
  focus: FkFocus | undefined,
): FkFocusPresentation {
  const relationshipIds = new Set(focus?.relationshipIds ?? []);
  const endpointColumnIds = new Set<string>();

  for (const relationship of schema.relationships) {
    if (!relationshipIds.has(relationship.id)) continue;
    for (const columnId of relationship.source.columnIds) endpointColumnIds.add(columnId);
    for (const columnId of relationship.target.columnIds) endpointColumnIds.add(columnId);
  }

  return {
    relationshipIds,
    endpointColumnIds,
    ...(focus?.kind === 'column' ? { activeColumnId: focus.columnId } : {}),
  };
}

export function getFkEdgeFocusState(
  presentation: FkFocusPresentation,
  relationshipId: string,
): FkFocusState {
  if (presentation.relationshipIds.size === 0) return 'idle';
  return presentation.relationshipIds.has(relationshipId) ? 'focused' : 'dimmed';
}

export function transitionFkFocus(
  schema: ErdSchema,
  focus: FkFocus | undefined,
  event: FkFocusEvent,
): FkFocus | undefined {
  switch (event.type) {
    case 'column':
      return createColumnFkFocus(schema, event.columnId);
    case 'edge':
      return createEdgeFkFocus(schema, event.relationshipId);
    case 'schema':
      return reconcileFkFocus(schema, focus);
    case 'clear':
      return undefined;
  }
}
