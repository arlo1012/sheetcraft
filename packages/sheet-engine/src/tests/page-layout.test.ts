import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core";
import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "../geometry.js";
import {
  adjustSheetPageBoundary,
  adjustSheetPageMargin,
  adjustSheetPrintCorner,
  createPageLayoutProjection,
  createPageLayoutViewportLayout,
  createSheetPagination,
} from "../page-layout.js";
import { createRowVisibilityIndex } from "../visibility.js";

function fixture(options?: {
  hiddenRows?: number[];
  hiddenColumns?: number[];
  rowBreaks?: number[];
  columnBreaks?: number[];
}) {
  const geometry = createSheetGeometry({
    rowCount: 30,
    columnCount: 6,
    rowHeight: 20,
    columnWidth: 80,
    hiddenColumns: options?.hiddenColumns,
  });
  const rows = createRowVisibilityIndex({
    rowCount: 30,
    defaultRowHeight: 20,
    hiddenRows: options?.hiddenRows,
  });
  const setup = {
    ...DEFAULT_SHEET_PAGE_SETUP,
    scale: 400,
    rowBreaks: options?.rowBreaks ?? [],
    columnBreaks: options?.columnBreaks ?? [],
  };
  const pagination = createSheetPagination({
    geometry,
    rows,
    setup,
    printRange: { start: { row: 0, column: 0 }, end: { row: 29, column: 5 } },
  });
  return { geometry, rows, pagination };
}

describe("page layout", () => {
  test("paginates visible whole cells and preserves manual boundaries", () => {
    const { rows, pagination } = fixture({
      hiddenRows: [3],
      hiddenColumns: [2],
      rowBreaks: [4],
      columnBreaks: [3],
    });
    expect(pagination.printScale).toBe(4);
    expect(pagination.pageRows[0]).toMatchObject({ start: 0, end: 3 });
    expect(pagination.pageRows[1]?.start).toBe(4);
    expect(pagination.rowBreaks[0]).toEqual({
      index: 4,
      kind: "manual",
      offset: rows.getBoundaryOffset(4),
    });
    expect(pagination.pageColumns[0]).toMatchObject({ start: 0, end: 2 });
    expect(pagination.columnBreaks[0]?.kind).toBe("manual");
    expect(pagination.getPage(0, 0)?.pageNumber).toBe(1);
    expect(pagination.getVisiblePages(pagination.getPage(0, 0)!.paperRect)).toHaveLength(1);
  });

  test("does not turn paper margins and gaps into editable cells", () => {
    const { geometry, rows, pagination } = fixture();
    const projection = createPageLayoutProjection({ geometry, rows, pagination });
    const first = pagination.getPage(0, 0)!;
    const nextColumnPage = pagination.getPage(0, 1)!;
    expect(
      projection.geometry.getCellAtPoint({ x: first.paperRect.x + 1, y: first.contentRect.y + 1 }),
    ).toBeNull();
    expect(
      projection.geometry.getCellAtPoint({
        x: first.paperRect.x + first.paperRect.width + 4,
        y: first.contentRect.y + 1,
      }),
    ).toBeNull();
    expect(
      projection.geometry.getCellAtPoint({
        x: nextColumnPage.contentRect.x + 1,
        y: nextColumnPage.contentRect.y + 1,
      }),
    ).toEqual({ row: 0, column: nextColumnPage.range.start.column });
  });

  test("splits selection fragments at page gaps while retaining one viewport contract", () => {
    const { geometry, rows, pagination } = fixture();
    const layout = createPageLayoutViewportLayout({
      geometry,
      rows,
      pagination,
      viewportSize: { width: 1200, height: 1200 },
    });
    const fragments = layout.getRangeFragments({
      start: { row: 0, column: 0 },
      end: { row: 29, column: 5 },
    });
    expect(layout.freeze).toEqual({ rows: 0, columns: 0 });
    expect(fragments.length).toBe(pagination.pageCount);
    expect(fragments.every((fragment) => fragment.paneId === "body")).toBe(true);
  });

  test("adjusts all outer print boundaries without mutating the input setup", () => {
    const geometry = createSheetGeometry({
      rowCount: 12,
      columnCount: 12,
      rowHeight: 20,
      columnWidth: 80,
    });
    const rows = createRowVisibilityIndex({ rowCount: 12, defaultRowHeight: 20 });
    const setup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      printArea: { start: { row: 2, column: 2 }, end: { row: 5, column: 5 } },
    };
    const pagination = createSheetPagination({
      geometry,
      rows,
      setup,
      printRange: setup.printArea,
    });
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "row", kind: "print-start", index: 2 },
        targetIndex: -99,
      })?.printArea,
    ).toEqual({ start: { row: 0, column: 2 }, end: { row: 5, column: 5 } });
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "row", kind: "print-end", index: 6 },
        targetIndex: 3,
      })?.printArea,
    ).toEqual({ start: { row: 2, column: 2 }, end: { row: 2, column: 5 } });
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "column", kind: "print-start", index: 2 },
        targetIndex: 4,
      })?.printArea,
    ).toEqual({ start: { row: 2, column: 4 }, end: { row: 5, column: 5 } });
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "column", kind: "print-end", index: 6 },
        targetIndex: 3,
      })?.printArea,
    ).toEqual({ start: { row: 2, column: 2 }, end: { row: 5, column: 2 } });
    expect(setup.printArea).toEqual({ start: { row: 2, column: 2 }, end: { row: 5, column: 5 } });
  });

  test("moves all print corners atomically, clamps a collapsed range, and preserves one-axis drags", () => {
    const geometry = createSheetGeometry({
      rowCount: 10,
      columnCount: 10,
      rowHeight: 20,
      columnWidth: 80,
    });
    const rows = createRowVisibilityIndex({ rowCount: 10, defaultRowHeight: 20 });
    const setup = {
      ...DEFAULT_SHEET_PAGE_SETUP,
      printArea: { start: { row: 2, column: 2 }, end: { row: 5, column: 5 } },
    };
    const pagination = createSheetPagination({
      geometry,
      rows,
      setup,
      printRange: setup.printArea,
    });
    const adjust = (
      corner: "top-left" | "top-right" | "bottom-left" | "bottom-right",
      targetRow: number,
      targetColumn: number,
    ) =>
      adjustSheetPrintCorner({ geometry, rows, setup, pagination, corner, targetRow, targetColumn })
        ?.printArea;
    expect(adjust("top-left", 0, 0)).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 5, column: 5 },
    });
    expect(adjust("top-right", 0, 8)).toEqual({
      start: { row: 0, column: 2 },
      end: { row: 5, column: 7 },
    });
    expect(adjust("bottom-left", 8, 0)).toEqual({
      start: { row: 2, column: 0 },
      end: { row: 7, column: 5 },
    });
    expect(adjust("bottom-right", 8, 8)).toEqual({
      start: { row: 2, column: 2 },
      end: { row: 7, column: 7 },
    });
    expect(adjust("bottom-right", -3, -3)).toEqual({
      start: { row: 2, column: 2 },
      end: { row: 2, column: 2 },
    });
    expect(adjust("top-left", 0, 2)).toEqual({
      start: { row: 0, column: 2 },
      end: { row: 5, column: 5 },
    });
    expect(adjust("top-left", 2, 2)).toBeUndefined();
    expect(setup.printArea).toEqual({ start: { row: 2, column: 2 }, end: { row: 5, column: 5 } });
  });

  test("clamps page margins to usable paper and header/footer ownership", () => {
    const setup = { ...DEFAULT_SHEET_PAGE_SETUP };
    expect(adjustSheetPageMargin({ setup, margin: "top", valueMm: 0 })?.margins.top).toBe(
      setup.margins.header,
    );
    expect(adjustSheetPageMargin({ setup, margin: "header", valueMm: 999 })?.margins.header).toBe(
      setup.margins.top,
    );
    const left = adjustSheetPageMargin({ setup, margin: "left", valueMm: 999 })!;
    expect(left.margins.left + left.margins.right).toBeLessThan(210);
    expect(
      adjustSheetPageMargin({ setup, margin: "left", valueMm: setup.margins.left }),
    ).toBeNull();
    expect(setup).toEqual(DEFAULT_SHEET_PAGE_SETUP);
  });

  test("hides vertical white space in the projection without changing page cells or fragments", () => {
    const geometry = createSheetGeometry({
      rowCount: 30,
      columnCount: 4,
      rowHeight: 20,
      columnWidth: 80,
    });
    const rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 20 });
    const setup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 400 };
    const range = { start: { row: 0, column: 0 }, end: { row: 29, column: 3 } };
    const pagination = createSheetPagination({ geometry, rows, setup, printRange: range });
    const shown = createPageLayoutProjection({ geometry, rows, pagination });
    const hidden = createPageLayoutProjection({
      geometry,
      rows,
      pagination,
      showWhiteSpace: false,
    });
    const secondShown = shown.getPage(1, 0)!;
    const secondHidden = hidden.getPage(1, 0)!;
    expect(secondHidden.contentRect.y).toBeLessThan(secondShown.contentRect.y);
    expect(secondHidden.paperRect.height).toBe(secondHidden.contentRect.height);
    expect(
      hidden.geometry.getCellAtPoint({
        x: secondHidden.contentRect.x + 1,
        y: secondHidden.contentRect.y + 1,
      }),
    ).toEqual({ row: secondHidden.range.start.row, column: secondHidden.range.start.column });
    expect(hidden.getVisiblePages(secondHidden.paperRect)).toHaveLength(1);
    const layout = createPageLayoutViewportLayout({
      geometry,
      rows,
      pagination,
      showWhiteSpace: false,
      viewportSize: { width: 1000, height: 1000 },
    });
    expect(
      layout.getRangeFragments({ start: { row: 0, column: 0 }, end: { row: 29, column: 3 } })
        .length,
    ).toBe(pagination.pageCount);
  });

  test("expands an automatic boundary by lowering scale so its old auto break cannot reappear", () => {
    const geometry = createSheetGeometry({
      rowCount: 4,
      columnCount: 6,
      rowHeight: 20,
      columnWidth: 80,
    });
    const rows = createRowVisibilityIndex({ rowCount: 4, defaultRowHeight: 20 });
    const setup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 400 };
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 5 } };
    const pagination = createSheetPagination({ geometry, rows, setup, printRange: range });
    expect(pagination.columnBreaks[0]).toMatchObject({ index: 2, kind: "automatic" });
    const adjusted = adjustSheetPageBoundary({
      geometry,
      rows,
      setup,
      pagination,
      boundary: { axis: "column", kind: "automatic", index: 2 },
      targetIndex: 4,
    })!;
    expect(adjusted.scale).toBeLessThan(400);
    expect(adjusted.columnBreaks).toEqual([4]);
    const after = createSheetPagination({ geometry, rows, setup: adjusted, printRange: range });
    expect(after.columnBreaks.filter((line) => line.index < 4)).toEqual([]);
    expect(after.columnBreaks.find((line) => line.index === 4)?.kind).toBe("manual");
    expect(setup).toMatchObject({ scale: 400, columnBreaks: [] });
  });

  test("collapses the final page and removes crossed manual breaks only", () => {
    const geometry = createSheetGeometry({
      rowCount: 4,
      columnCount: 6,
      rowHeight: 20,
      columnWidth: 80,
    });
    const rows = createRowVisibilityIndex({ rowCount: 4, defaultRowHeight: 20 });
    const setup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 400, columnBreaks: [4] };
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 5 } };
    const pagination = createSheetPagination({ geometry, rows, setup, printRange: range });
    const adjusted = adjustSheetPageBoundary({
      geometry,
      rows,
      setup,
      pagination,
      boundary: { axis: "column", kind: "manual", index: 4 },
      targetIndex: 6,
    })!;
    expect(adjusted.columnBreaks).toEqual([]);
    expect(adjusted.scale).toBeLessThan(400);
    expect(
      createSheetPagination({ geometry, rows, setup: adjusted, printRange: range }).pageCount,
    ).toBe(2);
  });

  test("uses visible unequal row heights and supports manual deletion plus merge-safe targets", () => {
    const geometry = createSheetGeometry({
      rowCount: 5,
      columnCount: 6,
      rowHeight: 20,
      columnWidth: 80,
      rowHeights: new Map([
        [0, 100],
        [1, 100],
        [3, 100],
      ]),
    });
    const rows = createRowVisibilityIndex({
      rowCount: 5,
      defaultRowHeight: 20,
      rowHeights: new Map([
        [0, 100],
        [1, 100],
        [3, 100],
      ]),
      hiddenRows: [2],
    });
    const setup = { ...DEFAULT_SHEET_PAGE_SETUP, scale: 400, columnBreaks: [2, 5] };
    const range = { start: { row: 0, column: 0 }, end: { row: 4, column: 5 } };
    const pagination = createSheetPagination({ geometry, rows, setup, printRange: range });
    const rowAdjusted = adjustSheetPageBoundary({
      geometry,
      rows,
      setup,
      pagination,
      boundary: { axis: "row", kind: "automatic", index: pagination.rowBreaks[0]!.index },
      targetIndex: 4,
    })!;
    expect(rowAdjusted.scale).toBeLessThan(400);
    expect(rowAdjusted.rowBreaks).toEqual([4]);
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "column", kind: "automatic", index: 2 },
        targetIndex: null,
      }),
    ).toBeNull();
    expect(
      adjustSheetPageBoundary({
        geometry,
        rows,
        setup,
        pagination,
        boundary: { axis: "column", kind: "manual", index: 5 },
        targetIndex: null,
      })?.columnBreaks,
    ).toEqual([2]);
    const merged = adjustSheetPageBoundary({
      geometry,
      rows,
      setup,
      pagination,
      boundary: { axis: "column", kind: "manual", index: 2 },
      targetIndex: 3,
      mergedCells: [{ start: { row: 0, column: 2 }, end: { row: 2, column: 3 } }],
    })!;
    expect(merged.columnBreaks).toContain(4);
  });
});
