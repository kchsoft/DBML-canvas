import type { ErdSchema } from '@dbml-canvas/core';
import type { TableFlowNode } from './graph.js';

export interface FkDragSession {
  movedNodeIds: ReadonlySet<string>;
  frozenNodes: readonly TableFlowNode[];
}

export function startFkDragSession(
  nodes: TableFlowNode[],
  activeNode: TableFlowNode,
  draggedNodes: TableFlowNode[],
): FkDragSession {
  const movedNodes = draggedNodes.length > 0 ? draggedNodes : [activeNode];
  return {
    movedNodeIds: new Set(movedNodes.map((node) => node.id)),
    frozenNodes: nodes,
  };
}

export function reconcileFkDragSession(
  session: FkDragSession | undefined,
  schema: ErdSchema,
): FkDragSession | undefined {
  if (!session) return undefined;

  const tableIds = new Set(schema.tables.map((table) => table.id));
  return [...session.movedNodeIds].every((nodeId) => tableIds.has(nodeId))
    ? session
    : undefined;
}
