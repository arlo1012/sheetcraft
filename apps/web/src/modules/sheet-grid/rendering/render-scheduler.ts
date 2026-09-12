export type SheetPaintLayer = "content" | "borders" | "overlay";

/** One animation frame owner for the entire sheet. Selection never invalidates content. */
export function createSheetRenderScheduler(
  paint: (dirty: ReadonlySet<SheetPaintLayer>) => void,
  request = requestAnimationFrame,
  cancel = cancelAnimationFrame,
) {
  const dirty = new Set<SheetPaintLayer>();
  let pending: number | undefined;
  let disposed = false;
  function invalidate(...layers: SheetPaintLayer[]): void {
    if (disposed) return;
    layers.forEach((layer) => dirty.add(layer));
    if (pending !== undefined) return;
    pending = request(() => {
      pending = undefined;
      if (disposed) return;
      const current = new Set(dirty);
      dirty.clear();
      paint(current);
    });
  }
  return {
    invalidate,
    dispose() {
      disposed = true;
      if (pending !== undefined) cancel(pending);
      pending = undefined;
      dirty.clear();
    },
  };
}
