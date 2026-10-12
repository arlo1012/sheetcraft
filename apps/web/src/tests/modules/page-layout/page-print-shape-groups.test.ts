import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator, type Sheet } from "@sheetcraft/core/workbook";
import type {
  ShapeGroupDrawing,
  ShapeGroupedGroup,
  ShapeGroupLocalFrame,
  SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import * as bodyPaint from "../../../modules/sheet-drawings/shape-detailed-paint";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import {
  getDrawingShapeGeometry,
  getStandardShapeGeometry,
} from "../../../modules/sheet-drawings/shape-geometry";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { getPrintPictureAssetIds } from "../../../modules/page-layout/page-print-pictures";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import {
  createPrintShapeMetrics,
  getPrintableShapeLeaves,
  getPrintableShapeRoots,
  getPrintShapeContentExtent,
  paintPrintShapes,
  preparePrintShapeFonts,
  ShapePrintError,
} from "../../../modules/page-layout/page-print-shapes";

function local(xRatio = 0, yRatio = 0, widthRatio = 1, heightRatio = 1): ShapeGroupLocalFrame {
  return { kind: "shape-group-local-v1", rect: { xRatio, yRatio, widthRatio, heightRatio } };
}
function leaf(
  id: string,
  changes: Partial<SheetGroupedGraphicDrawing> = {},
): SheetGroupedGraphicDrawing {
  const {
    anchor: _a,
    offsetX: _x,
    offsetY: _y,
    width: _w,
    height: _h,
    ...appearance
  } = createGraphicDrawing(id, changes.kind ?? "shape", id, { row: 0, column: 0 });
  return { ...appearance, kind: "shape", groupFrame: local(), ...changes };
}
function root(
  members: ShapeGroupDrawing["members"],
  changes: Partial<ShapeGroupDrawing> = {},
): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id: "root",
    name: "Group",
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 120, y: 80, size: { width: 200, height: 100 } },
    },
    members,
    ...changes,
  };
}
function fixture(drawings: Sheet["drawings"]) {
  const sheet = createSheet("Print groups", "sheet");
  sheet.drawings = drawings;
  return { sheet, metrics: createPrintShapeMetrics(sheet, createSheetEvaluator(sheet)) };
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
  viewport = { x: 0, y: 0, width: 1000, height: 1000 },
) {
  const target = context();
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
  drawing: SheetGraphicDrawing,
  canvas = { width: 40, height: 20 } as HTMLCanvasElement,
) {
  return {
    ...bodyPaint.planShapeDetailedPaint({
      drawing,
      geometry:
        getDrawingShapeGeometry(drawing) ??
        getStandardShapeGeometry({ preset: "rect" }, drawing.width, drawing.height)!,
      density: 2,
    }),
    kind: "ready" as const,
    canvas,
    actualDensity: 2,
  };
}
function readyGlyph(drawing: SheetGraphicDrawing, dispose = vi.fn()) {
  return {
    ...readyBody(drawing),
    canvas: { width: 24, height: 12 } as HTMLCanvasElement,
    logicalBounds: { left: 3, top: 5, right: 15, bottom: 11 },
    dispose,
  } as unknown as Extract<ReturnType<typeof textPaint.prepareShapeTextPaint>, { kind: "ready" }>;
}
function worldPoint(rect: ShapeFrameRect, angle: number, x: number, y: number) {
  const radians = (angle * Math.PI) / 180,
    dx = x - rect.width / 2,
    dy = y - rect.height / 2;
  return {
    x: rect.x + rect.width / 2 + Math.cos(radians) * dx - Math.sin(radians) * dy,
    y: rect.y + rect.height / 2 + Math.sin(radians) * dx + Math.cos(radians) * dy,
  };
}
function childRect(rect: ShapeFrameRect, angle: number, frame: ShapeGroupLocalFrame) {
  const { xRatio, yRatio, widthRatio, heightRatio } = frame.rect;
  const width = rect.width * widthRatio,
    height = rect.height * heightRatio;
  const center = worldPoint(
    rect,
    angle,
    rect.width * xRatio + width / 2,
    rect.height * yRatio + height / 2,
  );
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}
function extentCount(
  position: number,
  metrics: ReturnType<typeof createPrintShapeMetrics>["rows"],
) {
  let index = 0;
  while (metrics.visiblePrefix(index) < position) index++;
  return index;
}
function texture(assetId: string) {
  return {
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
  };
}
afterEach(() => vi.restoreAllMocks());

describe("genuine owned shape-group printing", () => {
  test("nested 37-degree and relative rotations retain orthogonal dimensions after nonuniform resize", () => {
    const child = leaf("nested-leaf", { groupFrame: local(0.25, 0.2, 0.5, 0.8), rotation: -9 });
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 13,
      groupFrame: local(0.1, 0.3, 0.7, 0.25),
      members: [child],
    };
    const group = root([nested]);
    const before = JSON.stringify(group),
      first = fixture([group]);
    const [resolved] = [...getPrintableShapeLeaves(first.sheet, first.metrics)];
    const nestedRect = childRect({ x: 120, y: 80, width: 200, height: 100 }, 37, nested.groupFrame);
    const expected = childRect(nestedRect, 50, child.groupFrame);
    expect(resolved!.drawing.rotation).toBe(41);
    expect(resolved!.rect.x).toBeCloseTo(expected.x, 10);
    expect(resolved!.rect.y).toBeCloseTo(expected.y, 10);
    expect([resolved!.drawing.width, resolved!.drawing.height]).toEqual([70, 20]);
    expect(resolved!.sourceRoot).toBe(group);
    expect(resolved!.sourceNode).toBe(child);
    expect(resolved!.path).toEqual(["root", "nested", "nested-leaf"]);
    expect(Object.hasOwn(resolved!.drawing, "groupFrame")).toBe(false);
    expect(Object.hasOwn(resolved!.drawing, "shapeProperties")).toBe(false);
    const resized = root([nested], {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 120, y: 80, size: { width: 400, height: 50 } },
      },
    });
    const second = fixture([resized]),
      [other] = [...getPrintableShapeLeaves(second.sheet, second.metrics)];
    expect([other!.drawing.width, other!.drawing.height, other!.drawing.rotation]).toEqual([
      140, 10, 41,
    ]);
    expect(other!.sourceIdentity).not.toBe(resolved!.sourceIdentity);
    expect(JSON.stringify(group)).toBe(before);
  });

  test("real bodies and native glyph layers follow sheet/DFS order with stable root-and-node cache identities", async () => {
    const a = leaf("a", {
      text: "First",
      shapeProperties: { printObject: false },
      shapeFlipX: true,
    });
    const b = leaf("b", { kind: "textBox", text: "Second", rotation: -9 });
    const c = leaf("c");
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 13,
      groupFrame: local(0.1, 0.3, 0.7, 0.25),
      shapeProperties: { printObject: false },
      members: [b],
    };
    const group = root([a, nested, c], { shapeProperties: { locked: false } });
    const before = createGraphicDrawing("before", "shape", "", { row: 0, column: 0 });
    const after = createGraphicDrawing("after", "shape", "", { row: 0, column: 0 });
    const { sheet, metrics } = fixture([before, group, after]),
      snapshot = JSON.stringify(group);
    const leaves = [...getPrintableShapeLeaves(sheet, metrics)];
    expect(getPrintableShapeRoots(sheet)).toEqual([before, group, after]);
    expect(leaves.map(({ drawing }) => drawing.id)).toEqual(["before", "a", "b", "c", "after"]);
    const fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont").mockResolvedValue(undefined);
    await preparePrintShapeFonts(sheet, metrics);
    expect(fonts.mock.calls.map(([drawing]) => drawing.id)).toEqual(["a", "b"]);
    const layout = { runs: [] } as unknown as ReturnType<typeof textRuntime.layoutDrawingShapeText>;
    vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue(layout);
    const bodies = new Map(leaves.map(({ drawing }) => [drawing.id, readyBody(drawing)]));
    const glyphs = new Map(
      leaves
        .filter(({ drawing }) => drawing.text)
        .map(({ drawing }) => [drawing.id, readyGlyph(drawing)]),
    );
    const prepareBody = vi
      .spyOn(bodyPaint, "prepareShapeDetailedPaint")
      .mockImplementation(({ drawing }) => bodies.get(drawing.id)!);
    vi.spyOn(textPaint, "planShapeTextPaint").mockImplementation(({ drawing }) =>
      glyphs.get(drawing.id)!,
    );
    const prepareText = vi
      .spyOn(textPaint, "prepareShapeTextPaint")
      .mockImplementation(({ drawing }) => glyphs.get(drawing.id)!);
    const target = paint(sheet, metrics);
    expect(prepareBody.mock.calls.map(([options]) => options.drawing.id)).toEqual([
      "before",
      "a",
      "b",
      "c",
      "after",
    ]);
    expect(vi.mocked(target.drawImage).mock.calls.map(([canvas]) => canvas)).toEqual([
      bodies.get("before")!.canvas,
      bodies.get("a")!.canvas,
      glyphs.get("a")!.canvas,
      bodies.get("b")!.canvas,
      glyphs.get("b")!.canvas,
      bodies.get("c")!.canvas,
      bodies.get("after")!.canvas,
    ]);
    for (const [index, { sourceIdentity, drawing, rect }] of leaves.entries()) {
      const options = prepareBody.mock.calls[index]![0];
      expect(options.sourceIdentity).toBe(sourceIdentity);
      expect(options.geometry).toEqual(
        getDrawingShapeGeometry(drawing) ??
          getStandardShapeGeometry({ preset: "rect" }, drawing.width, drawing.height),
      );
      expect(target.translate).toHaveBeenCalledWith(
        rect.x + drawing.width / 2,
        rect.y + drawing.height / 2,
      );
      expect(target.rotate).toHaveBeenCalledWith((drawing.rotation * Math.PI) / 180);
    }
    for (const [options] of prepareText.mock.calls) {
      expect(options.sourceIdentity).toBe(
        leaves.find(({ drawing }) => drawing.id === options.drawing.id)!.sourceIdentity,
      );
      expect(glyphs.get(options.drawing.id)!.dispose).toHaveBeenCalledOnce();
    }
    expect(target.scale).toHaveBeenCalledWith(-1, 1);
    const again = [...getPrintableShapeLeaves(sheet, metrics)];
    for (const [index, resolved] of again.entries())
      expect(resolved.sourceIdentity).toBe(leaves[index]!.sourceIdentity);
    expect(new Set(leaves.map(({ sourceIdentity }) => sourceIdentity)).size).toBe(5);
    expect(JSON.stringify(group)).toBe(snapshot);
    expect(sheet.drawings).toEqual([before, group, after]);
  });

  test("every leaf body and ready glyph/effect overflow uses its composed world rectangle for extent", () => {
    const child = leaf("overflow", {
      text: "Overflow",
      rotation: 13,
      groupFrame: local(0.2, 0.3, 0.5, 0.4),
    });
    const group = root([child]),
      { sheet, metrics } = fixture([group]);
    const [resolved] = [...getPrintableShapeLeaves(sheet, metrics)];
    const body = readyBody(resolved!.drawing);
    const bodyBounds = { left: -50, top: -70, right: 180, bottom: 80 };
    vi.spyOn(bodyPaint, "planShapeDetailedPaint").mockReturnValue({
      ...body,
      logicalBounds: bodyBounds,
    });
    vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue({
      runs: [],
    } as unknown as ReturnType<typeof textRuntime.layoutDrawingShapeText>);
    const glyphBounds = { left: -20, top: -30, right: 2000, bottom: 1600 };
    vi.spyOn(textPaint, "planShapeTextPaint").mockReturnValue({
      ...readyGlyph(resolved!.drawing),
      logicalBounds: glyphBounds,
    });
    const points = [bodyBounds, glyphBounds].flatMap((bounds) => [
      worldPoint(resolved!.rect, 50, bounds.left, bounds.top),
      worldPoint(resolved!.rect, 50, bounds.right, bounds.top),
      worldPoint(resolved!.rect, 50, bounds.right, bounds.bottom),
      worldPoint(resolved!.rect, 50, bounds.left, bounds.bottom),
    ]);
    expect(getPrintShapeContentExtent(sheet, metrics)).toEqual({
      rowCount: extentCount(Math.max(...points.map((point) => point.y)), metrics.rows),
      columnCount: extentCount(Math.max(...points.map((point) => point.x)), metrics.columns),
    });
    expect(
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }).pages.length,
    ).toBeGreaterThan(1);
  });

  test("root print=false skips all descendants, assets, fonts and page extent", async () => {
    const child = leaf("far-texture", {
      text: "Unavailable font",
      shapeStyle: { fill: { kind: "value", value: texture("body") } },
      shapeText: {
        ...leaf("defaults").shapeText!,
        fontFamily: "Noto Sans",
        style: { fill: { kind: "value", value: texture("glyph") } },
      },
    });
    const group = root([child], {
      shapeProperties: { printObject: false },
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 10000, y: 10000, size: { width: 200, height: 100 } },
      },
    });
    const { sheet, metrics } = fixture([group]);
    const bodyPlan = vi.spyOn(bodyPaint, "planShapeDetailedPaint"),
      bodyPrepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint"),
      fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
    expect(getPrintableShapeRoots(sheet)).toEqual([]);
    expect([...getPrintableShapeLeaves(sheet, metrics)]).toEqual([]);
    expect(getPrintShapeContentExtent(sheet, metrics)).toEqual({ rowCount: 0, columnCount: 0 });
    expect([...getPrintPictureAssetIds(sheet, metrics)]).toEqual([]);
    await preparePrintShapeFonts(sheet, metrics);
    expect(paint(sheet, metrics).drawImage).not.toHaveBeenCalled();
    expect(bodyPlan).not.toHaveBeenCalled();
    expect(bodyPrepare).not.toHaveBeenCalled();
    expect(fonts).not.toHaveBeenCalled();
    expect(
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }).pages,
    ).toHaveLength(1);
  });

  test("group body and glyph textures belong to printed leaves even when private leaf print=false", () => {
    const child = leaf("texture", {
      shapeProperties: { printObject: false },
      shapeStyle: { fill: { kind: "value", value: texture("body") } },
      shapeText: {
        ...leaf("defaults").shapeText!,
        style: { fill: { kind: "value", value: texture("glyph") } },
      },
    });
    const { sheet, metrics } = fixture([root([child])]);
    expect([...getPrintPictureAssetIds(sheet, metrics)]).toEqual(["body", "glyph"]);
    expect(() => paint(sheet, metrics, { x: 10000, y: 10000, width: 20, height: 20 })).toThrow(
      /root\/texture.*resources are unavailable/,
    );
  });

  test("collapsed root validates canonical descendants but prepares no leaf resources", async () => {
    const child = leaf("collapsed-text", {
      text: "Missing",
      shapeStyle: { fill: { kind: "value", value: texture("unused") } },
    });
    const group = root([child], {
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: {
          mode: "move-and-size",
          start: { column: { index: 0, offset: 0 }, row: { index: 1, offset: 0 } },
          end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
        },
      },
    });
    const { sheet } = fixture([group]);
    sheet.hiddenRows = new Set([1]);
    const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
    const prepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint"),
      fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
    expect([...getPrintableShapeLeaves(sheet, metrics)]).toEqual([]);
    expect(getPrintShapeContentExtent(sheet, metrics)).toEqual({ rowCount: 0, columnCount: 0 });
    expect([...getPrintPictureAssetIds(sheet, metrics)]).toEqual([]);
    await preparePrintShapeFonts(sheet, metrics);
    paint(sheet, metrics);
    expect(prepare).not.toHaveBeenCalled();
    expect(fonts).not.toHaveBeenCalled();
    child.shapeGeometry = {
      preset: "unknown-preset",
    } as unknown as SheetGroupedGraphicDrawing["shapeGeometry"];
    expect(() => getPrintShapeContentExtent(sheet, metrics)).toThrow(ShapePrintError);
    expect(() => paint(sheet, metrics)).toThrow(/root.*unknown.*preset/i);
  });

  test("unknown deep nodes fail actionably before off-page culling", async () => {
    const child = leaf("bad"),
      nested: ShapeGroupedGroup = {
        kind: "shapeGroup",
        id: "nested",
        name: "Nested",
        rotation: 0,
        groupFrame: local(),
        members: [child],
      };
    const { sheet, metrics } = fixture([root([nested])]);
    Object.assign(child, { kind: "unknown-kind" });
    expect(() => paint(sheet, metrics, { x: 10000, y: 10000, width: 20, height: 20 })).toThrow(
      /root.*Unknown shape group child kind/,
    );
    await expect(preparePrintShapeFonts(sheet, metrics)).rejects.toThrow(
      /root.*Unknown shape group child kind/,
    );
    expect(() => getPrintPictureAssetIds(sheet, metrics)).toThrow(ShapePrintError);
  });

  test("missing and failed fonts on off-page real leaves fail explicitly with root/member identity", async () => {
    const child = leaf("font", {
      text: "No substitute",
      shapeText: { ...leaf("defaults").shapeText!, fontFamily: "Noto Sans" },
    });
    const { sheet, metrics } = fixture([root([child])]);
    expect(() => paint(sheet, metrics, { x: 10000, y: 10000, width: 20, height: 20 })).toThrow(
      /root\/font.*font resource Noto Sans is idle/,
    );
    vi.spyOn(textRuntime, "ensureDrawingShapeTextFont").mockRejectedValue(
      new Error("Font fetch failed"),
    );
    await expect(preparePrintShapeFonts(sheet, metrics)).rejects.toThrow(
      /root\/font.*Font fetch failed/,
    );
  });
});
