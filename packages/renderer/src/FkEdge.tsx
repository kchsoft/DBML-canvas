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
import type { CSSProperties } from 'react';
import type { FkFocusState } from './fk-focus.js';
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

export interface FkEdgeVisualProps {
  primaryStyle: CSSProperties;
  haloStyle?: CSSProperties;
  labelStyle: CSSProperties;
  labelBgStyle: CSSProperties;
}

export function getFkEdgeVisualProps(
  focusState: FkFocusState,
  baseStyle: CSSProperties = {},
): FkEdgeVisualProps {
  if (focusState === 'focused') {
    return {
      primaryStyle: {
        ...baseStyle,
        strokeWidth: 3,
        stroke: 'var(--dbml-accent)',
        opacity: 1,
      },
      haloStyle: {
        strokeWidth: 9,
        stroke: 'var(--dbml-accent)',
        opacity: 0.14,
      },
      labelStyle: {
        fill: 'var(--dbml-accent)',
        fontWeight: 700,
        opacity: 1,
      },
      labelBgStyle: {
        fill: 'var(--dbml-surface)',
        fillOpacity: 1,
        opacity: 1,
      },
    };
  }

  if (focusState === 'dimmed') {
    return {
      primaryStyle: { ...baseStyle, opacity: 0.16 },
      labelStyle: { opacity: 0.16 },
      labelBgStyle: { opacity: 0.16 },
    };
  }

  return {
    primaryStyle: { ...baseStyle },
    labelStyle: {},
    labelBgStyle: {},
  };
}

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
    const hasUsablePoints = Array.isArray(smart.points) && smart.points.every((point) => (
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
    ));
    if (
      typeof smart.svgPathString !== 'string'
      || smart.svgPathString.trim().length === 0
      || !Number.isFinite(smart.edgeCenterX)
      || !Number.isFinite(smart.edgeCenterY)
      || !hasUsablePoints
    ) return adaptive;

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
  const visual = getFkEdgeVisualProps(props.data?.focusState ?? 'idle', props.style);
  const labelStyle = { ...props.labelStyle, ...visual.labelStyle };
  const labelBgStyle = { ...props.labelBgStyle, ...visual.labelBgStyle };

  return (
    <>
      {visual.haloStyle ? (
        <BaseEdge
          id={`${props.id}-focus-halo`}
          path={route.path}
          className="dbml-fk-edge-halo"
          style={visual.haloStyle}
          interactionWidth={0}
          aria-hidden="true"
        />
      ) : null}
      <BaseEdge
        id={props.id}
        path={route.path}
        labelX={route.labelX}
        labelY={route.labelY}
        label={props.label}
        className="dbml-fk-edge"
        labelStyle={labelStyle}
        {...(props.labelShowBg !== undefined ? { labelShowBg: props.labelShowBg } : {})}
        labelBgStyle={labelBgStyle}
        {...(props.labelBgPadding ? { labelBgPadding: props.labelBgPadding } : {})}
        {...(props.labelBgBorderRadius !== undefined
          ? { labelBgBorderRadius: props.labelBgBorderRadius }
          : {})}
        style={visual.primaryStyle}
        {...(props.markerStart ? { markerStart: props.markerStart } : {})}
        {...(props.markerEnd ? { markerEnd: props.markerEnd } : {})}
        {...(props.interactionWidth !== undefined
          ? { interactionWidth: props.interactionWidth }
          : {})}
      />
    </>
  );
}
