import type { ErdSchema } from './model.js';

export interface CanvasPoint {
  x: number;
  y: number;
}

export const TABLE_COLORS = ['blue', 'green', 'yellow', 'red', 'purple'] as const;
export type TableColor = (typeof TABLE_COLORS)[number];

export interface NodeLayout extends CanvasPoint {
  collapsed?: boolean;
  color?: TableColor;
}

export interface CanvasViewport extends CanvasPoint {
  zoom: number;
}

export interface ErdLayout {
  version: 1;
  nodes: Record<string, NodeLayout>;
  viewport?: CanvasViewport;
}

export interface NodeAnnotationPatch {
  color?: TableColor | null;
}

export interface GridLayoutOptions {
  columns?: number;
  horizontalGap?: number;
  verticalGap?: number;
  nodeWidth?: number;
  estimatedRowHeight?: number;
}

export const EMPTY_LAYOUT: ErdLayout = Object.freeze({
  version: 1,
  nodes: {},
});

export function createGridPosition(index: number, options: GridLayoutOptions = {}): CanvasPoint {
  const columns = options.columns ?? 4;
  const horizontalGap = options.horizontalGap ?? 80;
  const verticalGap = options.verticalGap ?? 80;
  const nodeWidth = options.nodeWidth ?? 300;
  const estimatedRowHeight = options.estimatedRowHeight ?? 360;

  return {
    x: (index % columns) * (nodeWidth + horizontalGap),
    y: Math.floor(index / columns) * (estimatedRowHeight + verticalGap),
  };
}

export function applyLayout(
  schema: ErdSchema,
  layout: ErdLayout,
  options: GridLayoutOptions = {},
): Record<string, NodeLayout> {
  const positions: Record<string, NodeLayout> = {};

  schema.tables.forEach((table, index) => {
    positions[table.id] = layout.nodes[table.id] ?? createGridPosition(index, options);
  });

  return positions;
}

export function updateNodeLayout(
  layout: ErdLayout,
  tableId: string,
  position: CanvasPoint,
): ErdLayout {
  return {
    ...layout,
    version: 1,
    nodes: {
      ...layout.nodes,
      [tableId]: {
        ...layout.nodes[tableId],
        x: position.x,
        y: position.y,
      },
    },
  };
}

export function updateNodeAnnotation(
  layout: ErdLayout,
  tableId: string,
  position: CanvasPoint,
  patch: NodeAnnotationPatch,
): ErdLayout {
  const nextNode: NodeLayout = {
    ...layout.nodes[tableId],
    ...position,
  };

  if ('color' in patch) {
    if (patch.color) nextNode.color = patch.color;
    else delete nextNode.color;
  }

  return {
    ...layout,
    version: 1,
    nodes: {
      ...layout.nodes,
      [tableId]: nextNode,
    },
  };
}

export function updateViewport(layout: ErdLayout, viewport: CanvasViewport): ErdLayout {
  return {
    ...layout,
    version: 1,
    viewport,
  };
}

export function pruneLayout(layout: ErdLayout, schema: ErdSchema): ErdLayout {
  const validIds = new Set(schema.tables.map((table) => table.id));
  const nodes = Object.fromEntries(
    Object.entries(layout.nodes).filter(([tableId]) => validIds.has(tableId)),
  );

  return {
    ...layout,
    version: 1,
    nodes,
  };
}

export function parseLayout(value: unknown): ErdLayout {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.nodes)) {
    return { version: 1, nodes: {} };
  }

  const nodes: Record<string, NodeLayout> = {};
  for (const [id, raw] of Object.entries(value.nodes)) {
    if (!isRecord(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) continue;
    nodes[id] = {
      x: raw.x,
      y: raw.y,
      ...(typeof raw.collapsed === 'boolean' ? { collapsed: raw.collapsed } : {}),
      ...(isTableColor(raw.color) ? { color: raw.color } : {}),
    };
  }

  const viewport = isRecord(value.viewport)
    && isFiniteNumber(value.viewport.x)
    && isFiniteNumber(value.viewport.y)
    && isFiniteNumber(value.viewport.zoom)
    ? { x: value.viewport.x, y: value.viewport.y, zoom: value.viewport.zoom }
    : undefined;

  return {
    version: 1,
    nodes,
    ...(viewport ? { viewport } : {}),
  };
}

export const serializeLayout = (layout: ErdLayout): string => `${JSON.stringify(layout, null, 2)}\n`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTableColor(value: unknown): value is TableColor {
  return typeof value === 'string' && TABLE_COLORS.includes(value as TableColor);
}
