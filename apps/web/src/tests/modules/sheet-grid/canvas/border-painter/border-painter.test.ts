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
    getTransform: vi.fn(() => ({ a: 1, d: 1, e: 0, f: 0 })),
  } as unknown as CanvasRenderingContext2D;
}

function createFractionalTransformContext() {
  const transform = { a: 1.25, d: 1.25, e: 0.375, f: 0.625 };
  let lineWidth = 1;
  let path: { x1?: number; y1?: number; x2?: number; y2?: number } = {};
  const strokes: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    lineWidth: number;
  }[] = [];
  const fills: { x: number; y: number; width: number; height: number }[] = [];
  const clips: {
    x: number;
    y: number;
    width: number;
    height: number;
    transform: typeof transform;
  }[] = [];
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => {
      path = {};
    }),
    rect: vi.fn((x: number, y: number, width: number, height: number) => {
      clips.push({ x, y, width, height, transform: { ...transform } });
    }),
    clip: vi.fn(),
    translate: vi.fn((x: number, y: number) => {
      transform.e += x * transform.a;
      transform.f += y * transform.d;
    }),
    moveTo: vi.fn((x: number, y: number) => {
      path.x1 = x;
      path.y1 = y;
    }),
    lineTo: vi.fn((x: number, y: number) => {
      path.x2 = x;
      path.y2 = y;
    }),
    stroke: vi.fn(() => {
      strokes.push({
        x1: path.x1!,
        y1: path.y1!,
        x2: path.x2!,
        y2: path.y2!,
        lineWidth,
      });
    }),
    setLineDash: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      fills.push({ x, y, width, height });
    }),
    getTransform: vi.fn(() => ({ ...transform })),
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(value: number) {
      lineWidth = value;
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, strokes, fills, clips, transform };
}

function expectInteger(value: number): void {
  expect(value).toBeCloseTo(Math.round(value), 8);
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

  test("aligns orthogonal border and junction edges to backing pixels with fractional density", () => {
    const sheet = createSheet("Sheet1", "fractional-pixels");
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderTop: { style: "thin", color: "#112233" },
        borderLeft: { style: "medium", color: "#112233" },
      },
    );
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
    const scrolledLayout = createSheetViewportLayout({
      geometry,
      rows,
      viewportSize: { width: 80, height: 40 },
      bodyScrollPosition: { x: 10, y: 5 },
    });
    const { context, strokes, fills, clips, transform } = createFractionalTransformContext();

    paintSheetBorders(
      context,
      createBorderPaintPlan(sheet, geometry, layout, rows),
      scrolledLayout,
    );

    expect(strokes).not.toHaveLength(0);
    for (const stroke of strokes) {
      if (stroke.y1 === stroke.y2) {
        expectInteger(stroke.x1 * transform.a + transform.e);
        expectInteger(stroke.x2 * transform.a + transform.e);
        expectInteger((stroke.y1 - stroke.lineWidth / 2) * transform.d + transform.f);
        expectInteger((stroke.y1 + stroke.lineWidth / 2) * transform.d + transform.f);
      } else if (stroke.x1 === stroke.x2) {
        expectInteger(stroke.y1 * transform.d + transform.f);
        expectInteger(stroke.y2 * transform.d + transform.f);
        expectInteger((stroke.x1 - stroke.lineWidth / 2) * transform.a + transform.e);
        expectInteger((stroke.x1 + stroke.lineWidth / 2) * transform.a + transform.e);
      }
    }
    expect(fills).not.toHaveLength(0);
    for (const fill of fills) {
      expectInteger(fill.x * transform.a + transform.e);
      expectInteger((fill.x + fill.width) * transform.a + transform.e);
      expectInteger(fill.y * transform.d + transform.f);
      expectInteger((fill.y + fill.height) * transform.d + transform.f);
    }
    expect(clips).not.toHaveLength(0);
    for (const clip of clips) {
      expectInteger(clip.x * clip.transform.a + clip.transform.e);
      expectInteger((clip.x + clip.width) * clip.transform.a + clip.transform.e);
      expectInteger(clip.y * clip.transform.d + clip.transform.f);
      expectInteger((clip.y + clip.height) * clip.transform.d + clip.transform.f);
    }
  });
});
