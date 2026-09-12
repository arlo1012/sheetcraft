import type { Sheet } from "@idea10/core/workbook";
import type { SheetGeometry, VisibleCellRange } from "@idea10/sheet-engine/geometry";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { FrozenPaneId } from "@idea10/sheet-engine/frozen-layout";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
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
  segments: readonly SheetBorderSegment[];
  diagonals: readonly SheetDiagonalBorderSegment[];
  junctions: readonly SheetBorderJunction[];
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

export function createBorderPaintPlan(
  sheet: Sheet,
  geometry: SheetGeometry,
  layout: SheetViewportLayout,
  rows: RowVisibilityIndex,
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
    );
    panes.push({
      id,
      scrollPosition,
      segments,
      diagonals: resolveVisibleDiagonalBorderSegments(
        sheet,
        geometry,
        visibleRange,
        scrollPosition,
        rows,
        rowIndexes,
        columnIndexes,
        layout.getMergedRangeAt,
      ),
      junctions: resolveBorderJunctions(segments),
    });
  }

  return { panes };
}

function setLineDash(context: CanvasRenderingContext2D, dashArray: string | undefined): void {
  context.setLineDash(dashArray ? dashArray.split(" ").map(Number) : []);
}

function paintOrthogonalSegment(
  context: CanvasRenderingContext2D,
  segment: SheetBorderSegment,
): void {
  const presentation = getBorderLinePresentation(segment.style);
  context.strokeStyle = segment.color;
  context.lineWidth = presentation.strokeWidth;
  context.lineCap = presentation.lineCap;
  setLineDash(context, presentation.dashArray);

  for (const offset of presentation.offsets) {
    context.beginPath();
    if (segment.orientation === "horizontal") {
      const y = segment.y + segment.thickness / 2 + offset;
      context.moveTo(segment.x, y);
      context.lineTo(segment.x + segment.length, y);
    } else {
      const x = segment.x + segment.thickness / 2 + offset;
      context.moveTo(x, segment.y);
      context.lineTo(x, segment.y + segment.length);
    }
    context.stroke();
  }
}

function paintDiagonalSegment(
  context: CanvasRenderingContext2D,
  segment: SheetDiagonalBorderSegment,
): void {
  const presentation = getBorderLinePresentation(segment.style);
  const x1 = segment.x - 0.5;
  const x2 = segment.x + segment.width - 0.5;
  const y1 = (segment.direction === "up" ? segment.y + segment.height : segment.y) - 0.5;
  const y2 = (segment.direction === "up" ? segment.y : segment.y + segment.height) - 0.5;
  const normalX = -(y2 - y1) / segment.length;
  const normalY = (x2 - x1) / segment.length;
  context.strokeStyle = segment.color;
  context.lineWidth = presentation.strokeWidth;
  context.lineCap = presentation.lineCap;
  setLineDash(context, presentation.dashArray);

  for (const offset of presentation.offsets) {
    context.beginPath();
    context.moveTo(x1 + normalX * offset, y1 + normalY * offset);
    context.lineTo(x2 + normalX * offset, y2 + normalY * offset);
    context.stroke();
  }
}

function paintJunction(context: CanvasRenderingContext2D, junction: SheetBorderJunction): void {
  context.fillStyle = junction.color;
  context.fillRect(junction.x, junction.y, 1, 1);
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
    context.rect(
      currentPane.clip.x,
      currentPane.clip.y,
      currentPane.clip.width,
      currentPane.clip.height,
    );
    context.clip();
    context.translate(
      pane.scrollPosition.x - currentScrollPosition.x,
      pane.scrollPosition.y - currentScrollPosition.y,
    );

    const lines = [
      ...pane.segments.map((segment) => ({ type: "orthogonal" as const, segment })),
      ...pane.diagonals.map((segment) => ({ type: "diagonal" as const, segment })),
    ].sort((left, right) => left.segment.thickness - right.segment.thickness);
    for (const line of lines) {
      if (line.type === "orthogonal") paintOrthogonalSegment(context, line.segment);
      else paintDiagonalSegment(context, line.segment);
    }
    for (const junction of pane.junctions) paintJunction(context, junction);
    context.restore();
  }
}
