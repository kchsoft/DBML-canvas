import type { Edge, Node } from '@xyflow/react';

export type FkRoutingMode = 'adaptive' | 'settled';
export type FkRoutingEvent = 'drag-start' | 'drag-stop';
export type FkHandleSide = 'left' | 'right';
export type FkHandleRole = 'source' | 'target';

export interface FkEdgeData extends Record<string, unknown> {
  routingMode: FkRoutingMode;
  selfReference: boolean;
}

export type FkFlowEdge = Edge<FkEdgeData, 'fk'>;
export type FkGeometryNode = Pick<Node, 'id' | 'position' | 'measured'>;

export function makeFkHandleId(
  role: FkHandleRole,
  side: FkHandleSide,
  columnId: string,
): string {
  return `${role}:${side}:${columnId}`;
}

function horizontalCenter(node: FkGeometryNode): number {
  return node.position.x + (node.measured?.width ?? 0) / 2;
}

export function chooseFkHandleSides(
  source: FkGeometryNode,
  target: FkGeometryNode,
): { source: FkHandleSide; target: FkHandleSide } {
  if (source.id === target.id || horizontalCenter(source) <= horizontalCenter(target)) {
    return { source: 'right', target: 'left' };
  }
  return { source: 'left', target: 'right' };
}

export function transitionFkRoutingMode(
  _mode: FkRoutingMode,
  event: FkRoutingEvent,
): FkRoutingMode {
  return event === 'drag-start' ? 'adaptive' : 'settled';
}
