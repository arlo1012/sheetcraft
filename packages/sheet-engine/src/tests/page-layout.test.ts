import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core";
import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "../geometry.js";
import {
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
});
