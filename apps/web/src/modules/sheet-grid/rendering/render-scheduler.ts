/** One animation frame owner for the entire sheet. Repeated invalidations share one paint. */
export function createSheetRenderScheduler(
  paint: () => void,
  request = requestAnimationFrame,
  cancel = cancelAnimationFrame,
) {
  let pending: number | undefined;
  let disposed = false;
  function invalidate(): void {
    if (disposed) return;
    if (pending !== undefined) return;
    pending = request(() => {
      pending = undefined;
      if (disposed) return;
      paint();
    });
  }
  return {
    invalidate,
    dispose() {
      disposed = true;
      if (pending !== undefined) cancel(pending);
      pending = undefined;
    },
  };
}
