import { getViewportForBounds, type Viewport } from '@xyflow/react';

export interface SchemaNavigationApi {
  getInternalNode: (id: string) => {
    measured: { width?: number; height?: number };
    internals: { positionAbsolute: { x: number; y: number } };
  } | undefined;
  setViewport: (
    viewport: Viewport,
    options: { duration: number },
  ) => Promise<boolean>;
}

export interface SchemaNavigationCanvasSize {
  width: number;
  height: number;
}

export interface SchemaNavigationActivity {
  current: number;
  latest?: {
    id: number;
    phase: 'setting' | 'awaiting-move-end' | 'interrupted' | 'cancelled';
    viewport?: Viewport;
    pendingViewport?: Viewport;
    interruptionType?: string;
  };
}

export function isSchemaNavigationActive(activity: SchemaNavigationActivity): boolean {
  return activity.latest?.phase === 'setting'
    || activity.latest?.phase === 'awaiting-move-end';
}

export function markSchemaNavigationMoveStart(
  activity: SchemaNavigationActivity,
  event: unknown,
  viewport: Viewport,
): void {
  const latest = activity.latest;
  if (!latest) return;
  const type = getMoveEventType(event);
  if (type) {
    activity.latest = { ...latest, phase: 'interrupted', interruptionType: type };
    return;
  }
  if (latest.phase === 'setting') return;
  const expectedViewport = latest.viewport ?? latest.pendingViewport;
  if (expectedViewport && !areViewportsEqual(expectedViewport, viewport)) {
    delete activity.latest;
  }
}

export function cancelSchemaNavigation(activity: SchemaNavigationActivity): void {
  if (activity.latest) activity.latest = { ...activity.latest, phase: 'cancelled' };
}

export function isSchemaNavigationLayoutSuppressed(
  activity: SchemaNavigationActivity,
  event?: unknown,
  viewport?: Viewport,
): boolean {
  const latest = activity.latest;
  if (!viewport || !latest) return false;
  const type = getMoveEventType(event);
  if (!type && latest.viewport && areViewportsEqual(latest.viewport, viewport)) {
    delete activity.latest;
    return true;
  }
  if (!type && latest.pendingViewport && areViewportsEqual(latest.pendingViewport, viewport)) {
    const { pendingViewport: _, ...withoutPendingViewport } = latest;
    activity.latest = withoutPendingViewport;
    return true;
  }
  const expectedViewport = latest.viewport ?? latest.pendingViewport;
  if (!expectedViewport) return false;
  if (!type || (
    type !== 'wheel'
    && (latest.phase === 'interrupted' || latest.phase === 'cancelled')
  )) {
    delete activity.latest;
  }
  return false;
}

export async function runWithSchemaNavigationSuppression(
  activity: SchemaNavigationActivity,
  navigate: () => Promise<Viewport | undefined>,
): Promise<boolean> {
  const id = activity.current + 1;
  activity.current = id;
  const pendingViewport = activity.latest?.viewport ?? activity.latest?.pendingViewport;
  activity.latest = {
    id,
    phase: 'setting',
    ...(pendingViewport ? { pendingViewport } : {}),
  };
  let viewport: Viewport | undefined;
  try {
    viewport = await navigate();
  } catch {
    settleFailedSchemaNavigation(activity, id);
    return false;
  }
  if (activity.latest?.id !== id) return viewport !== undefined;
  if (!viewport) {
    settleFailedSchemaNavigation(activity, id);
    return false;
  }
  const latest = activity.latest;
  activity.latest = {
    id,
    viewport,
    phase: latest.phase === 'cancelled' || latest.phase === 'interrupted'
      ? latest.phase
      : 'awaiting-move-end',
    ...(latest.interruptionType ? { interruptionType: latest.interruptionType } : {}),
  };
  return true;
}

function settleFailedSchemaNavigation(
  activity: SchemaNavigationActivity,
  id: number,
): void {
  const latest = activity.latest;
  if (!latest || latest.id !== id) return;
  if (!latest.pendingViewport) {
    delete activity.latest;
    return;
  }
  activity.latest = {
    id,
    viewport: latest.pendingViewport,
    phase: latest.phase === 'cancelled' || latest.phase === 'interrupted'
      ? latest.phase
      : 'awaiting-move-end',
    ...(latest.interruptionType ? { interruptionType: latest.interruptionType } : {}),
  };
}

function areViewportsEqual(left: Viewport, right: Viewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function getMoveEventType(event: unknown): string | undefined {
  if (!event || typeof event !== 'object' || !('type' in event)) return undefined;
  return typeof event.type === 'string' ? event.type : undefined;
}

export async function navigateToSchemaTable(
  tableId: string,
  drawerWidth: number,
  canvas: SchemaNavigationCanvasSize,
  api: SchemaNavigationApi,
): Promise<Viewport | undefined> {
  const node = api.getInternalNode(tableId);
  if (!node?.measured.width || !node.measured.height) return undefined;
  const target = getViewportForBounds(
    {
      ...node.internals.positionAbsolute,
      width: node.measured.width,
      height: node.measured.height,
    },
    canvas.width - drawerWidth,
    canvas.height,
    0.1,
    1.15,
    0.35,
  );
  return await api.setViewport(target, { duration: 0 }) ? target : undefined;
}
