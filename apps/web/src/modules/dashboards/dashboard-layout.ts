import type { DashboardWidget } from "@sheetcraft/core/dashboard";
export function dashboardLayout(widgets: DashboardWidget[], columns: number) {
  const used = new Set<number>();
  let cursor = 0;
  return widgets.map((widget) => {
    const span = Math.min(columns, widget.width);
    function available(at: number) {
      if ((at % columns) + span > columns) return false;
      for (let row = 0; row < widget.height; row++)
        for (let col = 0; col < span; col++) if (used.has(at + row * columns + col)) return false;
      return true;
    }
    while (!available(cursor)) cursor++;
    const row = Math.floor(cursor / columns),
      col = cursor % columns;
    for (let y = 0; y < widget.height; y++)
      for (let x = 0; x < span; x++) used.add(cursor + y * columns + x);
    cursor += span;
    return { widget, row, col, width: span, height: widget.height };
  });
}
