import {
  getSmartEdge,
  pathfindingAStarNoDiagonal,
  svgDrawSmoothStepLinePath,
  type GetSmartEdgeOptions,
} from '@tisoap/react-flow-smart-edge';
import {
  BaseEdge,
  getSmoothStepPath,
  useNodes,
  type EdgeProps,
  type Node,
  type Position,
} from '@xyflow/react';
import type { TableFlowNode } from './graph.js';
import type { FkFlowEdge, FkRoutingMode } from './fk-routing.js';

const SMART_EDGE_OPTIONS = Object.freeze({
  gridRatio: 10,
  nodePadding: 16,
  generatePath: pathfindingAStarNoDiagonal,
  drawEdge: svgDrawSmoothStepLinePath({ borderRadius: 5 }),
} satisfies GetSmartEdgeOptions);

export interface FkRouteParams {
  sourceX: number;
  sourceY: number;
  sourcePosition: Position;
  targetX: number;
  targetY: number;
  targetPosition: Position;
}

export interface FkRoute {
  kind: 'adaptive' | 'smart';
  path: string;
  labelX: number;
  labelY: number;
  points: number[][];
}

export type SmartRouteResolver = typeof getSmartEdge;

export function resolveFkRoute(
  params: FkRouteParams,
  nodes: Node[],
  routingMode: FkRoutingMode,
  smartResolver: SmartRouteResolver = getSmartEdge,
): FkRoute {
  const [path, labelX, labelY] = getSmoothStepPath({
    ...params,
    borderRadius: 5,
    offset: 16,
  });
  const adaptive: FkRoute = {
    kind: 'adaptive',
    path,
    labelX,
    labelY,
    points: [],
  };

  if (routingMode === 'adaptive') return adaptive;

  try {
    const smart = smartResolver({
      ...params,
      nodes,
      options: SMART_EDGE_OPTIONS,
    });
    if (smart instanceof Error) return adaptive;

    return {
      kind: 'smart',
      path: smart.svgPathString,
      labelX: smart.edgeCenterX,
      labelY: smart.edgeCenterY,
      points: smart.points,
    };
  } catch {
    return adaptive;
  }
}

export function FkEdge(props: EdgeProps<FkFlowEdge>) {
  const nodes = useNodes<TableFlowNode>();
  const route = resolveFkRoute(
    {
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    },
    nodes,
    props.data?.routingMode ?? 'settled',
  );

  return (
    <BaseEdge
      id={props.id}
      path={route.path}
      labelX={route.labelX}
      labelY={route.labelY}
      label={props.label}
      {...(props.labelStyle ? { labelStyle: props.labelStyle } : {})}
      {...(props.labelShowBg !== undefined ? { labelShowBg: props.labelShowBg } : {})}
      {...(props.labelBgStyle ? { labelBgStyle: props.labelBgStyle } : {})}
      {...(props.labelBgPadding ? { labelBgPadding: props.labelBgPadding } : {})}
      {...(props.labelBgBorderRadius !== undefined
        ? { labelBgBorderRadius: props.labelBgBorderRadius }
        : {})}
      {...(props.style ? { style: props.style } : {})}
      {...(props.markerStart ? { markerStart: props.markerStart } : {})}
      {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
      {...(props.interactionWidth !== undefined
        ? { interactionWidth: props.interactionWidth }
        : {})}
    />
  );
}
