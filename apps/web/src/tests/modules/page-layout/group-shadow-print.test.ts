import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator, type Sheet } from "@sheetcraft/core/workbook";
import {
  collectShapeGroupAssetIds,
  type ShapeGroupDrawing,
  type ShapeGroupedGroup,
  type ShapeGroupLocalFrame,
  type SheetGroupedGraphicDrawing,
} from "@sheetcraft/core/shape-group";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type { PicturePaintResources } from "../../../shared/images/picture-detailed-render";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import * as bodyPaint from "../../../modules/sheet-drawings/shape-detailed-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import * as textPaint from "../../../modules/sheet-drawings/shape-text-paint";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { resolveShapeForestForRender } from "../../../modules/sheet-drawings/resolved-shape-render-source";
import { framedShape } from "../sheet-drawings/framed-shape-fixture";
import { resolveShapeGroupProjection } from "../../../modules/sheet-drawings/resolved-shape-group";
import { getPrintPictureAssetIds } from "../../../modules/page-layout/page-print-pictures";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import {
  createPrintShapeMetrics,
  getPrintableShapeLeaves,
  getPrintShapeContentExtent,
  paintPrintShapes,
  preparePrintShapeFonts,
  ShapePrintError,
} from "../../../modules/page-layout/page-print-shapes";

type Bounds = { left: number; top: number; right: number; bottom: number };
function local(xRatio = 0, yRatio = 0, widthRatio = 1, heightRatio = 1): ShapeGroupLocalFrame {
  return { kind: "shape-group-local-v1", rect: { xRatio, yRatio, widthRatio, heightRatio } };
}
function leaf(id: string, changes: Partial<SheetGroupedGraphicDrawing> = {}) {
  const {
    anchor: _anchor,
    offsetX: _offsetX,
    offsetY: _offsetY,
    width: _width,
    height: _height,
    ...appearance
  } = createGraphicDrawing(id, "shape", id, { row: 0, column: 0 });
  return {
    ...appearance,
    kind: "shape",
    groupFrame: local(),
    ...changes,
  } as SheetGroupedGraphicDrawing;
}
function shadow(distancePt = 120): ShapeGroupDrawing["groupEffects"] {
  return {
    shadow: {
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 0.5,
        blurPt: 0,
        distancePt,
        angleDeg: 30,
        scale: 1,
        anchor: "center",
      },
    },
  };
}
function effectOnly(kind: "reflection" | "glow"): ShapeGroupDrawing["groupEffects"] {
  return kind === "reflection"
    ? {
        reflection: { kind: "value", value: { opacity: 0.75, size: 1, distancePt: 30, blurPt: 0 } },
      }
    : {
        glow: {
          kind: "value",
          value: { color: { kind: "rgb", rgb: "#00FF00" }, opacity: 0.75, sizePt: 30 },
        },
      };
}
function group(
  id = "root",
  members: ShapeGroupDrawing["members"] = [leaf("child")],
): ShapeGroupDrawing {
  return {
    kind: "shapeGroup",
    id,
    name: id,
    rotation: 37,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 120, y: 80, size: { width: 200, height: 100 } },
    },
    groupEffects: shadow(),
    members,
  };
}
function fixture(drawings: Sheet["drawings"]) {
  const sheet = createSheet("Group shadows", "sheet");
  sheet.drawings = drawings;
  return { sheet, metrics: createPrintShapeMetrics(sheet, createSheetEvaluator(sheet)) };
}
function count(position: number, axis: ReturnType<typeof createPrintShapeMetrics>["rows"]) {
  let index = 0;
  while (axis.visiblePrefix(index) < position) index++;
  return index;
}
function extent(
  rect: ShapeFrameRect,
  angle: number,
  bounds: Bounds,
  metrics: ReturnType<typeof createPrintShapeMetrics>,
) {
  const points = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ].map((point) => shapeFrameLocalToWorld(rect, angle, point));
  return {
    rowCount: count(Math.max(...points.map((point) => point.y)), metrics.rows),
    columnCount: count(Math.max(...points.map((point) => point.x)), metrics.columns),
  };
}
function nativeTextBounds(bounds: Bounds) {
  vi.spyOn(textRuntime, "layoutDrawingShapeText").mockReturnValue({
    runs: [],
  } as unknown as ReturnType<typeof textRuntime.layoutDrawingShapeText>);
  vi.spyOn(textPaint, "planShapeTextPaint").mockImplementation(
    ({ density }) =>
      ({
        kind: "ready",
        actualDensity: density,
        logicalBounds: bounds,
        outputBoundsRaster: {
          left: Math.floor(bounds.left * density),
          top: Math.floor(bounds.top * density),
          right: Math.ceil(bounds.right * density),
          bottom: Math.ceil(bounds.bottom * density),
        },
        widthRaster: Math.ceil((bounds.right - bounds.left) * density),
        heightRaster: Math.ceil((bounds.bottom - bounds.top) * density),
        estimatedPeakBytes: 4096,
        assetIds: [],
      }) as unknown as ReturnType<typeof textPaint.planShapeTextPaint>,
  );
}
function texture(assetId = "texture") {
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
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
function paint(
  sheet: Sheet,
  metrics: ReturnType<typeof createPrintShapeMetrics>,
  target = context(),
  viewport = { x: 0, y: 0, width: 2000, height: 2000 },
) {
  paintPrintShapes(target, {
    sheet,
    metrics,
    viewport,
    density: 2,
    images: createCanvasImageCache(() => {}),
  });
  return target;
}
/** Only raster preparation is mocked here. Real leaf/group planning and its effect
 * geometry remain in use; compositor pixel fidelity is tested in its own module. */
function readyGroup(
  root: ShapeGroupDrawing,
  metrics: ReturnType<typeof createPrintShapeMetrics>,
  dispose = vi.fn(),
) {
  const plan = groupPaint.planShapeGroupPaint({ root, metrics, density: 2, interactive: false });
  if (plan.kind !== "ready") throw new Error("Test group must have ready real paint bounds.");
  return {
    ...plan,
    canvas: { width: plan.widthRaster, height: plan.heightRaster } as HTMLCanvasElement,
    dispose,
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("owned container Shadow print integration", () => {
  test.each(["reflection", "glow"] as const)(
    "%s-only roots use one complete rotated raster, exact effect pagination and root print policy",
    (effect) => {
      const nested: ShapeGroupedGroup = {
        kind: "shapeGroup",
        id: "nested",
        name: "Nested",
        rotation: 13,
        groupFrame: local(0.1, 0.2, 0.7, 0.6),
        shapeProperties: { printObject: false },
        groupEffects: effectOnly(effect === "reflection" ? "glow" : "reflection"),
        members: [leaf("private", { text: "", shapeProperties: { printObject: false } })],
      };
      const root = group("effect-owner", [nested]);
      root.groupEffects = effectOnly(effect);
      const nonprinting = group("no-object", [leaf("hidden", { text: "Missing font" })]);
      nonprinting.groupEffects = effectOnly(effect);
      nonprinting.shapeProperties = { printObject: false };
      const { sheet, metrics } = fixture([root, nonprinting]),
        snapshot = JSON.stringify(sheet.drawings),
        plan = groupPaint.planShapeGroupPaint({ root, metrics, density: 1 });
      expect(groupPaint.hasActiveShapeGroupEffects(root)).toBe(true);
      expect(groupPaint.hasActiveShapeGroupShadow(root)).toBe(false);
      expect(
        [...getPrintableShapeLeaves(sheet, metrics)].map((leaf) => leaf.sourceNode.id),
      ).toEqual(["private"]);
      const bounds = {
        left: Math.min(0, plan.logicalBounds.left),
        top: Math.min(0, plan.logicalBounds.top),
        right: Math.max(plan.layout.rect.width, plan.logicalBounds.right),
        bottom: Math.max(plan.layout.rect.height, plan.logicalBounds.bottom),
      };
      expect(getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true)).toEqual(
        extent(plan.layout.rect, plan.layout.angleDeg, bounds, metrics),
      );
      const result = readyGroup(root, metrics),
        prepareGroup = vi.spyOn(groupPaint, "prepareShapeGroupPaint").mockReturnValue(result),
        prepareBody = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint"),
        target = paint(sheet, metrics);
      expect(prepareGroup).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ root, metrics, density: 2, interactive: false }),
      );
      expect(prepareBody).not.toHaveBeenCalled();
      expect(vi.mocked(target.drawImage)).toHaveBeenCalledExactlyOnceWith(
        result.canvas,
        result.logicalBounds.left,
        result.logicalBounds.top,
        result.canvas.width / result.actualDensity,
        result.canvas.height / result.actualDensity,
      );
      expect(target.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
      expect(result.dispose).toHaveBeenCalledOnce();
      expect(JSON.stringify(sheet.drawings)).toBe(snapshot);
    },
  );
  test.each(["reflection", "glow"] as const)(
    "%s group print keeps the whole-sheet bound connector route and its nonprinting target",
    (effect) => {
      const connector = leaf("connector", {
        text: "",
        groupFrame: local(0.1, 0.2, 0.4, 0.3),
        shapeGeometry: { preset: "bentConnector3" },
        shapeConnector: {
          kind: "shape-connector-v1",
          begin: { kind: "site", targetId: "outside", preset: "rect", siteIndex: 3 },
          end: { kind: "free", xRatio: 1, yRatio: 1 },
        },
      });
      const root = group("routed-owner", [connector]);
      root.groupEffects = effectOnly(effect);
      const outside = framedShape();
      outside.id = "outside";
      outside.text = "";
      outside.shapeGeometry = { preset: "rect" };
      outside.shapeProperties = { printObject: false };
      const { sheet, metrics } = fixture([outside, root]),
        renderPass = resolveShapeForestForRender({
          drawings: sheet.drawings!,
          metrics,
          revision: 4,
        }),
        route = renderPass.getLeaf(connector.id)!.connector;
      if (route?.status !== "ready") throw Error("Expected actual bound route");
      const [printed] = [...getPrintableShapeLeaves(sheet, metrics, renderPass)];
      expect(printed?.sourceNode).toBe(connector);
      expect(printed?.connectorRoute).toBe(route.route);
      expect(printed?.drawing).toBe(route.paintView);
      const plan = groupPaint.planShapeGroupPaint({
        root,
        metrics,
        renderPass,
        density: 2,
        interactive: false,
      });
      if (plan.kind !== "ready") throw Error("Expected complete routed group plan");
      const result = {
        ...plan,
        canvas: { width: plan.widthRaster, height: plan.heightRaster } as HTMLCanvasElement,
        dispose: vi.fn(),
      };
      const prepare = vi.spyOn(groupPaint, "prepareShapeGroupPaint").mockReturnValue(result),
        target = context();
      paintPrintShapes(target, {
        sheet,
        metrics,
        renderPass,
        viewport: { x: 0, y: 0, width: 2000, height: 2000 },
        density: 2,
        images: createCanvasImageCache(() => {}),
      });
      expect(prepare).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ root, metrics, renderPass, interactive: false }),
      );
      expect(target.drawImage).toHaveBeenCalledOnce();
      expect(result.dispose).toHaveBeenCalledOnce();
      expect(() =>
        getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true, renderPass),
      ).not.toThrow();
      outside.rotation = 20;
      expect(() =>
        getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true, renderPass),
      ).toThrow(/outdated/);
    },
  );
  test("hidden far-off owner subtrees retain geometry and assets without expanding printed group ink or loading fonts", async () => {
    const hidden: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "hidden-owner",
      name: "Hidden owner",
      hidden: true,
      rotation: 0,
      groupFrame: local(10, 10, 1, 1),
      groupEffects: shadow(),
      members: [
        leaf("hidden-texture", {
          text: "Missing hidden font",
          shapeStyle: { fill: { kind: "value", value: texture() } },
        }),
      ],
    };
    const root = group("visible-owner", [
      leaf("visible", { text: "", groupFrame: local(0, 0, 0.2, 0.2) }),
      hidden,
    ]);
    root.rotation = 0;
    root.groupEffects = shadow(0);
    const { sheet, metrics } = fixture([root]),
      snapshot = JSON.stringify(root),
      canonical = resolveShapeGroupProjection(root, metrics),
      fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
    expect(canonical.leaves[1]!.layout?.collapsed).toBe(false);
    expect(canonical.leaves[1]!.layout!.rect.x).toBeGreaterThan(2000);
    expect([...getPrintableShapeLeaves(sheet, metrics)].map((leaf) => leaf.sourceNode.id)).toEqual([
      "visible",
    ]);
    expect(getPrintPictureAssetIds(sheet, metrics)).toEqual(new Set());
    expect(collectShapeGroupAssetIds(root)).toEqual(new Set(["texture"]));
    await preparePrintShapeFonts(sheet, metrics);
    expect(fonts).not.toHaveBeenCalled();
    const plan = groupPaint.planShapeGroupPaint({ root, metrics, density: 1 });
    expect(plan).toMatchObject({ kind: "ready", visible: true, empty: false, collapsed: false });
    const bounds = getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true);
    expect(metrics.rows.visiblePrefix(bounds.rowCount)).toBeLessThan(300);
    expect(metrics.columns.visiblePrefix(bounds.columnCount)).toBeLessThan(500);
    const prepare = vi
      .spyOn(groupPaint, "prepareShapeGroupPaint")
      .mockReturnValue(readyGroup(root, metrics));
    expect(paint(sheet, metrics).drawImage).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledOnce();
    expect(JSON.stringify(root)).toBe(snapshot);
  });

  test.each(["root", "member"] as const)(
    "%s-hidden groups have no printed pixels, fonts, assets or content extent",
    async (target) => {
      const root = group("empty-owner", [
        leaf("hidden", {
          text: "Missing font",
          shapeStyle: { fill: { kind: "value", value: texture() } },
        }),
      ]);
      if (target === "root") root.hidden = true;
      else root.members[0]!.hidden = true;
      const { sheet, metrics } = fixture([root]),
        snapshot = JSON.stringify(root),
        prepare = vi.spyOn(groupPaint, "prepareShapeGroupPaint"),
        fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
      expect(resolveShapeGroupProjection(root, metrics).layout.collapsed).toBe(false);
      expect([...getPrintableShapeLeaves(sheet, metrics)]).toEqual([]);
      expect(getPrintPictureAssetIds(sheet, metrics)).toEqual(new Set());
      expect(getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true)).toEqual({
        rowCount: 0,
        columnCount: 0,
      });
      expect(paint(sheet, metrics).drawImage).not.toHaveBeenCalled();
      await preparePrintShapeFonts(sheet, metrics);
      expect(prepare).not.toHaveBeenCalled();
      expect(fonts).not.toHaveBeenCalled();
      expect(collectShapeGroupAssetIds(root)).toEqual(new Set(["texture"]));
      expect(JSON.stringify(root)).toBe(snapshot);
    },
  );

  test("unavailable group assets preserve provisional ready text overflow and final pagination rejects them", () => {
    const root = group("textured", [
      leaf("overflow", {
        text: "Real overflow",
        shapeStyle: { fill: { kind: "value", value: texture() } },
      }),
    ]);
    const { sheet, metrics } = fixture([root]),
      snapshot = JSON.stringify(sheet.drawings);
    const bounds = { left: -30, top: -40, right: 1400, bottom: 1200 };
    nativeTextBounds(bounds);
    const resources = {
      getAssetSize: vi.fn(() => undefined),
      getAssetImage: vi.fn(() => undefined),
    };
    expect(groupPaint.planShapeGroupPaint({ root, metrics, density: 1, resources })).toMatchObject({
      kind: "unavailable",
      reason: "asset-unavailable",
      missingAssetIds: ["texture"],
    });
    const [resolved] = [...getPrintableShapeLeaves(sheet, metrics)];
    const expected = extent(resolved!.rect, resolved!.drawing.rotation, bounds, metrics);
    expect(getPrintShapeContentExtent(sheet, metrics, undefined, resources)).toEqual(expected);
    expect(
      createPrintPreviewDocument({
        sheet,
        evaluator: createSheetEvaluator(sheet),
        shapePaintResources: resources,
      }).pages.length,
    ).toBeGreaterThan(1);
    expect(() =>
      createPrintPreviewDocument({
        sheet,
        evaluator: createSheetEvaluator(sheet),
        shapePaintResources: resources,
        requireReadyGroupPaint: true,
      }),
    ).toThrow(/textured.*Complete group bounds require ready fonts and paint resources/);
    expect(resources.getAssetSize).toHaveBeenCalledWith("texture");
    expect(resources.getAssetImage).not.toHaveBeenCalled();
    expect(JSON.stringify(sheet.drawings)).toBe(snapshot);
  });

  test("ready real nested/root effect bounds replace the legacy leaf pass, without preparing pixels", () => {
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 13,
      groupFrame: local(0.1, 0.2, 0.7, 0.6),
      groupEffects: shadow(180),
      members: [leaf("child", { rotation: -9, groupFrame: local(0.1, 0.2, 0.6, 0.5) })],
    };
    const root = group("effects", [nested]),
      { sheet, metrics } = fixture([root]);
    const snapshot = JSON.stringify(root);
    const plan = groupPaint.planShapeGroupPaint({ root, metrics, density: 1 });
    expect(plan.kind).toBe("ready");
    const bounds = {
      left: Math.min(0, plan.logicalBounds.left),
      top: Math.min(0, plan.logicalBounds.top),
      right: Math.max(plan.layout.rect.width, plan.logicalBounds.right),
      bottom: Math.max(plan.layout.rect.height, plan.logicalBounds.bottom),
    };
    const expected = extent(plan.layout.rect, plan.layout.angleDeg, bounds, metrics);
    const bodyPlanner = bodyPaint.planShapeDetailedPaint;
    const bodyCalls = vi
      .spyOn(bodyPaint, "planShapeDetailedPaint")
      .mockImplementation((options) => {
        if (options.angleDeg === undefined)
          throw new Error("Ready groups must not run the old leaf extent pass.");
        return bodyPlanner(options);
      });
    const prepare = vi.spyOn(groupPaint, "prepareShapeGroupPaint");
    expect(getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true)).toEqual(
      expected,
    );
    expect(bodyCalls).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    const withoutEffects = structuredClone(root);
    delete withoutEffects.groupEffects;
    delete (withoutEffects.members[0] as ShapeGroupedGroup).groupEffects;
    bodyCalls.mockRestore();
    const plain = fixture([withoutEffects]);
    const legacy = getPrintShapeContentExtent(plain.sheet, plain.metrics);
    expect(expected.columnCount).toBeGreaterThan(legacy.columnCount);
    expect(expected.rowCount).toBeGreaterThan(legacy.rowCount);
    expect(JSON.stringify(root)).toBe(snapshot);
  });

  test("font-not-ready keeps provisional body extent but cannot pass the strict final rebuild", () => {
    const root = group("font-owner", [leaf("text", { text: "Pending font" })]);
    const { sheet, metrics } = fixture([root]);
    vi.spyOn(textRuntime, "layoutDrawingShapeText").mockImplementation(() => {
      throw new textRuntime.ShapeTextRuntimeError("font-not-ready", "Native font is pending.");
    });
    expect(groupPaint.planShapeGroupPaint({ root, metrics, density: 1 })).toMatchObject({
      kind: "unavailable",
      reason: "text-unavailable",
    });
    const withText = getPrintShapeContentExtent(sheet, metrics);
    const bodyOnly = structuredClone(root);
    (bodyOnly.members[0] as SheetGroupedGraphicDrawing).text = "";
    delete bodyOnly.groupEffects;
    const plain = fixture([bodyOnly]);
    expect(withText).toEqual(getPrintShapeContentExtent(plain.sheet, plain.metrics));
    expect(() => getPrintShapeContentExtent(sheet, metrics, undefined, undefined, true)).toThrow(
      ShapePrintError,
    );
    expect(() =>
      createPrintPreviewDocument({
        sheet,
        evaluator: createSheetEvaluator(sheet),
        requireReadyGroupPaint: true,
      }),
    ).toThrow(/font-owner.*ready fonts and paint resources/);
  });

  test("one completed root canvas follows sheet order for nested/root shadows and honors only root print policy", () => {
    const nested: ShapeGroupedGroup = {
      kind: "shapeGroup",
      id: "nested",
      name: "Nested",
      rotation: 13,
      groupFrame: local(),
      groupEffects: shadow(),
      shapeProperties: { printObject: false },
      members: [leaf("private", { shapeProperties: { printObject: false } })],
    };
    const nestedRoot = group("nested-owner", [leaf("first"), nested, leaf("last")]);
    delete nestedRoot.groupEffects;
    const root = group("root-owner"),
      hidden = group("hidden");
    hidden.shapeProperties = { printObject: false };
    const plain = group("plain-owner", [leaf("plain-leaf")]);
    delete plain.groupEffects;
    const before = createGraphicDrawing("before", "shape", "", { row: 0, column: 0 });
    const after = createGraphicDrawing("after", "shape", "", { row: 0, column: 0 });
    const { sheet, metrics } = fixture([before, nestedRoot, plain, root, hidden, after]);
    const originalDrawings = sheet.drawings,
      snapshot = JSON.stringify(sheet.drawings);
    const prepared = new Map(
      [nestedRoot, root].map((owner) => [owner.id, readyGroup(owner, metrics)]),
    );
    const prepareGroup = vi
      .spyOn(groupPaint, "prepareShapeGroupPaint")
      .mockImplementation(({ root }) => prepared.get(root.id)!);
    const leafCanvases = new Map<string, HTMLCanvasElement>();
    const prepareBody = vi
      .spyOn(bodyPaint, "prepareShapeDetailedPaint")
      .mockImplementation((options) => {
        const plan = bodyPaint.planShapeDetailedPaint(options);
        if (plan.kind !== "ready") throw new Error("Test standalone body must be ready.");
        const canvas = { width: plan.widthRaster, height: plan.heightRaster } as HTMLCanvasElement;
        leafCanvases.set(options.drawing.id, canvas);
        return { ...plan, canvas };
      });
    const target = paint(sheet, metrics);
    expect(prepareGroup.mock.calls.map(([options]) => options.root.id)).toEqual([
      "nested-owner",
      "root-owner",
    ]);
    expect(prepareBody.mock.calls.map(([options]) => options.drawing.id)).toEqual([
      "before",
      "plain-leaf",
      "after",
    ]);
    expect(vi.mocked(target.drawImage).mock.calls.map(([canvas]) => canvas)).toEqual([
      leafCanvases.get("before"),
      prepared.get(nestedRoot.id)!.canvas,
      leafCanvases.get("plain-leaf"),
      prepared.get(root.id)!.canvas,
      leafCanvases.get("after"),
    ]);
    for (const [options] of prepareGroup.mock.calls) {
      expect(options).toMatchObject({ density: 2, interactive: false });
      expect(options.metrics).toBe(metrics);
      expect(options.resources?.getAssetSize).toBeTypeOf("function");
      expect(options.resources?.getAssetImage).toBeTypeOf("function");
      expect(prepared.get(options.root.id)!.dispose).toHaveBeenCalledOnce();
    }
    expect(target.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(sheet.drawings).toBe(originalDrawings);
    expect(JSON.stringify(sheet.drawings)).toBe(snapshot);
  });

  test.each(["off-page", "collapsed", "draw-failure", "invalid-surface"] as const)(
    "completed group raster is disposed on %s",
    (scenario) => {
      const root = group(),
        { sheet, metrics } = fixture([root]);
      const result = readyGroup(root, metrics),
        target = context();
      if (scenario === "collapsed") result.layout = { ...result.layout, collapsed: true };
      if (scenario === "invalid-surface")
        result.canvas = { width: 0, height: 1 } as HTMLCanvasElement;
      if (scenario === "draw-failure")
        vi.mocked(target.drawImage).mockImplementation(() => {
          throw new Error("Target draw failed.");
        });
      vi.spyOn(groupPaint, "prepareShapeGroupPaint").mockReturnValue(result);
      const action = () =>
        paint(
          sheet,
          metrics,
          target,
          scenario === "off-page" ? { x: 10000, y: 10000, width: 10, height: 10 } : undefined,
        );
      if (scenario === "draw-failure") expect(action).toThrow(/root.*Target draw failed/);
      else if (scenario === "invalid-surface")
        expect(action).toThrow(/root.*pixel surface is unavailable/);
      else {
        action();
        expect(target.drawImage).not.toHaveBeenCalled();
      }
      expect(result.dispose).toHaveBeenCalledOnce();
      expect(vi.mocked(target.save).mock.calls.length).toBe(
        vi.mocked(target.restore).mock.calls.length,
      );
    },
  );

  test("off-page unavailable complete appearance fails with the real root identity before culling", () => {
    const root = group("unready", [
      leaf("texture", { shapeStyle: { fill: { kind: "value", value: texture() } } }),
    ]);
    const { sheet, metrics } = fixture([root]),
      target = context();
    const prepare = vi.spyOn(groupPaint, "prepareShapeGroupPaint");
    expect(() =>
      paint(sheet, metrics, target, { x: 10000, y: 10000, width: 10, height: 10 }),
    ).toThrow(/unready.*complete group appearance is unavailable/i);
    expect(prepare).toHaveBeenCalledOnce();
    expect(target.drawImage).not.toHaveBeenCalled();
    expect(target.restore).toHaveBeenCalledOnce();
  });

  test("renderer resources peek the actual decode cache and strict pagination changes only after readiness", async () => {
    const made: DecodedImage[] = [];
    class DecodedImage {
      src = "";
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        made.push(this);
      }
      async decode() {
        this.complete = true;
        this.naturalWidth = 40;
        this.naturalHeight = 30;
      }
    }
    vi.stubGlobal("Image", DecodedImage);
    const root = group("cached", [
      leaf("texture", { shapeStyle: { fill: { kind: "value", value: texture() } } }),
    ]);
    const { sheet, metrics } = fixture([root]);
    const snapshot = JSON.stringify(root),
      urls = new Map([["texture", "memory:texture"]]);
    const renderer = createPrintPreviewRenderer();
    try {
      const resources: PicturePaintResources = renderer.getShapePaintResources(
        DEFAULT_WORKBOOK_THEME,
        urls,
      );
      expect(resources.theme).toBe(DEFAULT_WORKBOOK_THEME);
      expect(resources.getAssetSize?.("texture")).toBeUndefined();
      expect(resources.getAssetSize?.("unknown")).toBeUndefined();
      expect(made).toHaveLength(0);
      expect(() =>
        createPrintPreviewDocument({
          sheet,
          evaluator: createSheetEvaluator(sheet),
          theme: DEFAULT_WORKBOOK_THEME,
          shapePaintResources: resources,
          requireReadyGroupPaint: true,
        }),
      ).toThrow(/cached.*ready fonts and paint resources/);
      expect(made).toHaveLength(0);
      await renderer.prepareImages(["memory:texture", "memory:texture"]);
      expect(made).toHaveLength(2); // Separate grid/shape and legacy floating-image decode caches.
      expect(resources.getAssetSize?.("texture")).toEqual({ width: 40, height: 30 });
      expect(resources.getAssetImage?.("texture")).toBe(made[0]);
      const plan = groupPaint.planShapeGroupPaint({ root, metrics, density: 1, resources });
      expect(plan.kind).toBe("ready");
      expect(() =>
        createPrintPreviewDocument({
          sheet,
          evaluator: createSheetEvaluator(sheet),
          theme: DEFAULT_WORKBOOK_THEME,
          shapePaintResources: resources,
          requireReadyGroupPaint: true,
        }),
      ).not.toThrow();
      expect(JSON.stringify(root)).toBe(snapshot);
      renderer.dispose();
      expect(resources.getAssetSize?.("texture")).toBeUndefined();
      expect(made.every((image) => image.onload === null && image.onerror === null)).toBe(true);
      expect(() =>
        createPrintPreviewDocument({
          sheet,
          evaluator: createSheetEvaluator(sheet),
          shapePaintResources: resources,
          requireReadyGroupPaint: true,
        }),
      ).toThrow(ShapePrintError);
      expect(made).toHaveLength(2);
    } finally {
      renderer.dispose();
    }
  });
});
