import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupChild,
} from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { getPictureObjectOriginCell } from "@sheetcraft/core/picture-object-sheet";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import {
  createPictureSheetMetrics,
  locatePictureAxisPoint,
} from "@sheetcraft/core/picture-axis-metrics";
import { getPivotTableRange } from "@sheetcraft/core/pivot-tables";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createSheetGeometry, type Point, type SheetGeometry, type Size } from "./geometry.js";

export type GridExtent = {
  rowCount: number;
  columnCount: number;
};

export type GridExtentPolicy = {
  growth: GridExtent;
  tail: GridExtent;
};

export const DEFAULT_INITIAL_GRID_EXTENT: GridExtent = {
  rowCount: 100,
  columnCount: 26,
};

export const DEFAULT_GRID_EXTENT_POLICY: GridExtentPolicy = {
  growth: {
    rowCount: 50,
    columnCount: 8,
  },
  tail: {
    rowCount: 10,
    columnCount: 2,
  },
};

/** The allocated surface may shrink, but document content and metadata must remain reachable. */
export function getSheetContentExtent(sheet: Sheet): GridExtent {
  let rowCount = Math.max(1, sheet.freezePanes.rows);
  let columnCount = Math.max(1, sheet.freezePanes.columns);
  const include = (address: CellAddress): void => {
    rowCount = Math.max(rowCount, address.row + 1);
    columnCount = Math.max(columnCount, address.column + 1);
  };
  for (const key of sheet.cells.keys()) {
    const separator = key.indexOf(":");
    include({ row: Number(key.slice(0, separator)), column: Number(key.slice(separator + 1)) });
  }
  for (const row of sheet.rowHeights.keys()) rowCount = Math.max(rowCount, row + 1);
  for (const column of sheet.columnWidths.keys()) columnCount = Math.max(columnCount, column + 1);
  for (const row of sheet.hiddenRows ?? []) rowCount = Math.max(rowCount, row + 1);
  for (const column of sheet.hiddenColumns ?? []) columnCount = Math.max(columnCount, column + 1);
  for (const range of sheet.mergedCells) {
    include(range.start);
    include(range.end);
  }
  if (sheet.filter) include(sheet.filter.range.end);
  for (const table of sheet.tables ?? []) include(table.range.end);
  for (const table of sheet.pivotTables ?? []) include(getPivotTableRange(table).end);
  if (sheet.floatingImages.length > 0) {
    const geometry = createSheetGeometry({
      rowHeights: sheet.rowHeights,
      columnWidths: sheet.columnWidths,
      columnWidth: sheet.defaultColumnWidth,
      hiddenRows: sheet.hiddenRows,
      hiddenColumns: sheet.hiddenColumns,
    });
    const total = geometry.getTotalSize();
    const pictureMetrics = sheet.floatingImages.some(
      (image) => isFramedPictureObject(image) || isPictureGroup(image),
    )
      ? createPictureSheetMetrics(sheet)
      : undefined;
    const includePictureBounds = (bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): void => {
      include({
        row: Math.min(
          MAX_SHEET_ROWS - 1,
          locatePictureAxisPoint(bounds.y + bounds.height, pictureMetrics!.rows).index,
        ),
        column: Math.min(
          MAX_SHEET_COLUMNS - 1,
          locatePictureAxisPoint(bounds.x + bounds.width, pictureMetrics!.columns).index,
        ),
      });
    };
    const includeGroupChildren = (children: readonly ResolvedPictureGroupChild[]): void => {
      for (const child of children) {
        // Visibility never releases document reachability, including hidden ancestors/leaves.
        if (child.layout) includePictureBounds(child.layout.bounds);
        if (child.node.kind === "grouped-group-v1" && "members" in child)
          includeGroupChildren(child.members);
      }
    };
    for (const image of sheet.floatingImages) {
      if (isPictureGroup(image)) {
        include(getPictureObjectOriginCell(image, sheet));
        const resolved = resolvePictureGroup(image, pictureMetrics!);
        includePictureBounds(resolved.layout.bounds);
        includeGroupChildren(resolved.members);
        continue;
      }
      if (isFramedPictureObject(image)) {
        include(getPictureObjectOriginCell(image, sheet));
        const bounds = resolvePictureFrame(image.frame, pictureMetrics!).bounds;
        includePictureBounds(bounds);
        continue;
      }
      include(image.anchor);
      const anchor = geometry.getCellRect(image.anchor);
      const end = geometry.getCellAtPoint({
        x: Math.min(total.width - 1, anchor.x + image.offsetX + image.width - 1),
        y: Math.min(total.height - 1, anchor.y + image.offsetY + image.height - 1),
      });
      if (end) include(end);
    }
  }
  return { rowCount, columnCount };
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function growDimension(current: number, minimum: number, step: number, maximum: number): number {
  if (minimum <= current) {
    return current;
  }

  const blocks = Math.ceil((minimum - current) / step);
  return Math.min(maximum, current + blocks * step);
}

export function createGridExtent(options?: Partial<GridExtent>): GridExtent {
  const rowCount = options?.rowCount ?? DEFAULT_INITIAL_GRID_EXTENT.rowCount;
  const columnCount = options?.columnCount ?? DEFAULT_INITIAL_GRID_EXTENT.columnCount;
  assertPositiveInteger(rowCount, "Grid row count");
  assertPositiveInteger(columnCount, "Grid column count");

  if (rowCount > MAX_SHEET_ROWS || columnCount > MAX_SHEET_COLUMNS) {
    throw new RangeError("Grid extent exceeds the spreadsheet limits.");
  }

  return { rowCount, columnCount };
}

export function expandGridExtent(
  current: GridExtent,
  minimum: GridExtent,
  growth: GridExtent,
): GridExtent {
  assertPositiveInteger(growth.rowCount, "Grid row growth");
  assertPositiveInteger(growth.columnCount, "Grid column growth");

  return {
    rowCount: growDimension(current.rowCount, minimum.rowCount, growth.rowCount, MAX_SHEET_ROWS),
    columnCount: growDimension(
      current.columnCount,
      minimum.columnCount,
      growth.columnCount,
      MAX_SHEET_COLUMNS,
    ),
  };
}

export function expandGridExtentForAddress(
  current: GridExtent,
  address: CellAddress,
  growth: GridExtent,
): GridExtent {
  return expandGridExtent(
    current,
    { rowCount: address.row + 1, columnCount: address.column + 1 },
    growth,
  );
}

export function expandGridExtentForViewport(
  current: GridExtent,
  scrollPosition: Point,
  viewportSize: Size,
  geometry: SheetGeometry,
  policy: GridExtentPolicy,
): GridExtent {
  const visibleRange = geometry.getVisibleRange(scrollPosition, viewportSize, 0);

  return expandGridExtent(
    current,
    {
      rowCount: visibleRange.endRow + 1 + policy.tail.rowCount,
      columnCount: visibleRange.endColumn + 1 + policy.tail.columnCount,
    },
    policy.growth,
  );
}
