import type { CanvasPoint, CanvasViewport } from '@dbml-canvas/core';

export const CONTROL_WHEEL_ZOOM_SENSITIVITY = 0.7;

export interface WheelZoomInput {
  viewport: CanvasViewport;
  pointer: CanvasPoint;
  deltaY: number;
  deltaMode: number;
  macLike: boolean;
  minZoom: number;
  maxZoom: number;
}

export function calculateWheelZoomViewport({
  viewport,
  pointer,
  deltaY,
  deltaMode,
  macLike,
  minZoom,
  maxZoom,
}: WheelZoomInput): CanvasViewport {
  const modeFactor = deltaMode === 1 ? 0.05 : deltaMode ? 1 : 0.002;
  const platformFactor = macLike ? 10 : 1;
  const wheelDelta = -deltaY * modeFactor * platformFactor * CONTROL_WHEEL_ZOOM_SENSITIVITY;
  const zoom = Math.min(maxZoom, Math.max(minZoom, viewport.zoom * Math.pow(2, wheelDelta)));
  const flowX = (pointer.x - viewport.x) / viewport.zoom;
  const flowY = (pointer.y - viewport.y) / viewport.zoom;

  return {
    x: pointer.x - flowX * zoom,
    y: pointer.y - flowY * zoom,
    zoom,
  };
}
