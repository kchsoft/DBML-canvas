import type { ErdLayout } from '@dbml-canvas/core';

/**
 * Decides whether a layout reported by the canvas has to flow back down as new state.
 *
 * Node moves and annotations build a fresh `nodes` record, and the canvas only renders those
 * from its `layout` prop, so they must replace the current state. A pan or zoom reuses the same
 * `nodes` reference and has already been applied by the canvas itself, so replacing state there
 * would re-render the whole canvas for a change it does not read.
 */
export function reconcileLayoutState(current: ErdLayout, next: ErdLayout): ErdLayout {
  return current.nodes === next.nodes ? current : next;
}
