import type {
  CanvasPoint,
  DbmlNoteTarget,
  ErdLayout,
  ErdSchema,
  NodeAnnotationPatch,
  NodeLayout,
} from '@dbml-canvas/core';
import { applyLayout } from '@dbml-canvas/core';
import type { Node } from '@xyflow/react';
import {
  getFkEdgeFocusState,
  type FkFocusPresentation,
} from './fk-focus.js';
import {
  chooseFkHandleSides,
  makeFkHandleId,
  type FkFlowEdge,
  type FkGeometryNode,
  type FkRoutingMode,
} from './fk-routing.js';
import { createSchemaDetails, type TableDetails } from './schema-details.js';

export interface TableNodeData extends Record<string, unknown> {
  table: ErdSchema['tables'][number];
  details: TableDetails;
  layout: NodeLayout;
  onAnnotationChange?: (patch: NodeAnnotationPatch) => void;
  onEditNote?: (target: DbmlNoteTarget, note: string) => Promise<void> | void;
  activeFkColumnId?: string;
  relatedFkColumnIds?: readonly string[];
  onFkColumnFocus?: (columnId: string) => void;
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
  fkPresentation?: FkFocusPresentation,
  onFkColumnFocus?: (columnId: string) => void,
): TableFlowNode[] {
  const positions = applyLayout(schema, layout);
  const details = createSchemaDetails(schema);
  return schema.tables.map((table) => {
    const nodeLayout = positions[table.id] ?? { x: 0, y: 0 };
    const tableDetails = details[table.id];
    const tableColumnIds = new Set(table.columns.map((column) => column.id));
    const relatedFkColumnIds = table.columns
      .map((column) => column.id)
      .filter((columnId) => fkPresentation?.endpointColumnIds.has(columnId));
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
        ...(fkPresentation?.activeColumnId
          && tableColumnIds.has(fkPresentation.activeColumnId)
          ? { activeFkColumnId: fkPresentation.activeColumnId }
          : {}),
        ...(relatedFkColumnIds.length > 0 ? { relatedFkColumnIds } : {}),
        ...(onFkColumnFocus ? { onFkColumnFocus } : {}),
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

export function applyFkFocusPresentationToNodes(
  nodes: TableFlowNode[],
  fkPresentation: FkFocusPresentation,
  onFkColumnFocus?: (columnId: string) => void,
): TableFlowNode[] {
  return nodes.map((node) => {
    const {
      activeFkColumnId: _activeFkColumnId,
      relatedFkColumnIds: _relatedFkColumnIds,
      onFkColumnFocus: _onFkColumnFocus,
      ...stableData
    } = node.data;
    const tableColumnIds = new Set(node.data.table.columns.map((column) => column.id));
    const relatedFkColumnIds = node.data.table.columns
      .map((column) => column.id)
      .filter((columnId) => fkPresentation.endpointColumnIds.has(columnId));

    return {
      ...node,
      data: {
        ...stableData,
        ...(fkPresentation.activeColumnId
          && tableColumnIds.has(fkPresentation.activeColumnId)
          ? { activeFkColumnId: fkPresentation.activeColumnId }
          : {}),
        ...(relatedFkColumnIds.length > 0 ? { relatedFkColumnIds } : {}),
        ...(onFkColumnFocus ? { onFkColumnFocus } : {}),
      },
    };
  });
}

export function createFlowEdges(
  schema: ErdSchema,
  nodes: FkGeometryNode[] = [],
  routingMode: FkRoutingMode = 'settled',
  fkPresentation?: FkFocusPresentation,
): FkFlowEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return schema.relationships.map((relationship) => {
    const sourceColumnId = relationship.source.columnIds[0];
    const targetColumnId = relationship.target.columnIds[0];
    const sourceNode = nodesById.get(relationship.source.tableId) ?? {
      id: relationship.source.tableId,
      position: { x: 0, y: 0 },
    };
    const targetNode = nodesById.get(relationship.target.tableId) ?? {
      id: relationship.target.tableId,
      position: { x: 0, y: 0 },
    };
    const sides = chooseFkHandleSides(sourceNode, targetNode);
    const label = relationship.name
      ?? `${relationship.source.cardinality} : ${relationship.target.cardinality}`;

    return {
      id: relationship.id,
      source: relationship.source.tableId,
      target: relationship.target.tableId,
      ...(sourceColumnId
        ? { sourceHandle: makeFkHandleId('source', sides.source, sourceColumnId) }
        : {}),
      ...(targetColumnId
        ? { targetHandle: makeFkHandleId('target', sides.target, targetColumnId) }
        : {}),
      type: 'fk',
      data: {
        routingMode,
        selfReference: relationship.source.tableId === relationship.target.tableId,
        focusState: fkPresentation
          ? getFkEdgeFocusState(fkPresentation, relationship.id)
          : 'idle',
      },
      label,
      labelStyle: { fontSize: 11 },
      style: { strokeWidth: 1.5 },
    };
  });
}
