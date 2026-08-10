import type { Viewport } from '@xyflow/react';

export interface SchemaNavigationApi {
  fitView: (options: {
    nodes: { id: string }[];
    padding: number;
    maxZoom: number;
    duration: number;
  }) => Promise<boolean>;
  getViewport: () => Viewport;
  setViewport: (
    viewport: Viewport,
    options: { duration: number },
  ) => Promise<boolean>;
}

export async function navigateToSchemaTable(
  tableId: string,
  drawerWidth: number,
  api: SchemaNavigationApi,
): Promise<void> {
  const fitted = await api.fitView({
    nodes: [{ id: tableId }],
    padding: 0.35,
    maxZoom: 1.15,
    duration: 180,
  });
  if (!fitted) return;
  const viewport = api.getViewport();
  await api.setViewport(
    { ...viewport, x: viewport.x - drawerWidth / 2 },
    { duration: 120 },
  );
}
