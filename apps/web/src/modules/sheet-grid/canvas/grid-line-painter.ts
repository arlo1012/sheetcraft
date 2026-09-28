import type { CanvasCell } from "./cell-scene";

type Interval = [start: number, end: number];
type EdgeMasks = Map<number, Interval[]>;

// Adjacent scaled rectangles can reach the same edge through different sums.
const edgeKey = (coordinate: number) => Math.round(coordinate * 1_000_000);

function addMask(masks: EdgeMasks, edge: number, start: number, end: number): void {
  const key = edgeKey(edge);
  const intervals = masks.get(key);
  if (intervals) intervals.push([start, end]);
  else masks.set(key, [[start, end]]);
}

function mergeMasks(masks: EdgeMasks): void {
  for (const [edge, intervals] of masks) {
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: Interval[] = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval[0] <= previous[1] + 0.000001)
        previous[1] = Math.max(previous[1], interval[1]);
      else merged.push([...interval]);
    }
    masks.set(edge, merged);
  }
}

function visibleSegments(
  start: number,
  end: number,
  masks: readonly Interval[] | undefined,
  draw: (start: number, end: number) => void,
): void {
  let cursor = start;
  for (const [maskStart, maskEnd] of masks ?? []) {
    if (maskEnd <= cursor) continue;
    if (maskStart >= end) break;
    if (maskStart > cursor) draw(cursor, Math.min(maskStart, end));
    cursor = Math.max(cursor, maskEnd);
    if (cursor >= end) return;
  }
  if (cursor < end) draw(cursor, end);
}

/** Default gridlines disappear when either adjacent cell has a fill.
 * Explicit workbook borders are painted separately, after the cell scene.
 */
export function paintGridLines(
  context: CanvasRenderingContext2D,
  cells: readonly Pick<CanvasCell, "rect" | "style">[],
  color: string,
): void {
  const filled = cells.filter(({ style }) =>
    Boolean(style?.fillColor || style?.fillPattern || style?.fillGradient),
  );
  const filledCells = new Set(filled);
  const leftEdges: EdgeMasks = new Map();
  const topEdges: EdgeMasks = new Map();
  for (const { rect } of filled) {
    addMask(leftEdges, rect.x, rect.y, rect.y + rect.height);
    addMask(topEdges, rect.y, rect.x, rect.x + rect.width);
  }
  mergeMasks(leftEdges);
  mergeMasks(topEdges);
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = 1;
  for (const cell of cells) {
    if (filledCells.has(cell)) continue;
    const { x, y, width, height } = cell.rect;
    const right = x + width;
    const bottom = y + height;
    visibleSegments(x, right, topEdges.get(edgeKey(bottom)), (start, end) => {
      context.moveTo(start, bottom - 0.5);
      context.lineTo(end, bottom - 0.5);
    });
    visibleSegments(y, bottom, leftEdges.get(edgeKey(right)), (start, end) => {
      context.moveTo(right - 0.5, start);
      context.lineTo(right - 0.5, end);
    });
  }
  context.stroke();
}
