import type { CellBorder, CellStyle } from "../workbook/cell-style";
import { getCellStyle, type Sheet } from "../workbook/workbook";
import type { Point, SheetGeometry, VisibleCellRange } from "./geometry";

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

const BORDER_LINE_STYLE_CSS: Record<CellBorder["style"], string> = {
  thin: "1px solid",
  medium: "2px solid",
  dashed: "1px dashed",
  dotted: "1px dotted",
  double: "3px double",
};

const BORDER_LINE_THICKNESS: Record<CellBorder["style"], number> = {
  thin: 1,
  medium: 2,
  dashed: 1,
  dotted: 1,
  double: 3,
};

export function getCellBorderCss(border: CellBorder): string {
  return `${BORDER_LINE_STYLE_CSS[border.style]} ${border.color}`;
}

function getCellBorderThickness(border: CellBorder): number {
  return BORDER_LINE_THICKNESS[border.style];
}

function areBordersEqual(left: CellBorder | undefined, right: CellBorder | undefined): boolean {
  return left?.style === right?.style && left?.color === right?.color;
}

function getHorizontalBorder(
  sheet: Sheet,
  rowEdge: number,
  column: number,
  rowCount: number,
): CellBorder | undefined {
  const upperStyle: Readonly<CellStyle> | undefined =
    rowEdge > 0 ? getCellStyle(sheet, { row: rowEdge - 1, column }) : undefined;
  const lowerStyle: Readonly<CellStyle> | undefined =
    rowEdge < rowCount ? getCellStyle(sheet, { row: rowEdge, column }) : undefined;
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

function getRowEdgeOffset(geometry: SheetGeometry, edge: number): number {
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
): SheetBorderSegment[] {
  const segments: SheetBorderSegment[] = [];
  const endRowEdge = Math.min(visibleRange.endRow + 1, geometry.rowCount);
  const endColumnEdge = Math.min(visibleRange.endColumn + 1, geometry.columnCount);

  for (let rowEdge = visibleRange.startRow; rowEdge <= endRowEdge; rowEdge += 1) {
    let runStart = visibleRange.startColumn;
    let runBorder: CellBorder | undefined;

    const flushRun = (endColumn: number) => {
      if (!runBorder || endColumn < runStart) return;
      const thickness = getCellBorderThickness(runBorder);
      const startOffset = getColumnEdgeOffset(geometry, runStart);
      const endOffset = getColumnEdgeOffset(geometry, endColumn + 1);
      const edgeOffset = getRowEdgeOffset(geometry, rowEdge);
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

    for (let column = visibleRange.startColumn; column <= visibleRange.endColumn; column += 1) {
      const border = getHorizontalBorder(sheet, rowEdge, column, geometry.rowCount);
      if (areBordersEqual(border, runBorder)) continue;
      flushRun(column - 1);
      runStart = column;
      runBorder = border;
    }
    flushRun(visibleRange.endColumn);
  }

  for (let columnEdge = visibleRange.startColumn; columnEdge <= endColumnEdge; columnEdge += 1) {
    let runStart = visibleRange.startRow;
    let runBorder: CellBorder | undefined;

    const flushRun = (endRow: number) => {
      if (!runBorder || endRow < runStart) return;
      const thickness = getCellBorderThickness(runBorder);
      const startOffset = getRowEdgeOffset(geometry, runStart);
      const endOffset = getRowEdgeOffset(geometry, endRow + 1);
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

    for (let row = visibleRange.startRow; row <= visibleRange.endRow; row += 1) {
      const border = getVerticalBorder(sheet, row, columnEdge, geometry.columnCount);
      if (areBordersEqual(border, runBorder)) continue;
      flushRun(row - 1);
      runStart = row;
      runBorder = border;
    }
    flushRun(visibleRange.endRow);
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
