import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useEdgesState,
  useNodesState,
  type ColorMode,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnMove,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  updateNodeLayout,
  updateNodeAnnotation,
  updateViewport,
  type CanvasPoint,
  type DbmlNoteTarget,
  type ErdLayout,
  type ErdSchema,
  type NodeAnnotationPatch,
  type SourceRange,
} from '@dbml-canvas/core';
import { createFlowEdges, createFlowNodes, type TableFlowNode } from './graph.js';
import type { FkFlowEdge } from './fk-routing.js';
import { TableNode } from './TableNode.js';
import {
  CONTROL_WHEEL_ZOOM_SENSITIVITY,
  calculateWheelZoomViewport,
} from './viewport-interaction.js';

export { CONTROL_WHEEL_ZOOM_SENSITIVITY, calculateWheelZoomViewport };

export interface ErdCanvasProps {
  schema: ErdSchema;
  layout: ErdLayout;
  colorMode?: ColorMode;
  onLayoutChange?: (layout: ErdLayout) => void;
  onOpenSource?: (range: SourceRange) => void;
  onEditNote?: (target: DbmlNoteTarget, note: string) => Promise<void> | void;
  className?: string;
  showMiniMap?: boolean;
}

const nodeTypes = { table: TableNode };

export const TRACKPAD_VIEWPORT_OPTIONS = Object.freeze({
  panOnScroll: true,
  zoomOnScroll: false,
  zoomActivationKeyCode: null,
  zoomOnPinch: false,
} as const);

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

export function ErdCanvas(props: ErdCanvasProps) {
  return (
    <ReactFlowProvider>
      <ErdCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function ErdCanvasInner({
  schema,
  layout,
  colorMode = 'light',
  onLayoutChange,
  onOpenSource,
  onEditNote,
  className,
  showMiniMap = true,
}: ErdCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { getViewport, setViewport } = useReactFlow<TableFlowNode>();
  const latestLayout = useRef(layout);

  const emitLayout = useCallback((next: ErdLayout) => {
    latestLayout.current = next;
    onLayoutChange?.(next);
  }, [onLayoutChange]);

  const handleAnnotationChange = useCallback((
    tableId: string,
    position: CanvasPoint,
    patch: NodeAnnotationPatch,
  ) => {
    emitLayout(updateNodeAnnotation(latestLayout.current, tableId, position, patch));
  }, [emitLayout]);

  const initialNodes = useMemo(
    () => createFlowNodes(schema, layout, handleAnnotationChange, onEditNote),
    [handleAnnotationChange, layout, onEditNote, schema],
  );
  const initialEdges = useMemo(() => createFlowEdges(schema), [schema]);
  const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    latestLayout.current = layout;
    setNodes((current) => {
      const selectedIds = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return createFlowNodes(schema, layout, handleAnnotationChange, onEditNote).map((node) => ({
        ...node,
        ...(selectedIds.has(node.id) ? { selected: true } : {}),
      }));
    });
    setEdges(createFlowEdges(schema));
  }, [handleAnnotationChange, layout, onEditNote, schema, setEdges, setNodes]);

  const handleNodeDragStop: OnNodeDrag<TableFlowNode> = useCallback((_, node) => {
    emitLayout(updateNodeLayout(latestLayout.current, node.id, node.position));
  }, [emitLayout]);

  const handleMoveEnd: OnMove = useCallback((_, viewport) => {
    emitLayout(updateViewport(latestLayout.current, viewport));
  }, [emitLayout]);

  const handleNodeDoubleClick: NodeMouseHandler<TableFlowNode> = useCallback((_, node) => {
    const source = node.data.table.source;
    if (source) onOpenSource?.(source);
  }, [onOpenSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleControlWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      if (event.target instanceof Element && event.target.closest('.nowheel')) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const bounds = canvas.getBoundingClientRect();
      const nextViewport = calculateWheelZoomViewport({
        viewport: getViewport(),
        pointer: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        macLike: /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
      });
      void setViewport(nextViewport);
    };

    canvas.addEventListener('wheel', handleControlWheel, { capture: true, passive: false });
    return () => canvas.removeEventListener('wheel', handleControlWheel, { capture: true });
  }, [getViewport, setViewport]);

  return (
    <div ref={canvasRef} className={className ? `dbml-canvas ${className}` : 'dbml-canvas'}>
      <ReactFlow<TableFlowNode, FkFlowEdge>
        colorMode={colorMode}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onMoveEnd={handleMoveEnd}
        onNodeDoubleClick={handleNodeDoubleClick}
        {...(layout.viewport ? { defaultViewport: layout.viewport } : {})}
        fitView={!layout.viewport}
        fitViewOptions={{ padding: 0.18, maxZoom: 1.2 }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        {...TRACKPAD_VIEWPORT_OPTIONS}
        nodesConnectable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        {showMiniMap ? <MiniMap pannable zoomable nodeStrokeWidth={3} /> : null}
      </ReactFlow>
    </div>
  );
}
