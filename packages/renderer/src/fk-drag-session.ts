import {
  updateNodeLayout,
  type ErdLayout,
  type ErdSchema,
} from '@dbml-canvas/core';
import type { TableFlowNode } from './graph.js';

export interface FkDragSession {
  movedNodeIds: ReadonlySet<string>;
  frozenNodes: TableFlowNode[];
}

export interface FkRoutingSnapshot {
  nodes: TableFlowNode[];
  dragSession?: FkDragSession;
}

function areFkRoutingNodesEqual(left: TableFlowNode[], right: TableFlowNode[]): boolean {
  if (left.length !== right.length) return false;

  return left.every((node, index) => {
    const other = right[index];
    return other !== undefined
      && node.id === other.id
      && node.position.x === other.position.x
      && node.position.y === other.position.y
      && node.measured?.width === other.measured?.width
      && node.measured?.height === other.measured?.height
      && node.width === other.width
      && node.height === other.height
      && node.hidden === other.hidden;
  });
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

export function updateFkRoutingSnapshot(
  current: FkRoutingSnapshot | undefined,
  nodes: TableFlowNode[],
  dragSession: FkDragSession | undefined,
): FkRoutingSnapshot {
  if (dragSession) {
    if (current?.dragSession === dragSession) return current;
    return { nodes: dragSession.frozenNodes, dragSession };
  }

  if (!current?.dragSession && current && areFkRoutingNodesEqual(current.nodes, nodes)) {
    return current;
  }

  return { nodes };
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

export function updateDraggedNodesLayout(
  layout: ErdLayout,
  draggedNodes: readonly TableFlowNode[],
): ErdLayout {
  return draggedNodes.reduce(
    (current, node) => updateNodeLayout(current, node.id, node.position),
    layout,
  );
}

export function preserveFlowNodeMeasurements(
  currentNodes: readonly TableFlowNode[],
  nextNodes: TableFlowNode[],
): TableFlowNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    if (!current || current.data.table !== node.data.table) return node;

    return {
      ...node,
      ...(current.measured ? { measured: current.measured } : {}),
      ...(current.width !== undefined ? { width: current.width } : {}),
      ...(current.height !== undefined ? { height: current.height } : {}),
    };
  });
}
