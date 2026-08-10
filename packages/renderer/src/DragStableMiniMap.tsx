export function captureMiniMapSnapshot(root: ParentNode | null): string | undefined {
  return root?.querySelector('.react-flow__minimap')?.outerHTML;
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
