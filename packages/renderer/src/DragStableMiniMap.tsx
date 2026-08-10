export function captureMiniMapSnapshot(root: ParentNode | null): string | undefined {
  return root?.querySelector('.react-flow__minimap')?.outerHTML;
}

export type ViewportMiniMapPhase = 'start' | 'end';

export function updateViewportMiniMapSnapshot(
  current: string | undefined,
  eventType: string | undefined,
  phase: ViewportMiniMapPhase,
  captured: string | undefined,
): string | undefined {
  if (phase === 'end') return undefined;
  if (eventType !== 'wheel') return current;
  return current ?? captured;
}

export interface DragStableMiniMapProps {
  markup: string;
}

export function DragStableMiniMap({ markup }: DragStableMiniMapProps) {
  return (
    <div
      className="dbml-minimap-drag-snapshot"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
