import type { CanvasCell } from "./cell-scene";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";

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

function hasCellFill(style: Pick<CanvasCell, "style">["style"]): boolean {
  return Boolean(style?.fillColor || style?.fillPattern || style?.fillGradient);
}

/** Default gridlines disappear when either adjacent cell has a fill.
 * Explicit workbook borders are painted separately, after the cell scene.
 */
export function paintGridLines(
  context: CanvasRenderingContext2D,
  cells: readonly Pick<CanvasCell, "rect" | "style">[],
  color: string,
  screenScale = 1,
): void {
  if (!cells.length) return;
  const pixels = createCanvasPixelGrid(context, screenScale);
  const lineWidth = pixels.screenStrokeWidth(1);
  const halfLine = lineWidth / 2;

  let leftEdges: EdgeMasks | undefined;
  let topEdges: EdgeMasks | undefined;
  let filledCells: Set<Pick<CanvasCell, "rect" | "style">> | undefined;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    if (!hasCellFill(cell.style)) continue;
    if (!filledCells) {
      filledCells = new Set();
      leftEdges = new Map();
      topEdges = new Map();
    }
    filledCells.add(cell);
    const { x, y, width, height } = cell.rect;
    addMask(leftEdges!, x, y, y + height);
    addMask(topEdges!, y, x, x + width);
  }

  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;

  if (!filledCells) {
    for (let index = 0; index < cells.length; index += 1) {
      const { x, y, width, height } = cells[index]!.rect;
      const right = x + width;
      const bottom = y + height;
      const snappedBottom = pixels.snapY(bottom) - halfLine;
      context.moveTo(pixels.snapX(x), snappedBottom);
      context.lineTo(pixels.snapX(right), snappedBottom);
      const snappedRight = pixels.snapX(right) - halfLine;
      context.moveTo(snappedRight, pixels.snapY(y));
      context.lineTo(snappedRight, pixels.snapY(bottom));
    }
    context.stroke();
    return;
  }

  mergeMasks(leftEdges!);
  mergeMasks(topEdges!);
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index]!;
    if (filledCells.has(cell)) continue;
    const { x, y, width, height } = cell.rect;
    const right = x + width;
    const bottom = y + height;
    const bottomMasks = topEdges!.get(edgeKey(bottom));
    const snappedBottom = pixels.snapY(bottom) - halfLine;
    if (!bottomMasks) {
      context.moveTo(pixels.snapX(x), snappedBottom);
      context.lineTo(pixels.snapX(right), snappedBottom);
    } else {
      let cursor = x;
      for (const [maskStart, maskEnd] of bottomMasks) {
        if (maskEnd <= cursor) continue;
        if (maskStart >= right) break;
        if (maskStart > cursor) {
          context.moveTo(pixels.snapX(cursor), snappedBottom);
          context.lineTo(pixels.snapX(Math.min(maskStart, right)), snappedBottom);
        }
        cursor = Math.max(cursor, maskEnd);
        if (cursor >= right) break;
      }
      if (cursor < right) {
        context.moveTo(pixels.snapX(cursor), snappedBottom);
        context.lineTo(pixels.snapX(right), snappedBottom);
      }
    }
    const rightMasks = leftEdges!.get(edgeKey(right));
    const snappedRight = pixels.snapX(right) - halfLine;
    if (!rightMasks) {
      context.moveTo(snappedRight, pixels.snapY(y));
      context.lineTo(snappedRight, pixels.snapY(bottom));
    } else {
      let cursor = y;
      for (const [maskStart, maskEnd] of rightMasks) {
        if (maskEnd <= cursor) continue;
        if (maskStart >= bottom) break;
        if (maskStart > cursor) {
          context.moveTo(snappedRight, pixels.snapY(cursor));
          context.lineTo(snappedRight, pixels.snapY(Math.min(maskStart, bottom)));
        }
        cursor = Math.max(cursor, maskEnd);
        if (cursor >= bottom) break;
      }
      if (cursor < bottom) {
        context.moveTo(snappedRight, pixels.snapY(cursor));
        context.lineTo(snappedRight, pixels.snapY(bottom));
      }
    }
  }
  context.stroke();
}
