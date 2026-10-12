import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator, type Sheet } from "@sheetcraft/core/workbook";
import {
  normalizeSheetDrawing,
  type SheetFramedGraphicDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import * as bodyPaint from "../../../modules/sheet-drawings/shape-detailed-paint";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { resolveShapeDrawing } from "../../../modules/sheet-drawings/resolved-shape-drawing";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import { getPrintPictureAssetIds } from "../../../modules/page-layout/page-print-pictures";
import {
  createPrintShapeMetrics,
  getPrintableShapeRoots,
  getPrintShapeContentExtent,
  paintPrintShapes,
  preparePrintShapeFonts,
} from "../../../modules/page-layout/page-print-shapes";

function framed(
  id = "shape",
  changes: Partial<SheetFramedGraphicDrawing> = {},
): SheetFramedGraphicDrawing {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, "shape", "Shape", { row: 0, column: 0 });
  return normalizeSheetDrawing({
    ...appearance,
    kind: "shape",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 120, y: 80, size: { width: 100, height: 60 } },
    },
    ...changes,
  }) as SheetFramedGraphicDrawing;
}
function fixture(drawings: Sheet["drawings"]) {
  const sheet = createSheet("Print shapes", "sheet");
  sheet.drawings = drawings;
  const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
  return { sheet, metrics };
}
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
function paint(
  sheet: Sheet,
  metrics: ReturnType<typeof createPrintShapeMetrics>,
  target = context(),
  viewport = { x: 20, y: 30, width: 400, height: 300 },
) {
  paintPrintShapes(target, {
    sheet,
    metrics,
    viewport,
    images: createCanvasImageCache(() => {}),
    density: 2,
  });
  return target;
}
function readyBody(
  source: SheetGraphicDrawing,
  canvas = { width: 240, height: 160 } as HTMLCanvasElement,
) {
  const plan = bodyPaint.planShapeDetailedPaint({
    drawing: source,
    geometry: getDrawingShapeGeometry(source)!,
    density: 2,
  });
  return {
    ...plan,
    kind: "ready" as const,
    canvas,
    actualDensity: 2,
    logicalBounds: { left: -10, top: -10, right: 110, bottom: 70 },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("genuine print shape consumer", () => {
  test("consumes the exact prepared body pixels with local origin/density, rotation and body flip", () => {
    const source = framed("rotated", { rotation: 37, shapeFlipX: true, shapeFlipY: true });
    const { sheet, metrics } = fixture([source]);
    const view = resolveShapeDrawing(source, metrics).view as SheetGraphicDrawing;
    const result = readyBody(view);
    const prepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockReturnValue(result);
    const before = JSON.stringify(source),
      target = paint(sheet, metrics);
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIdentity: source,
        drawing: expect.objectContaining({ width: 100, height: 60, rotation: 37 }),
      }),
    );
    expect(vi.mocked(target.drawImage)).toHaveBeenCalledExactlyOnceWith(
      result.canvas,
      -10,
      -10,
      120,
      80,
    );
    expect(target.translate).toHaveBeenCalledWith(150, 80);
    expect(target.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(target.scale).toHaveBeenCalledWith(-1, -1);
    expect(target.rect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(target.clip).toHaveBeenCalledOnce();
    expect(JSON.stringify(source)).toBe(before);
    expect(Object.hasOwn(source, "anchor")).toBe(false);
  });

  test("glyph pixels use an independent readable layer, genuine glyph preparation and disposal", () => {
    const source = framed("text", { text: "Native glyphs", shapeFlipX: true, shapeFlipY: true });
    const { sheet, metrics } = fixture([source]);
    const view = resolveShapeDrawing(source, metrics).view as SheetGraphicDrawing;
    const body = readyBody(view);
    vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockReturnValue(body);
    const layout = { runs: [] } as unknown as ReturnType<typeof textRuntime.layoutDrawingShapeText>;
    vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue(layout);
    const glyphCanvas = { width: 80, height: 40 } as HTMLCanvasElement,
      dispose = vi.fn();
    const glyph = {
      ...body,
      canvas: glyphCanvas,
      dispose,
      logicalBounds: { left: 9, top: 11, right: 49, bottom: 31 },
    } as unknown as Extract<ReturnType<typeof textPaint.prepareShapeTextPaint>, { kind: "ready" }>;
    vi.spyOn(textPaint, "planShapeTextPaint").mockReturnValue(glyph);
    const prepare = vi.spyOn(textPaint, "prepareShapeTextPaint").mockReturnValue(glyph);
    const target = paint(sheet, metrics);
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({ sourceIdentity: source, layout }),
    );
    expect(vi.mocked(target.drawImage).mock.calls).toEqual([
      [body.canvas, -10, -10, 120, 80],
      [glyphCanvas, 9, 11, 40, 20],
    ]);
    expect(target.scale).toHaveBeenCalledExactlyOnceWith(-1, -1);
    expect(dispose).toHaveBeenCalledOnce();
  });

  test("sheet order stays intact across legacy and canonical shapes without migrating legacy owners", () => {
    const legacy = createGraphicDrawing("legacy", "shape", "Legacy", { row: 1, column: 1 });
    delete legacy.shapeGeometry;
    delete legacy.shapeText;
    const source = framed("framed"),
      { sheet, metrics } = fixture([legacy, source]);
    const first = { width: 240, height: 160 } as HTMLCanvasElement,
      second = { width: 240, height: 160 } as HTMLCanvasElement;
    const prepare = vi
      .spyOn(bodyPaint, "prepareShapeDetailedPaint")
      .mockImplementation((options) => ({
        ...readyBody({ ...options.drawing, shapeGeometry: { preset: "rect" } }),
        canvas: options.sourceIdentity === legacy ? first : second,
      }));
    const before = JSON.stringify(legacy),
      target = paint(sheet, metrics);
    expect(getPrintableShapeRoots(sheet)).toEqual([legacy, source]);
    expect(prepare.mock.calls[0]?.[0].drawing).toBe(legacy);
    expect(vi.mocked(target.drawImage).mock.calls.map(([canvas]) => canvas)).toEqual([
      first,
      second,
    ]);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(Object.hasOwn(legacy, "shapeFrame")).toBe(false);
    expect(sheet.drawings?.[0]).toBe(legacy);
  });

  test("print=false and hidden-row collapsed shapes require neither assets nor font readiness", async () => {
    const ignored = framed("not-printed", {
      shapeProperties: { printObject: false },
      text: "Missing",
      shapeText: {
        ...createGraphicDrawing("x", "shape", "", { row: 0, column: 0 }).shapeText!,
        fontFamily: "Noto Sans",
      },
    });
    const collapsed = framed("collapsed", {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 1, offset: 0 } },
          end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
        },
      },
    });
    const { sheet } = fixture([ignored, collapsed]);
    sheet.hiddenRows = new Set([1]);
    const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
    const prepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint"),
      fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
    expect(resolveShapeDrawing(collapsed, metrics).collapsed).toBe(true);
    paint(sheet, metrics);
    await preparePrintShapeFonts(sheet, metrics);
    expect(prepare).not.toHaveBeenCalled();
    expect(fonts).not.toHaveBeenCalled();
    expect(getPrintPictureAssetIds(sheet).size).toBe(0);
  });

  test("missing real font fails explicitly even when its shape is outside the current page clip", () => {
    const source = framed("missing-font", {
      text: "No fallback",
      shapeText: {
        ...createGraphicDrawing("x", "shape", "", { row: 0, column: 0 }).shapeText!,
        fontFamily: "Noto Sans",
      },
    });
    const { sheet, metrics } = fixture([source]),
      target = context();
    expect(() =>
      paint(sheet, metrics, target, { x: 1000, y: 1000, width: 100, height: 100 }),
    ).toThrow(/missing-font.*font resource Noto Sans is idle/);
    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.restore).toHaveBeenCalledOnce();
  });

  test("missing texture and failed prepared pixel surfaces never silently print blank", () => {
    const source = framed("texture", {
      shapeStyle: {
        fill: {
          kind: "value",
          value: {
            kind: "picture",
            assetId: "paint",
            opacity: 1,
            rotateWithShape: true,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          },
        },
      },
    });
    const { sheet, metrics } = fixture([source]);
    expect(() => paint(sheet, metrics)).toThrow(/texture.*resources are unavailable/);
    expect([...getPrintPictureAssetIds(sheet)]).toEqual(["paint"]);
    const plain = framed("zero-surface"),
      other = fixture([plain]),
      view = resolveShapeDrawing(plain, other.metrics).view as SheetGraphicDrawing;
    vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockReturnValue(
      readyBody(view, { width: 0, height: 0 } as HTMLCanvasElement),
    );
    expect(() => paint(other.sheet, other.metrics)).toThrow(
      /zero-surface.*pixel surface is unavailable/,
    );
  });

  test("real body tails and rotated fixed geometry create pages in an otherwise empty document", () => {
    const source = framed("shape-only", {
      shapeGeometry: { preset: "wedgeRectCallout" },
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 80, y: 850, size: { width: 240, height: 120 } },
      },
    });
    const { sheet, metrics } = fixture([source]);
    const extent = getPrintShapeContentExtent(sheet, metrics);
    expect(metrics.rows.visiblePrefix(extent.rowCount)).toBeGreaterThan(970);
    const preview = createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) });
    expect(preview.geometry.rowCount).toBe(extent.rowCount);
    expect(preview.pages.length).toBeGreaterThan(1);
    source.shapeProperties = { printObject: false };
    expect(
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }).pages,
    ).toHaveLength(1);
  });

  test("hidden geometry keeps a move-only frame anchored in continuous sheet space", () => {
    const source = framed("moving", {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-only",
          origin: { column: { index: 2, offset: 10 }, row: { index: 2, offset: 5 } },
          size: { width: 100, height: 60 },
        },
      },
    });
    const { sheet } = fixture([source]);
    sheet.columnWidths = new Map([
      [0, 80],
      [1, 100],
      [2, 60],
    ]);
    sheet.rowHeights = new Map([
      [0, 20],
      [1, 30],
      [2, 40],
    ]);
    sheet.hiddenRows = new Set([1]);
    sheet.hiddenColumns = new Set([1]);
    const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
    expect(resolveShapeDrawing(source, metrics).rect).toEqual({
      x: 90,
      y: 25,
      width: 100,
      height: 60,
    });
    const view = resolveShapeDrawing(source, metrics).view as SheetGraphicDrawing;
    vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockReturnValue(readyBody(view));
    const target = paint(sheet, metrics);
    expect(target.translate).toHaveBeenCalledWith(120, 25);
  });

  test("far-sheet frame extent inverts sparse axis prefixes with logarithmic reads", () => {
    const source = framed("far", {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-only",
          origin: { column: { index: 12000, offset: 0 }, row: { index: 800000, offset: 0 } },
          size: { width: 100, height: 60 },
        },
      },
    });
    const { sheet, metrics } = fixture([source]);
    const rows = vi.spyOn(metrics.rows, "visiblePrefix"),
      columns = vi.spyOn(metrics.columns, "visiblePrefix");
    const extent = getPrintShapeContentExtent(sheet, metrics);
    expect(extent.rowCount).toBeGreaterThan(800000);
    expect(extent.columnCount).toBeGreaterThan(12000);
    expect(rows.mock.calls.length).toBeLessThan(40);
    expect(columns.mock.calls.length).toBeLessThan(40);
  });

  test("a positive subpixel move-and-size frame retains real geometry and reaches the pixel consumer", () => {
    const source = framed("subpixel", {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
          end: { column: { index: 0, offset: 0.5 }, row: { index: 0, offset: 0.25 } },
        },
      },
    });
    const { sheet, metrics } = fixture([source]);
    const resolved = resolveShapeDrawing(source, metrics),
      view = resolved.view as SheetGraphicDrawing;
    expect(resolved.collapsed).toBe(false);
    const geometry = getDrawingShapeGeometry(view)!;
    expect([geometry.width, geometry.height]).toEqual([0.5, 0.25]);
    const plan = bodyPaint.planShapeDetailedPaint({ drawing: view, geometry, density: 2 });
    const canvas = { width: 1, height: 1 } as HTMLCanvasElement;
    const prepare = vi
      .spyOn(bodyPaint, "prepareShapeDetailedPaint")
      .mockReturnValue({ ...plan, kind: "ready", canvas });
    const target = paint(sheet, metrics, context(), { x: 0, y: 0, width: 10, height: 10 });
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        geometry,
        drawing: expect.objectContaining({ width: 0.5, height: 0.25 }),
      }),
    );
    expect(target.drawImage).toHaveBeenCalledWith(
      canvas,
      plan.logicalBounds.left,
      plan.logicalBounds.top,
      1 / plan.actualDensity,
      1 / plan.actualDensity,
    );
  });

  test("body and glyph texture resources are gathered only for printable noncollapsed owners", () => {
    const picture = (assetId: string) => ({
      kind: "picture" as const,
      assetId,
      opacity: 1,
      rotateWithShape: true,
      layout: {
        kind: "stretch" as const,
        offsetXRatio: 0,
        offsetYRatio: 0,
        widthRatio: 1,
        heightRatio: 1,
      },
    });
    const source = framed("textures", {
      shapeStyle: { fill: { kind: "value", value: picture("body-paint") } },
      shapeText: {
        ...createGraphicDrawing("x", "shape", "", { row: 0, column: 0 }).shapeText!,
        style: { fill: { kind: "value", value: picture("glyph-paint") } },
      },
    });
    const collapsed = framed("collapsed-textures", {
      shapeStyle: { fill: { kind: "value", value: picture("unused") } },
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 1, offset: 0 } },
          end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
        },
      },
    });
    const { sheet } = fixture([source, collapsed]);
    sheet.hiddenRows = new Set([1]);
    expect([...getPrintPictureAssetIds(sheet)]).toEqual(["body-paint", "glyph-paint"]);
    source.shapeProperties = { printObject: false };
    expect([...getPrintPictureAssetIds(sheet)]).toEqual([]);
  });

  test("ready native glyph overflow bounds expand shape-only pagination without changing placement", () => {
    const source = framed("glyph-overflow", { text: "Overflow" }),
      { sheet, metrics } = fixture([source]);
    const view = resolveShapeDrawing(source, metrics).view as SheetGraphicDrawing;
    const layout = { runs: [] } as unknown as ReturnType<typeof textRuntime.layoutDrawingShapeText>;
    vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue(layout);
    const textPlan = {
      ...readyBody(view),
      logicalBounds: { left: 10, top: 10, right: 100, bottom: 1600 },
    } as unknown as ReturnType<typeof textPaint.planShapeTextPaint>;
    vi.spyOn(textPaint, "planShapeTextPaint").mockReturnValue(textPlan);
    const before = JSON.stringify(source);
    const preview = createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) });
    expect(preview.rows.getTotalHeight()).toBeGreaterThanOrEqual(1680);
    expect(preview.pages.length).toBeGreaterThan(1);
    expect(JSON.stringify(source)).toBe(before);
  });
});

test("model-stage groups cannot silently disappear from print output", () => {
  const leaf = framed(),
    { shapeFrame, ...appearance } = leaf;
  const { sheet } = fixture([
    {
      kind: "shapeGroup",
      id: "g",
      name: "Group",
      rotation: 0,
      shapeFrame,
      members: [
        {
          ...appearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
        },
      ],
    },
  ]);
  expect(() => getPrintableShapeRoots(sheet)).toThrow(/group printing is not yet enabled/);
});
