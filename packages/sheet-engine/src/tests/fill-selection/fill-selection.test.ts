import { describe, expect, test } from "vitest";
import { createSheetGeometry } from "../../geometry.js";
import { getDoubleClickFillRange, getFillHandlePoint, getFillRange } from "../../fill-selection.js";
import { createSheetViewportLayout } from "../../viewport-layout.js";
import type { SheetViewportLayout } from "../../viewport-layout.js";
import { createRowVisibilityIndex } from "../../visibility.js";

const source = {
  start: { row: 3, column: 4 },
  end: { row: 4, column: 5 },
};

describe("fill selection", () => {
  test("anchors the handle at the real visible end cell, including frozen panes", () => {
    const geometry = createSheetGeometry({
      rowCount: 10,
      columnCount: 10,
      rowHeight: 20,
      columnWidth: 50,
    });
    const layout = createSheetViewportLayout({
      geometry,
      rows: createRowVisibilityIndex({ rowCount: 10, defaultRowHeight: 20 }),
      freeze: { rows: 1, columns: 1 },
      bodyScrollPosition: { x: 50, y: 20 },
      viewportSize: { width: 200, height: 100 },
    });
    expect(
      getFillHandlePoint(layout, {
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      }),
    ).toEqual({ x: 50, y: 20 });
    expect(
      getFillHandlePoint(layout, {
        start: { row: 0, column: 0 },
        end: { row: 9, column: 9 },
      }),
    ).toBeNull();
  });

  test("does not substitute a pane clip corner for an offscreen end cell", () => {
    const layout = {
      getCellViewportRect: () => ({ x: -20, y: -20, width: 20, height: 20 }),
      getPaneForAddress: () => "body",
      panes: { body: { clip: { x: 0, y: 0, width: 100, height: 100 } } },
    } as unknown as SheetViewportLayout;
    expect(getFillHandlePoint(layout, source)).toBeNull();
  });

  test("extends a rectangular source on every single axis", () => {
    expect(getFillRange(source, { row: 8, column: 5 })).toMatchObject({
      direction: "down",
      target: { start: { row: 5, column: 4 }, end: { row: 8, column: 5 } },
      range: { start: { row: 3, column: 4 }, end: { row: 8, column: 5 } },
    });
    expect(getFillRange(source, { row: 0, column: 4 })).toMatchObject({
      direction: "up",
      target: { start: { row: 0, column: 4 }, end: { row: 2, column: 5 } },
    });
    expect(getFillRange(source, { row: 4, column: 9 })).toMatchObject({
      direction: "right",
      target: { start: { row: 3, column: 6 }, end: { row: 4, column: 9 } },
    });
    expect(getFillRange(source, { row: 3, column: 1 })).toMatchObject({
      direction: "left",
      target: { start: { row: 3, column: 1 }, end: { row: 4, column: 3 } },
    });
  });

  test("chooses a stable axis for a diagonal gesture and rejects the source", () => {
    expect(getFillRange(source, { row: 9, column: 9 })?.direction).toBe("down");
    expect(getFillRange(source, { row: 9, column: 9 }, { direction: "right" })?.direction).toBe(
      "right",
    );
    expect(getFillRange(source, { row: 4, column: 5 })).toBeNull();
    expect(getFillRange(source, { row: 2, column: 5 }, { direction: "down" })?.direction).toBe(
      "up",
    );
  });

  test("locks an axis, not a direction, so a drag can cross back over its source", () => {
    expect(getFillRange(source, { row: 1, column: 9 }, { axis: "rows" })?.direction).toBe("up");
    expect(getFillRange(source, { row: 9, column: 9 }, { axis: "rows" })?.direction).toBe("down");
  });

  test("clamps destinations to the supplied sheet bounds", () => {
    expect(
      getFillRange(source, { row: 99, column: 99 }, { bounds: { rowCount: 7, columnCount: 8 } }),
    ).toMatchObject({
      direction: "down",
      target: { start: { row: 5, column: 4 }, end: { row: 6, column: 5 } },
    });
  });

  test("rejects invalid bounds, addresses and source ranges instead of creating invalid targets", () => {
    expect(getFillRange(source, { row: Number.NaN, column: 1 })).toBeNull();
    expect(getFillRange(source, { row: 1.5, column: 1 })).toBeNull();
    expect(
      getFillRange(
        { start: { row: -1, column: 0 }, end: { row: 2, column: 1 } },
        { row: 4, column: 1 },
      ),
    ).toBeNull();
    expect(
      getFillRange(source, { row: 4, column: 1 }, { bounds: { rowCount: 0, columnCount: 2 } }),
    ).toBeNull();
    expect(
      getFillRange(source, { row: 4, column: 1 }, { bounds: { rowCount: 4, columnCount: 8 } }),
    ).toBeNull();
  });

  test("double click uses a left contiguous neighbor before the right neighbor", () => {
    const values = new Set(["5:3", "6:3", "7:3", "5:6", "6:6", "7:6", "8:6"]);
    expect(
      getDoubleClickFillRange(source, {
        rowCount: 100,
        columnCount: 10,
        hasValue: ({ row, column }) => values.has(`${row}:${column}`),
      }),
    ).toMatchObject({
      direction: "down",
      target: { start: { row: 5, column: 4 }, end: { row: 7, column: 5 } },
    });
  });

  test("double click falls back right, stops at the first blank and honors row guards", () => {
    const values = new Set(["5:6", "6:6", "8:6"]);
    expect(
      getDoubleClickFillRange(source, {
        rowCount: 20,
        columnCount: 10,
        hasValue: ({ row, column }) => values.has(`${row}:${column}`),
      }),
    ).toMatchObject({
      target: { start: { row: 5, column: 4 }, end: { row: 6, column: 5 } },
    });
    expect(
      getDoubleClickFillRange(source, {
        rowCount: 20,
        columnCount: 10,
        hasValue: ({ row, column }) => values.has(`${row}:${column}`),
        isRowFillable: (row) => row !== 6,
      }),
    ).toMatchObject({
      target: { start: { row: 5, column: 4 }, end: { row: 5, column: 5 } },
    });
  });

  test("double click does nothing without a neighboring run", () => {
    expect(
      getDoubleClickFillRange(source, {
        rowCount: 20,
        columnCount: 10,
        hasValue: () => false,
      }),
    ).toBeNull();
  });
});
