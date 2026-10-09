import type { Sheet } from "@sheetcraft/core/workbook";
import type { CellStyle } from "@sheetcraft/core/style";
import type { CellAddress } from "@sheetcraft/core/workbook";
import type { SheetGeometry, VisibleCellRange } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { FrozenPaneId } from "@sheetcraft/sheet-engine/frozen-layout";
import type { RowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createCanvasPixelGrid } from "../../../shared/canvas/pixel-grid";
import { getBorderLinePresentation } from "../../../shared/borders/borderPresentation";
import {
  resolveBorderJunctions,
  resolveVisibleBorderSegments,
  resolveVisibleDiagonalBorderSegments,
  type SheetBorderJunction,
  type SheetBorderSegment,
  type SheetDiagonalBorderSegment,
} from "../border-presentation";

type BorderPaintPane = {
  id: FrozenPaneId;
  scrollPosition: { x: number; y: number };
  lines: readonly BorderLinePaintInstruction[];
  junctions: readonly SheetBorderJunction[];
};

type BorderLinePart = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type BorderLinePaintInstruction = {
  orientation: "horizontal" | "vertical" | "diagonal";
  thickness: number;
  color: string;
  strokeWidth: number;
  lineCap: CanvasLineCap;
  dashArray: number[];
  parts: readonly BorderLinePart[];
};

export type SheetBorderPaintPlan = {
  panes: readonly BorderPaintPane[];
};

function getPaneScrollPosition(layout: SheetViewportLayout, id: FrozenPaneId) {
  const pane = layout.panes[id];
  return {
    x:
      id === "topLeft" || id === "left"
        ? 0
        : layout.frozenSize.width + layout.bodyScrollPosition.x - pane.clip.x,
    y:
      id === "topLeft" || id === "top"
        ? 0
        : layout.frozenSize.height + layout.bodyScrollPosition.y - pane.clip.y,
  };
}

function getDashArray(dashArray: string | undefined): number[] {
  return dashArray ? dashArray.split(" ").map(Number) : [];
}

function createOrthogonalLineInstruction(segment: SheetBorderSegment): BorderLinePaintInstruction {
  const presentation = getBorderLinePresentation(segment.style);
  return {
    orientation: segment.orientation,
    thickness: segment.thickness,
    color: segment.color,
    strokeWidth: presentation.strokeWidth,
    lineCap: presentation.lineCap,
    dashArray: getDashArray(presentation.dashArray),
    parts: presentation.offsets.map((offset) =>
      segment.orientation === "horizontal"
        ? {
            x1: segment.x,
            y1: segment.y + segment.thickness / 2 + offset,
            x2: segment.x + segment.length,
            y2: segment.y + segment.thickness / 2 + offset,
          }
        : {
            x1: segment.x + segment.thickness / 2 + offset,
            y1: segment.y,
            x2: segment.x + segment.thickness / 2 + offset,
            y2: segment.y + segment.length,
          },
    ),
  };
}

function createDiagonalLineInstruction(
  segment: SheetDiagonalBorderSegment,
): BorderLinePaintInstruction {
  const presentation = getBorderLinePresentation(segment.style);
  const x1 = segment.x - 0.5;
  const x2 = segment.x + segment.width - 0.5;
  const y1 = (segment.direction === "up" ? segment.y + segment.height : segment.y) - 0.5;
  const y2 = (segment.direction === "up" ? segment.y : segment.y + segment.height) - 0.5;
  const normalX = -(y2 - y1) / segment.length;
  const normalY = (x2 - x1) / segment.length;
  return {
    orientation: "diagonal",
    thickness: segment.thickness,
    color: segment.color,
    strokeWidth: presentation.strokeWidth,
    lineCap: presentation.lineCap,
    dashArray: getDashArray(presentation.dashArray),
    parts: presentation.offsets.map((offset) => ({
      x1: x1 + normalX * offset,
      y1: y1 + normalY * offset,
      x2: x2 + normalX * offset,
      y2: y2 + normalY * offset,
    })),
  };
}

export function createBorderPaintPlan(
  sheet: Sheet,
  geometry: SheetGeometry,
  layout: SheetViewportLayout,
  rows: RowVisibilityIndex,
  getCellStyle?: (address: CellAddress) => Readonly<CellStyle> | undefined,
): SheetBorderPaintPlan {
  const panes: BorderPaintPane[] = [];

  for (const id of ["topLeft", "top", "left", "body"] as const) {
    const pane = layout.panes[id];
    if (
      pane.clip.width <= 0 ||
      pane.clip.height <= 0 ||
      !pane.rows.length ||
      !pane.columns.length
    ) {
      continue;
    }
    const rowIndexes = pane.rows.map((row) => row.index);
    const columnIndexes = pane.columns.map((column) => column.index);
    const visibleRange: VisibleCellRange = {
      startRow: Math.min(...rowIndexes, 0),
      endRow: Math.max(...rowIndexes, 0),
      startColumn: Math.min(...columnIndexes, 0),
      endColumn: Math.max(...columnIndexes, 0),
    };
    const scrollPosition = getPaneScrollPosition(layout, id);
    const segments = resolveVisibleBorderSegments(
      sheet,
      geometry,
      visibleRange,
      scrollPosition,
      rows,
      rowIndexes,
      columnIndexes,
      layout.getMergedRangeAt,
      getCellStyle,
    );
    const diagonals = resolveVisibleDiagonalBorderSegments(
      sheet,
      geometry,
      visibleRange,
      scrollPosition,
      rows,
      rowIndexes,
      columnIndexes,
      layout.getMergedRangeAt,
      getCellStyle,
    );
    panes.push({
      id,
      scrollPosition,
      lines: [
        ...segments.map(createOrthogonalLineInstruction),
        ...diagonals.map(createDiagonalLineInstruction),
      ].sort((left, right) => left.thickness - right.thickness),
      junctions: resolveBorderJunctions(segments),
    });
  }

  return { panes };
}

function paintLineInstruction(
  context: CanvasRenderingContext2D,
  instruction: BorderLinePaintInstruction,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  context.strokeStyle = instruction.color;
  const strokeWidth = pixelGrid.strokeWidth(instruction.strokeWidth);
  context.lineWidth = strokeWidth;
  context.lineCap = instruction.lineCap;
  context.setLineDash(instruction.dashArray);
  for (const part of instruction.parts) {
    context.beginPath();
    if (instruction.orientation === "horizontal") {
      const y = pixelGrid.strokeY(part.y1, strokeWidth);
      context.moveTo(pixelGrid.snapX(part.x1), y);
      context.lineTo(pixelGrid.snapX(part.x2), y);
    } else if (instruction.orientation === "vertical") {
      const x = pixelGrid.strokeX(part.x1, strokeWidth);
      context.moveTo(x, pixelGrid.snapY(part.y1));
      context.lineTo(x, pixelGrid.snapY(part.y2));
    } else {
      // Diagonals retain their natural anti-aliasing; snapping their endpoints
      // independently would bend the intended angle at fractional zoom levels.
      context.moveTo(part.x1, part.y1);
      context.lineTo(part.x2, part.y2);
    }
    context.stroke();
  }
}

function paintJunction(
  context: CanvasRenderingContext2D,
  junction: SheetBorderJunction,
  pixelGrid: ReturnType<typeof createCanvasPixelGrid>,
): void {
  context.fillStyle = junction.color;
  const left = pixelGrid.snapX(junction.x);
  const top = pixelGrid.snapY(junction.y);
  context.fillRect(
    left,
    top,
    pixelGrid.snapX(junction.x + 1) - left,
    pixelGrid.snapY(junction.y + 1) - top,
  );
}

export function paintSheetBorders(
  context: CanvasRenderingContext2D,
  plan: SheetBorderPaintPlan,
  layout: SheetViewportLayout,
): void {
  for (const pane of plan.panes) {
    const currentPane = layout.panes[pane.id];
    const currentScrollPosition = getPaneScrollPosition(layout, pane.id);
    context.save();
    context.beginPath();
    const clip = createCanvasPixelGrid(context).snapRect(currentPane.clip);
    context.rect(clip.x, clip.y, clip.width, clip.height);
    context.clip();
    context.translate(
      pane.scrollPosition.x - currentScrollPosition.x,
      pane.scrollPosition.y - currentScrollPosition.y,
    );
    const pixelGrid = createCanvasPixelGrid(context);

    for (const line of pane.lines) paintLineInstruction(context, line, pixelGrid);
    for (const junction of pane.junctions) paintJunction(context, junction, pixelGrid);
    context.restore();
  }
}
