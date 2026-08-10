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
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnMove,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
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
import { areFkRoutingNodesEqual, FkEdge } from './FkEdge.js';
import {
  deriveFkFocusPresentation,
  reconcileFkFocus,
  transitionFkFocus,
  type FkFocus,
  type FkFocusPresentation,
} from './fk-focus.js';
import {
  applySchemaSearchSelectionToNodes,
  applyFkFocusPresentationToNodes,
  createFlowEdges,
  createFlowNodes,
  type TableAnnotationChangeHandler,
  type TableFlowNode,
  type TableNoteEditHandler,
} from './graph.js';
import {
  transitionFkRoutingMode,
  type FkFlowEdge,
  type FkRoutingMode,
} from './fk-routing.js';
import { TableNode } from './TableNode.js';
import { SchemaExplorer } from './SchemaExplorer.js';
import {
  reconcileSchemaSearchSelection,
  type SchemaSearchSelection,
} from './schema-explorer.js';
import {
  isSchemaNavigationLayoutSuppressed,
  navigateToSchemaTable,
  runWithSchemaNavigationSuppression,
} from './schema-navigation.js';
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
const edgeTypes = { fk: FkEdge };

export const TRACKPAD_VIEWPORT_OPTIONS = Object.freeze({
  panOnScroll: true,
  zoomOnScroll: false,
  zoomActivationKeyCode: null,
  zoomOnPinch: false,
} as const);

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

export function createInitialFlowState(
  schema: ErdSchema,
  layout: ErdLayout,
  onAnnotationChange?: TableAnnotationChangeHandler,
  onEditNote?: TableNoteEditHandler,
  fkPresentation?: FkFocusPresentation,
  onFkColumnFocus?: (columnId: string) => void,
  searchSelection?: SchemaSearchSelection,
) {
  const nodes = createFlowNodes(
    schema,
    layout,
    onAnnotationChange,
    onEditNote,
    fkPresentation,
    onFkColumnFocus,
    searchSelection,
  );
  return {
    nodes,
    edges: createFlowEdges(schema, nodes, 'settled', fkPresentation),
  };
}

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
  const { fitView, getViewport, setViewport } = useReactFlow<TableFlowNode>();
  const latestLayout = useRef(layout);
  const [fkFocus, setFkFocus] = useState<FkFocus>();
  const [searchSelection, setSearchSelection] = useState<SchemaSearchSelection>();
  const searchNavigationRef = useRef(0);
  const fkPresentation = useMemo(
    () => deriveFkFocusPresentation(schema, reconcileFkFocus(schema, fkFocus)),
    [fkFocus, schema],
  );

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

  const handleFkColumnFocus = useCallback((columnId: string) => {
    setFkFocus((current) => transitionFkFocus(schema, current, {
      type: 'column',
      columnId,
    }));
  }, [schema]);

  const initialFlow = useMemo(
    () => createInitialFlowState(
      schema,
      layout,
      handleAnnotationChange,
      onEditNote,
      undefined,
      handleFkColumnFocus,
      searchSelection,
    ),
    [
      handleAnnotationChange,
      handleFkColumnFocus,
      layout,
      onEditNote,
      searchSelection,
      schema,
    ],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<TableFlowNode>(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FkFlowEdge>(initialFlow.edges);
  const [routingMode, setRoutingMode] = useState<FkRoutingMode>('settled');

  useEffect(() => {
    setFkFocus((current) => transitionFkFocus(schema, current, { type: 'schema' }));
    setSearchSelection((current) => reconcileSchemaSearchSelection(schema, current));
  }, [schema]);

  useEffect(() => {
    latestLayout.current = layout;
    setNodes((current) => {
      const selectedIds = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return createFlowNodes(
        schema,
        layout,
        handleAnnotationChange,
        onEditNote,
        undefined,
        handleFkColumnFocus,
        searchSelection,
      ).map((node) => ({
        ...node,
        ...(selectedIds.has(node.id) ? { selected: true } : {}),
      }));
    });
  }, [
    handleAnnotationChange,
    handleFkColumnFocus,
    layout,
    onEditNote,
    schema,
    setNodes,
  ]);

  useEffect(() => {
    setNodes((current) => applySchemaSearchSelectionToNodes(current, searchSelection));
  }, [searchSelection, setNodes]);

  useEffect(() => {
    setNodes((current) => applyFkFocusPresentationToNodes(
      current,
      fkPresentation,
      handleFkColumnFocus,
    ));
  }, [fkPresentation, handleFkColumnFocus, setNodes]);

  const routingNodesRef = useRef(nodes);
  if (!areFkRoutingNodesEqual(routingNodesRef.current, nodes)) {
    routingNodesRef.current = nodes;
  }
  const routingNodes = routingNodesRef.current;

  useEffect(() => {
    setEdges((current) => {
      const selectedIds = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return createFlowEdges(schema, routingNodes, routingMode, fkPresentation).map((edge) => ({
        ...edge,
        ...(selectedIds.has(edge.id) ? { selected: true } : {}),
      }));
    });
  }, [fkPresentation, routingMode, routingNodes, schema, setEdges]);

  const handleEdgeClick: EdgeMouseHandler<FkFlowEdge> = useCallback((event, edge) => {
    event.stopPropagation();
    setFkFocus((current) => transitionFkFocus(schema, current, {
      type: 'edge',
      relationshipId: edge.id,
    }));
  }, [schema]);

  const clearFkFocus = useCallback(() => {
    setFkFocus((current) => transitionFkFocus(schema, current, { type: 'clear' }));
  }, [schema]);

  const handleCanvasKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) clearFkFocus();
  }, [clearFkFocus]);

  const handleNodeDragStart: OnNodeDrag<TableFlowNode> = useCallback(() => {
    setRoutingMode((current) => transitionFkRoutingMode(current, 'drag-start'));
  }, []);

  const handleNodeDragStop: OnNodeDrag<TableFlowNode> = useCallback((_, node) => {
    setRoutingMode((current) => transitionFkRoutingMode(current, 'drag-stop'));
    emitLayout(updateNodeLayout(latestLayout.current, node.id, node.position));
  }, [emitLayout]);

  const handleMoveEnd: OnMove = useCallback((_, viewport) => {
    if (isSchemaNavigationLayoutSuppressed(searchNavigationRef)) return;
    emitLayout(updateViewport(latestLayout.current, viewport));
  }, [emitLayout]);

  const navigateToSearchTable = useCallback(async (tableId: string) => {
    const drawerWidth = Math.max(
      0,
      Math.min(320, (canvasRef.current?.clientWidth ?? 384) - 64),
    );
    await runWithSchemaNavigationSuppression(
      searchNavigationRef,
      () => navigateToSchemaTable(tableId, drawerWidth, { fitView, getViewport, setViewport }),
    );
  }, [fitView, getViewport, setViewport]);

  const handleSchemaTableSelect = useCallback((tableId: string) => {
    setSearchSelection({ kind: 'table', tableId });
    void navigateToSearchTable(tableId);
  }, [navigateToSearchTable]);

  const handleSchemaColumnSelect = useCallback((tableId: string, columnId: string) => {
    setSearchSelection({ kind: 'column', tableId, columnId });
    void navigateToSearchTable(tableId);
  }, [navigateToSearchTable]);

  const handleSchemaExplorerClose = useCallback(() => {
    setSearchSelection(undefined);
  }, []);

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
    <div
      ref={canvasRef}
      className={className ? `dbml-canvas ${className}` : 'dbml-canvas'}
      onKeyDown={handleCanvasKeyDown}
    >
      <ReactFlow<TableFlowNode, FkFlowEdge>
        colorMode={colorMode}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onPaneClick={clearFkFocus}
        onNodeDragStart={handleNodeDragStart}
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
        <SchemaExplorer
          schema={schema}
          {...(searchSelection ? { selection: searchSelection } : {})}
          onSelectTable={handleSchemaTableSelect}
          onSelectColumn={handleSchemaColumnSelect}
          onClose={handleSchemaExplorerClose}
        />
        <Controls showInteractive={false} />
        {showMiniMap ? <MiniMap pannable zoomable nodeStrokeWidth={3} /> : null}
      </ReactFlow>
    </div>
  );
}
