import type { CellBorder, CellStyle } from "@idea10/core/style";
import { getCellStyle, type Sheet } from "@idea10/core/workbook";
import type { Point, SheetGeometry, VisibleCellRange } from "@idea10/sheet-engine/geometry";
import type { RowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { getBorderLinePresentation } from "../../shared/borders/borderPresentation";

export type SheetBorderOrientation = "horizontal" | "vertical";
export type SheetBorderPlacement = "before" | "after";

export type SheetBorderSegment = {
  key: string;
  orientation: SheetBorderOrientation;
  placement: SheetBorderPlacement;
  edge: number;
  start: number;
  end: number;
  x: number;
  y: number;
  length: number;
  thickness: number;
  css: string;
  style: CellBorder["style"];
  color: string;
};

export type SheetBorderJunction = {
  key: string;
  rowEdge: number;
  columnEdge: number;
  x: number;
  y: number;
  color: string;
};

export type SheetDiagonalBorderDirection = "up" | "down";

export type SheetDiagonalBorderSegment = {
  key: string;
  direction: SheetDiagonalBorderDirection;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  length: number;
  angle: number;
  thickness: number;
  css: string;
  style: CellBorder["style"];
  color: string;
};

export function getCellBorderCss(border: CellBorder): string {
  const { thickness } = getBorderLinePresentation(border.style);
  const lineStyle =
    border.style === "double"
      ? "double"
      : border.style === "dotted"
        ? "dotted"
        : border.style === "dashed" || border.style === "mediumDashed"
          ? "dashed"
          : "solid";
  return `${thickness}px ${lineStyle} ${border.color}`;
}

function getCellBorderThickness(border: CellBorder): number {
  return getBorderLinePresentation(border.style).thickness;
}

function areBordersEqual(left: CellBorder | undefined, right: CellBorder | undefined): boolean {
  return left?.style === right?.style && left?.color === right?.color;
}

function getHorizontalBorder(
  sheet: Sheet,
  upperRow: number | undefined,
  lowerRow: number | undefined,
  column: number,
): CellBorder | undefined {
  const upperStyle: Readonly<CellStyle> | undefined =
    upperRow === undefined ? undefined : getCellStyle(sheet, { row: upperRow, column });
  const lowerStyle: Readonly<CellStyle> | undefined =
    lowerRow === undefined ? undefined : getCellStyle(sheet, { row: lowerRow, column });
  return upperStyle?.borderBottom ?? lowerStyle?.borderTop;
}

function getVerticalBorder(
  sheet: Sheet,
  row: number,
  columnEdge: number,
  columnCount: number,
): CellBorder | undefined {
  const leftStyle: Readonly<CellStyle> | undefined =
    columnEdge > 0 ? getCellStyle(sheet, { row, column: columnEdge - 1 }) : undefined;
  const rightStyle: Readonly<CellStyle> | undefined =
    columnEdge < columnCount ? getCellStyle(sheet, { row, column: columnEdge }) : undefined;
  return leftStyle?.borderRight ?? rightStyle?.borderLeft;
}

function getRowEdgeOffset(
  geometry: SheetGeometry,
  edge: number,
  rows?: RowVisibilityIndex,
): number {
  if (rows) return rows.getBoundaryOffset(edge) ?? rows.getTotalHeight();
  return edge === geometry.rowCount ? geometry.getTotalSize().height : geometry.getRowOffset(edge);
}

function getColumnEdgeOffset(geometry: SheetGeometry, edge: number): number {
  return edge === geometry.columnCount
    ? geometry.getTotalSize().width
    : geometry.getColumnOffset(edge);
}

function clipRunStart(position: number, length: number): { position: number; length: number } {
  if (position >= 0 || position + length <= 0) {
    return { position, length };
  }
  return { position: 0, length: position + length };
}

function alignViewportOriginEdge(position: number, thickness: number): number {
  return position + thickness === 0 ? 0 : position;
}

export function resolveVisibleBorderSegments(
  sheet: Sheet,
  geometry: SheetGeometry,
  visibleRange: VisibleCellRange,
  scrollPosition: Point,
  rows?: RowVisibilityIndex,
  visibleRows?: readonly number[],
  visibleColumns?: readonly number[],
): SheetBorderSegment[] {
  const segments: SheetBorderSegment[] = [];
  const rowIndexes =
    visibleRows ??
    Array.from(
      { length: visibleRange.endRow - visibleRange.startRow + 1 },
      (_, index) => visibleRange.startRow + index,
    );
  const columnIndexes =
    visibleColumns ??
    Array.from(
      { length: visibleRange.endColumn - visibleRange.startColumn + 1 },
      (_, index) => visibleRange.startColumn + index,
    );
  const columnEdges = [...new Set([...columnIndexes, (columnIndexes.at(-1) ?? 0) + 1])];

  type HorizontalBoundary = {
    edge: number;
    upperRow: number | undefined;
    lowerRow: number | undefined;
  };
  const horizontalBoundaries: HorizontalBoundary[] = rowIndexes.map((row) => ({
    edge: row,
    upperRow: rows ? (rows.getPreviousVisibleRow(row) ?? undefined) : row > 0 ? row - 1 : undefined,
    lowerRow: row,
  }));
  const lastRow = rowIndexes.at(-1);
  if (lastRow !== undefined) {
    horizontalBoundaries.push({
      edge: lastRow + 1,
      upperRow: lastRow,
      lowerRow: rows
        ? (rows.getNextVisibleRow(lastRow) ?? undefined)
        : lastRow + 1 < geometry.rowCount
          ? lastRow + 1
          : undefined,
    });
  }

  for (const { edge: rowEdge, upperRow, lowerRow } of horizontalBoundaries) {
    let runStart = columnIndexes[0] ?? 0;
    let runBorder: CellBorder | undefined;

    const flushRun = (endColumn: number) => {
      if (!runBorder || endColumn < runStart) return;
      const thickness = getCellBorderThickness(runBorder);
      const startOffset = getColumnEdgeOffset(geometry, runStart);
      const endOffset = getColumnEdgeOffset(geometry, endColumn + 1);
      const edgeOffset = getRowEdgeOffset(geometry, rowEdge, rows);
      const leadingExtension = runStart === 0 ? 0 : thickness;
      const clippedRun = clipRunStart(
        startOffset - scrollPosition.x - leadingExtension,
        endOffset - startOffset + leadingExtension,
      );
      segments.push({
        key: `horizontal:${rowEdge}:${runStart}-${endColumn}`,
        orientation: "horizontal",
        placement: rowEdge === 0 ? "after" : "before",
        edge: rowEdge,
        start: runStart,
        end: endColumn,
        x: clippedRun.position,
        y: alignViewportOriginEdge(
          edgeOffset - scrollPosition.y - (rowEdge === 0 ? 0 : thickness),
          thickness,
        ),
        length: clippedRun.length,
        thickness,
        css: getCellBorderCss(runBorder),
        style: runBorder.style,
        color: runBorder.color,
      });
    };

    for (const column of columnIndexes) {
      const border = getHorizontalBorder(sheet, upperRow, lowerRow, column);
      if (areBordersEqual(border, runBorder)) continue;
      flushRun(column - 1);
      runStart = column;
      runBorder = border;
    }
    flushRun(columnIndexes.at(-1) ?? 0);
  }

  for (const columnEdge of columnEdges) {
    let runStart = rowIndexes[0] ?? 0;
    let runBorder: CellBorder | undefined;

    const flushRun = (endRow: number) => {
      if (!runBorder || endRow < runStart) return;
      const thickness = getCellBorderThickness(runBorder);
      const startOffset = getRowEdgeOffset(geometry, runStart, rows);
      const endOffset = getRowEdgeOffset(geometry, endRow + 1, rows);
      const edgeOffset = getColumnEdgeOffset(geometry, columnEdge);
      const leadingExtension = runStart === 0 ? 0 : thickness;
      const clippedRun = clipRunStart(
        startOffset - scrollPosition.y - leadingExtension,
        endOffset - startOffset + leadingExtension,
      );
      segments.push({
        key: `vertical:${columnEdge}:${runStart}-${endRow}`,
        orientation: "vertical",
        placement: columnEdge === 0 ? "after" : "before",
        edge: columnEdge,
        start: runStart,
        end: endRow,
        x: alignViewportOriginEdge(
          edgeOffset - scrollPosition.x - (columnEdge === 0 ? 0 : thickness),
          thickness,
        ),
        y: clippedRun.position,
        length: clippedRun.length,
        thickness,
        css: getCellBorderCss(runBorder),
        style: runBorder.style,
        color: runBorder.color,
      });
    };

    for (const row of rowIndexes) {
      const border = getVerticalBorder(sheet, row, columnEdge, geometry.columnCount);
      if (areBordersEqual(border, runBorder)) continue;
      flushRun(row - 1);
      runStart = row;
      runBorder = border;
    }
    flushRun(rowIndexes.at(-1) ?? 0);
  }

  return segments;
}

export function resolveVisibleDiagonalBorderSegments(
  sheet: Sheet,
  geometry: SheetGeometry,
  visibleRange: VisibleCellRange,
  scrollPosition: Point,
  rows?: RowVisibilityIndex,
  visibleRows?: readonly number[],
  visibleColumns?: readonly number[],
): SheetDiagonalBorderSegment[] {
  const segments: SheetDiagonalBorderSegment[] = [];

  const rowIndexes =
    visibleRows ??
    Array.from(
      { length: visibleRange.endRow - visibleRange.startRow + 1 },
      (_, index) => visibleRange.startRow + index,
    );
  const columnIndexes =
    visibleColumns ??
    Array.from(
      { length: visibleRange.endColumn - visibleRange.startColumn + 1 },
      (_, index) => visibleRange.startColumn + index,
    );
  for (const row of rowIndexes) {
    for (const column of columnIndexes) {
      const style = getCellStyle(sheet, { row, column });
      const rect = rows?.getVisibleRow(row)
        ? {
            x: geometry.getColumnOffset(column) - scrollPosition.x,
            y: rows.getVisibleRow(row)!.offset - scrollPosition.y,
            width: geometry.getColumnWidth(column),
            height: rows.getVisibleRow(row)!.height,
          }
        : geometry.getCellViewportRect({ row, column }, scrollPosition);
      const length = Math.hypot(rect.width, rect.height);
      const angle = (Math.atan2(rect.height, rect.width) * 180) / Math.PI;
      const addSegment = (
        direction: SheetDiagonalBorderDirection,
        border: CellBorder | undefined,
      ) => {
        if (!border) return;
        segments.push({
          key: `diagonal-${direction}:${row}:${column}`,
          direction,
          row,
          column,
          ...rect,
          length,
          angle: direction === "up" ? -angle : angle,
          thickness: getCellBorderThickness(border),
          css: getCellBorderCss(border),
          style: border.style,
          color: border.color,
        });
      };
      addSegment("up", style?.borderDiagonalUp);
      addSegment("down", style?.borderDiagonalDown);
    }
  }

  return segments;
}

type JunctionCandidates = {
  horizontal?: SheetBorderSegment;
  vertical?: SheetBorderSegment;
};

function preferSegment(
  current: SheetBorderSegment | undefined,
  candidate: SheetBorderSegment,
): SheetBorderSegment {
  return !current || candidate.thickness >= current.thickness ? candidate : current;
}

/**
 * CSS dashed, dotted, and double borders can all be transparent at the exact
 * point where two border boxes cross. A dedicated pixel gives every logical
 * grid junction a deterministic owner instead of exposing the selection fill.
 */
export function resolveBorderJunctions(
  segments: readonly SheetBorderSegment[],
): SheetBorderJunction[] {
  const candidatesByKey = new Map<string, JunctionCandidates>();

  for (const segment of segments) {
    const firstCrossEdge = segment.start;
    const lastCrossEdge = segment.end + 1;
    for (let crossEdge = firstCrossEdge; crossEdge <= lastCrossEdge; crossEdge += 1) {
      const rowEdge = segment.orientation === "horizontal" ? segment.edge : crossEdge;
      const columnEdge = segment.orientation === "vertical" ? segment.edge : crossEdge;
      const key = `${rowEdge}:${columnEdge}`;
      const candidates = candidatesByKey.get(key) ?? {};
      if (segment.orientation === "horizontal") {
        candidates.horizontal = preferSegment(candidates.horizontal, segment);
      } else {
        candidates.vertical = preferSegment(candidates.vertical, segment);
      }
      candidatesByKey.set(key, candidates);
    }
  }

  const junctions: SheetBorderJunction[] = [];
  for (const [key, candidates] of candidatesByKey) {
    const { horizontal, vertical } = candidates;
    if (!horizontal || !vertical) continue;
    const winner = horizontal.thickness > vertical.thickness ? horizontal : vertical;
    junctions.push({
      key: `junction:${key}`,
      rowEdge: horizontal.edge,
      columnEdge: vertical.edge,
      x: vertical.x + Math.floor(vertical.thickness / 2),
      y: horizontal.y + Math.floor(horizontal.thickness / 2),
      color: winner.color,
    });
  }
  return junctions;
}
