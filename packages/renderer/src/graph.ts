import type {
  CanvasPoint,
  DbmlNoteTarget,
  ErdLayout,
  ErdSchema,
  NodeAnnotationPatch,
  NodeLayout,
} from '@dbml-canvas/core';
import { applyLayout } from '@dbml-canvas/core';
import type { Edge, Node } from '@xyflow/react';
import { createSchemaDetails, type TableDetails } from './schema-details.js';

export interface TableNodeData extends Record<string, unknown> {
  table: ErdSchema['tables'][number];
  details: TableDetails;
  layout: NodeLayout;
  onAnnotationChange?: (patch: NodeAnnotationPatch) => void;
  onEditNote?: (target: DbmlNoteTarget, note: string) => Promise<void> | void;
}

export type TableFlowNode = Node<TableNodeData, 'table'>;

export type TableAnnotationChangeHandler = (
  tableId: string,
  position: CanvasPoint,
  patch: NodeAnnotationPatch,
) => void;

export type TableNoteEditHandler = (
  target: DbmlNoteTarget,
  note: string,
) => Promise<void> | void;

export function createFlowNodes(
  schema: ErdSchema,
  layout: ErdLayout,
  onAnnotationChange?: TableAnnotationChangeHandler,
  onEditNote?: TableNoteEditHandler,
): TableFlowNode[] {
  const positions = applyLayout(schema, layout);
  const details = createSchemaDetails(schema);
  return schema.tables.map((table) => {
    const nodeLayout = positions[table.id] ?? { x: 0, y: 0 };
    const tableDetails = details[table.id];
    if (!tableDetails) throw new Error(`Missing renderer details for table ${table.id}.`);
    return {
      id: table.id,
      type: 'table',
      position: nodeLayout,
      data: {
        table,
        details: tableDetails,
        layout: nodeLayout,
        ...(onEditNote ? { onEditNote } : {}),
        ...(onAnnotationChange
          ? { onAnnotationChange: (patch: NodeAnnotationPatch) => onAnnotationChange(
            table.id,
            { x: nodeLayout.x, y: nodeLayout.y },
            patch,
          ) }
          : {}),
      },
    };
  });
}

export function createFlowEdges(schema: ErdSchema): Edge[] {
  return schema.relationships.map((relationship) => {
    const sourceColumnId = relationship.source.columnIds[0];
    const targetColumnId = relationship.target.columnIds[0];
    const label = relationship.name
      ?? `${relationship.source.cardinality} : ${relationship.target.cardinality}`;

    return {
      id: relationship.id,
      source: relationship.source.tableId,
      target: relationship.target.tableId,
      ...(sourceColumnId ? { sourceHandle: `source:${sourceColumnId}` } : {}),
      ...(targetColumnId ? { targetHandle: `target:${targetColumnId}` } : {}),
      type: 'smoothstep',
      label,
      labelStyle: { fontSize: 11 },
      style: { strokeWidth: 1.5 },
    };
  });
}
