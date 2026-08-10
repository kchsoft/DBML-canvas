import type { MiniMapNodeProps } from '@xyflow/react';
import {
  createContext,
  memo,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import type { TableFlowNode } from './graph.js';

export interface MiniMapNodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MiniMapNodeSnapshot = ReadonlyMap<string, MiniMapNodeRect>;

const MiniMapDragSnapshotContext = createContext<MiniMapNodeSnapshot | undefined>(undefined);

export function createMiniMapNodeSnapshot(
  nodes: readonly TableFlowNode[],
): MiniMapNodeSnapshot {
  return new Map(nodes.map((node) => [
    node.id,
    {
      x: node.position.x,
      y: node.position.y,
      width: node.measured?.width ?? node.width ?? 0,
      height: node.measured?.height ?? node.height ?? 0,
    },
  ]));
}

export function getMiniMapNodeRect(
  props: Pick<MiniMapNodeProps, 'id' | 'x' | 'y' | 'width' | 'height'>,
  snapshot: MiniMapNodeSnapshot | undefined,
): MiniMapNodeRect {
  return snapshot?.get(props.id) ?? {
    x: props.x,
    y: props.y,
    width: props.width,
    height: props.height,
  };
}

export interface MiniMapDragSnapshotProviderProps extends PropsWithChildren {
  nodes?: readonly TableFlowNode[] | undefined;
}

export function MiniMapDragSnapshotProvider({
  nodes,
  children,
}: MiniMapDragSnapshotProviderProps) {
  const snapshot = useMemo(
    () => (nodes ? createMiniMapNodeSnapshot(nodes) : undefined),
    [nodes],
  );
  return (
    <MiniMapDragSnapshotContext.Provider value={snapshot}>
      {children}
    </MiniMapDragSnapshotContext.Provider>
  );
}

interface MiniMapRectProps extends Omit<MiniMapNodeProps, 'x' | 'y' | 'width' | 'height'> {
  rect: MiniMapNodeRect;
}

const MiniMapRect = memo(function MiniMapRect({
  id,
  rect,
  style,
  color,
  strokeColor,
  strokeWidth,
  className,
  borderRadius,
  shapeRendering,
  selected,
  onClick,
}: MiniMapRectProps) {
  const background = style?.background ?? style?.backgroundColor;
  const fill = color ?? (typeof background === 'string' ? background : undefined);
  return (
    <rect
      className={`react-flow__minimap-node${selected ? ' selected' : ''}${
        className ? ` ${className}` : ''
      }`}
      x={rect.x}
      y={rect.y}
      rx={borderRadius}
      ry={borderRadius}
      width={rect.width}
      height={rect.height}
      style={{ fill, stroke: strokeColor, strokeWidth }}
      shapeRendering={shapeRendering}
      {...(onClick ? { onClick: (event) => onClick(event, id) } : {})}
    />
  );
});

export const DragStableMiniMapNode = memo(function DragStableMiniMapNode(
  props: MiniMapNodeProps,
) {
  const snapshot = useContext(MiniMapDragSnapshotContext);
  const rect = getMiniMapNodeRect(props, snapshot);
  return <MiniMapRect {...props} rect={rect} />;
});
