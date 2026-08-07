export const DEFAULT_SOURCE_RATIO = 0.34;
export const MIN_SOURCE_WIDTH = 260;
export const MAX_SOURCE_RATIO = 0.7;
export const KEYBOARD_RESIZE_STEP = 16;
export const SOURCE_WIDTH_KEY = 'dbml-canvas/source-pane-width';

export function clampSourceWidth(width: number, workspaceWidth: number): number {
  const maximum = Math.max(MIN_SOURCE_WIDTH, workspaceWidth * MAX_SOURCE_RATIO);
  return Math.min(Math.max(width, MIN_SOURCE_WIDTH), maximum);
}

export function defaultSourceWidth(workspaceWidth: number): number {
  return clampSourceWidth(workspaceWidth * DEFAULT_SOURCE_RATIO, workspaceWidth);
}

export function resolveSourceWidth(stored: string | null, workspaceWidth: number): number {
  const parsed = stored === null ? Number.NaN : Number(stored);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultSourceWidth(workspaceWidth);
  return clampSourceWidth(parsed, workspaceWidth);
}
