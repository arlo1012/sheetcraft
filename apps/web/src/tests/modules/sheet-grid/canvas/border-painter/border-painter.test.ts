import { describe, expect, test, vi } from "vitest";
import { createSheet, setCellStyle } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import {
  createBorderPaintPlan,
  paintSheetBorders,
} from "../../../../../modules/sheet-grid/canvas/border-painter";

function createContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("border painter", () => {
  test("paints existing border presentations and junctions inside each frozen pane", () => {
    const sheet = createSheet("Sheet1", "border-painter");
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderTop: { style: "double", color: "#112233" },
        borderRight: { style: "mediumDashed", color: "#445566" },
        borderDiagonalDown: { style: "thin", color: "#778899" },
      },
    );
    const geometry = createSheetGeometry({
      rowCount: 4,
      columnCount: 4,
      rowHeight: 20,
      columnWidth: 40,
    });
    const rows = createRowVisibilityIndex({ rowCount: 4, defaultRowHeight: 20 });
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      freeze: { rows: 1, columns: 1 },
      viewportSize: { width: 120, height: 80 },
    });
    const context = createContext();

    const plan = createBorderPaintPlan(sheet, geometry, layout, rows);
    paintSheetBorders(context, plan, layout);

    expect(plan.panes.map((pane) => pane.id)).toEqual(["topLeft", "top", "left", "body"]);
    expect(context.setLineDash).toHaveBeenCalledWith([8, 4]);
    expect(context.fillRect).toHaveBeenCalled();
    expect(context.rect).toHaveBeenCalledWith(0, 0, 40, 20);
  });

  test("translates a reusable plan by the scroll delta without resolving borders again", () => {
    const sheet = createSheet("Sheet1", "border-scroll");
    setCellStyle(
      sheet,
      { row: 2, column: 2 },
      {
        borderTop: { style: "thin", color: "#112233" },
      },
    );
    const geometry = createSheetGeometry({
      rowCount: 20,
      columnCount: 20,
      rowHeight: 20,
      columnWidth: 40,
    });
    const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 20 });
    const initialLayout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 80, height: 60 },
      bodyScrollPosition: { x: 80, y: 40 },
    });
    const scrolledLayout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 80, height: 60 },
      bodyScrollPosition: { x: 100, y: 50 },
    });
    const context = createContext();

    paintSheetBorders(
      context,
      createBorderPaintPlan(sheet, geometry, initialLayout, rows),
      scrolledLayout,
    );

    expect(context.translate).toHaveBeenCalledWith(-20, -10);
  });

  test("uses the display style resolver for conditional borders without persisting them", () => {
    const sheet = createSheet("Sheet1", "effective-border");
    const geometry = createSheetGeometry({
      rowCount: 2,
      columnCount: 2,
      rowHeight: 20,
      columnWidth: 40,
    });
    const rows = createRowVisibilityIndex({ rowCount: 2, defaultRowHeight: 20 });
    const layout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 80, height: 40 },
    });
    const plan = createBorderPaintPlan(sheet, geometry, layout, rows, (address) =>
      address.row === 0 && address.column === 0
        ? { borderBottom: { style: "medium", color: "#7f6000" } }
        : undefined,
    );

    expect(sheet.cells.get("0:0")?.style?.borderBottom).toBeUndefined();
    expect(plan.panes[0]?.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: "#7f6000", thickness: 2 })]),
    );
  });
});
