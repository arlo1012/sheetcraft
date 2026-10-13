// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, createSheetEvaluator, type Sheet } from "@sheetcraft/core/workbook";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ShapeGroupDrawing, SheetGroupedGraphicDrawing } from "@sheetcraft/core/shape-group";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import { framedShape } from "../sheet-drawings/framed-shape-fixture";
import * as renderSources from "../../../modules/sheet-drawings/resolved-shape-render-source";
import * as bodyPaint from "../../../modules/sheet-drawings/shape-detailed-paint";
import * as groupPaint from "../../../modules/sheet-drawings/shape-group-paint";
import * as markers from "../../../modules/sheet-drawings/shape-line-paint";
import * as textRuntime from "../../../modules/sheet-drawings/shape-text-runtime";
import { createCanvasImageCache } from "../../../modules/sheet-grid/canvas/image-painter";
import { getPrintPictureAssetIds } from "../../../modules/page-layout/page-print-pictures";
import {
  createPrintPreviewDocument,
  createPrintPreviewRenderer,
} from "../../../modules/page-layout/page-print-renderer";
import {
  assertPrintShapeRenderPass,
  createPrintShapeMetrics,
  getPrintableShapeLeaves,
  getPrintableShapeRoots,
  getPrintShapeContentExtent,
  paintPrintShapes,
  preparePrintShapeFonts,
} from "../../../modules/page-layout/page-print-shapes";

function fixture() {
  const sheet = createSheet("Connector print", "sheet");
  const target: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "target",
    text: "",
    shapeGeometry: { preset: "rect" },
    shapeProperties: { printObject: false },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 40, size: { width: 80, height: 50 } },
    },
  };
  const connector: SheetFramedGraphicDrawing = {
    ...framedShape(),
    id: "connector",
    text: "",
    rotation: 37,
    shapeFlipX: true,
    shapeFlipY: true,
    shapeGeometry: { preset: "bentConnector3" },
    shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "triangle" } },
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 300, y: 200, size: { width: 140, height: 80 } },
    },
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    },
  };
  sheet.drawings = [target, connector];
  return { sheet, target, connector };
}
function passFor(sheet: Sheet, revision = 7) {
  const metrics = createPrintShapeMetrics(sheet, createSheetEvaluator(sheet));
  const renderPass = renderSources.resolveShapeForestForRender({
    drawings: sheet.drawings!,
    metrics,
    revision,
  });
  return { metrics, renderPass };
}
function canvasContext() {
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
function paint(sheet: Sheet, input: ReturnType<typeof passFor>, context = canvasContext()) {
  paintPrintShapes(context, {
    sheet,
    ...input,
    density: 2,
    viewport: { x: 0, y: 0, width: 2000, height: 2000 },
    images: createCanvasImageCache(() => {}),
  });
  return context;
}
/** Keep real numeric planning/marker geometry. Only pixel preparation is a
 * codeunit Canvas boundary; this test performs no native raster or print I/O. */
function prepareBodyBoundary() {
  return vi.spyOn(bodyPaint, "prepareShapeDetailedPaint").mockImplementation((options) => {
    const plan = bodyPaint.planShapeDetailedPaint(options);
    if (plan.kind !== "ready") throw new Error("Expected ready numeric body preflight.");
    return {
      ...plan,
      canvas: { width: plan.widthRaster, height: plan.heightRaster } as HTMLCanvasElement,
    };
  });
}
function groupFixture(withShadow: boolean) {
  const f = fixture();
  const { shapeFrame: _frame, ...appearance } = f.connector;
  const member: SheetGroupedGraphicDrawing = {
    ...appearance,
    groupFrame: {
      kind: "shape-group-local-v1",
      rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.6 },
    },
  };
  const root: ShapeGroupDrawing = {
    id: "owner",
    kind: "shapeGroup",
    name: "Owner",
    rotation: 19,
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 300, y: 200, size: { width: 240, height: 120 } },
    },
    members: [member],
    ...(withShadow
      ? {
          groupEffects: {
            shadow: {
              kind: "value" as const,
              value: {
                kind: "outer" as const,
                color: { kind: "rgb" as const, rgb: "#000000" },
                opacity: 0.5,
                blurPt: 0,
                distancePt: 12,
                angleDeg: 30,
                scale: 1,
                anchor: "center" as const,
              },
            },
          },
        }
      : {}),
  };
  f.sheet.drawings = [f.target, root];
  return { ...f, root, member };
}
afterEach(() => vi.restoreAllMocks());

describe("internal print connector whole-sheet source", () => {
  test("production pagination captures one full forest before filtering nonprinting targets", () => {
    const f = fixture(),
      before = JSON.stringify(f.sheet.drawings);
    const resolve = vi.spyOn(renderSources, "resolveShapeForestForRender");
    const document = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      revision: 7,
    });
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve.mock.calls[0]![0].drawings).toBe(f.sheet.drawings);
    expect(document.shapeRenderPass.sourceSnapshot).toHaveLength(2);
    expect(getPrintableShapeRoots(f.sheet)).toEqual([f.connector]);
    const [leaf] = getPrintableShapeLeaves(
      f.sheet,
      document.shapeMetrics,
      document.shapeRenderPass,
    );
    const source = document.shapeRenderPass.getLeaf("connector")!.connector;
    if (source?.status !== "ready" || !leaf) throw new Error("Expected a ready printable route.");
    expect(leaf.sourceRoot).toBe(f.connector);
    expect(leaf.sourceNode).toBe(f.connector);
    expect(leaf.sourceIdentity).toBe(f.connector);
    expect(leaf.path).toEqual(["connector"]);
    expect(leaf.drawing).toBe(source.paintView);
    expect(leaf.rect).toBe(source.route.paintLayout.rect);
    expect(leaf.connectorRoute).toBe(source.route);
    expect(
      getPrintPictureAssetIds(f.sheet, document.shapeMetrics, document.shapeRenderPass),
    ).toEqual(new Set());
    expect(document.pages.length).toBeGreaterThan(0);
    expect(JSON.stringify(f.sheet.drawings)).toBe(before);
  });

  test("plan and Canvas preparation use the exact route and real ordered marker geometry", () => {
    const f = fixture(),
      input = passFor(f.sheet),
      prepare = prepareBodyBoundary();
    const [leaf] = getPrintableShapeLeaves(f.sheet, input.metrics, input.renderPass);
    if (!leaf?.connectorRoute) throw new Error("Expected ready route.");
    const route = leaf.connectorRoute;
    const markerCall = vi.spyOn(markers, "getShapeEndPaint");
    const planCall = vi.spyOn(bodyPaint, "planShapeDetailedPaint");
    const extent = getPrintShapeContentExtent(
      f.sheet,
      input.metrics,
      undefined,
      undefined,
      false,
      input.renderPass,
    );
    const context = paint(f.sheet, input);
    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]![0].geometry).toBe(route.geometry);
    expect(prepare.mock.calls[0]![0].connectorRoute).toBe(route);
    expect(prepare.mock.calls[0]![0].sourceIdentity).toBe(f.connector);
    expect(
      planCall.mock.calls.every(
        ([options]) => options.geometry === route.geometry && options.connectorRoute === route,
      ),
    ).toBe(true);
    expect(
      markerCall.mock.calls.every(
        ([, geometry, value]) => geometry === route.geometry && value === route,
      ),
    ).toBe(true);
    const plan = prepare.mock.results[0]!.value as ReturnType<
      typeof bodyPaint.prepareShapeDetailedPaint
    >;
    expect(plan.sourceProfile.lineDecorations).toHaveLength(2);
    route.localEndpoints.forEach((tip, index) => {
      const commands = plan.sourceProfile.lineDecorations![index]!.commands;
      expect(commands[0]!.slice(1)).toEqual([tip.x, tip.y]);
      const world = shapeFrameLocalToWorld(leaf.rect, leaf.drawing.rotation, tip);
      expect(world.x).toBeCloseTo((index ? route.end : route.begin).x, 9);
      expect(world.y).toBeCloseTo((index ? route.end : route.begin).y, 9);
    });
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.scale).toHaveBeenCalledExactlyOnceWith(1, 1);
    expect(context.rotate).toHaveBeenCalledWith((route.paintLayout.angleDeg * Math.PI) / 180);
    expect(extent.rowCount).toBeGreaterThan(0);
    expect(extent.columnCount).toBeGreaterThan(0);
  });

  test.each(["horizontal", "vertical"] as const)(
    "%s allocation padding never changes ordered marker tips",
    (axis) => {
      const f = fixture();
      f.connector.rotation = 0;
      delete f.connector.shapeFlipX;
      delete f.connector.shapeFlipY;
      f.connector.shapeGeometry = { preset: "line" };
      f.connector.shapeConnector = {
        kind: "shape-connector-v1",
        begin: { kind: "free", xRatio: 0, yRatio: 0 },
        end: {
          kind: "free",
          xRatio: axis === "horizontal" ? 1 : 0,
          yRatio: axis === "vertical" ? 1 : 0,
        },
      };
      const input = passFor(f.sheet),
        prepare = prepareBodyBoundary();
      const [leaf] = getPrintableShapeLeaves(f.sheet, input.metrics, input.renderPass);
      if (!leaf?.connectorRoute) throw new Error("Expected padded route.");
      const route = leaf.connectorRoute,
        thinAxis = axis === "horizontal" ? "y" : "x";
      expect(route.localEndpoints.map((point) => point[thinAxis])).toEqual([0.5, 0.5]);
      paint(f.sheet, input);
      const result = prepare.mock.results[0]!.value as ReturnType<
        typeof bodyPaint.prepareShapeDetailedPaint
      >;
      result.sourceProfile.lineDecorations!.forEach(({ commands }, index) => {
        expect(commands[0]!.slice(1)).toEqual([
          route.localEndpoints[index]!.x,
          route.localEndpoints[index]!.y,
        ]);
      });
    },
  );

  test("grouped leaves retain genuine owner/path identity and external nonprinting target lookup", () => {
    const f = groupFixture(false),
      input = passFor(f.sheet),
      prepare = prepareBodyBoundary();
    const [leaf] = getPrintableShapeLeaves(f.sheet, input.metrics, input.renderPass);
    expect(leaf?.sourceRoot).toBe(f.root);
    expect(leaf?.sourceNode).toBe(f.member);
    expect(leaf?.path).toEqual(["owner", "connector"]);
    expect(leaf?.sourceIdentity).toMatchObject({
      sourceRoot: f.root,
      sourceNode: f.member,
      path: leaf?.path,
    });
    const source = input.renderPass.getLeaf("connector")!.connector;
    if (source?.status !== "ready") throw new Error("Expected ready grouped route.");
    expect(leaf?.connectorRoute).toBe(source.route);
    paint(f.sheet, input);
    expect(prepare.mock.calls[0]![0].sourceIdentity).toBe(leaf?.sourceIdentity);
    expect(prepare.mock.calls[0]![0].geometry).toBe(leaf?.connectorRoute?.geometry);
  });

  test("the genuine group-shadow consumer receives the same full-sheet pass", () => {
    const f = groupFixture(true),
      input = passFor(f.sheet),
      dispose = vi.fn();
    const bodyPlan = vi.spyOn(bodyPaint, "planShapeDetailedPaint");
    const prepare = vi.spyOn(groupPaint, "prepareShapeGroupPaint").mockImplementation((options) => {
      const plan = groupPaint.planShapeGroupPaint(options);
      if (plan.kind !== "ready") throw new Error("Expected ready numeric group plan.");
      return {
        ...plan,
        canvas: { width: plan.widthRaster, height: plan.heightRaster } as HTMLCanvasElement,
        dispose,
      };
    });
    const context = paint(f.sheet, input);
    expect(prepare.mock.calls[0]![0].renderPass).toBe(input.renderPass);
    expect(prepare.mock.calls[0]![0].root).toBe(f.root);
    const source = input.renderPass.getLeaf("connector")!.connector;
    if (source?.status !== "ready") throw new Error("Expected ready grouped route.");
    expect(bodyPlan.mock.calls.length).toBeGreaterThan(0);
    expect(
      bodyPlan.mock.calls.every(
        ([options]) =>
          options.geometry === source.route.geometry && options.connectorRoute === source.route,
      ),
    ).toBe(true);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  test.each(["suspended", "degenerate"] as const)(
    "%s connectors produce no carrier pixels or font work",
    async (status) => {
      const f = fixture();
      if (status === "suspended") {
        f.target.shapeFrame = {
          kind: "shape-frame-v1",
          anchor: {
            mode: "move-and-size",
            start: { column: { index: 0, offset: 0 }, row: { index: 1, offset: 0 } },
            end: { column: { index: 1, offset: 0 }, row: { index: 2, offset: 0 } },
          },
        };
        f.sheet.hiddenRows = new Set([1]);
      } else
        f.connector.shapeConnector = {
          kind: "shape-connector-v1",
          begin: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
          end: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
        };
      const input = passFor(f.sheet),
        prepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint"),
        fonts = vi.spyOn(textRuntime, "ensureDrawingShapeTextFont");
      expect(input.renderPass.getLeaf("connector")!.connector?.status).toBe(status);
      expect([...getPrintableShapeLeaves(f.sheet, input.metrics, input.renderPass)]).toEqual([]);
      const context = paint(f.sheet, input);
      await preparePrintShapeFonts(f.sheet, input.metrics, input.renderPass);
      expect(context.drawImage).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
      expect(fonts).not.toHaveBeenCalled();
    },
  );

  test("a shadow owner with only a degenerate route does not expand print extent", () => {
    const f = groupFixture(true);
    const member = f.root.members[0]!;
    if (member.kind !== "shape") throw Error("Expected connector member");
    member.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
      end: { kind: "free", xRatio: 0.5, yRatio: 0.5 },
    };
    const input = passFor(f.sheet);
    const bodyPlan = vi.spyOn(bodyPaint, "planShapeDetailedPaint");
    const plan = groupPaint.planShapeGroupPaint({
      root: f.root,
      metrics: input.metrics,
      renderPass: input.renderPass,
      density: 1,
    });
    expect(plan.collapsed).toBe(true);
    expect(
      getPrintShapeContentExtent(
        f.sheet,
        input.metrics,
        undefined,
        undefined,
        false,
        input.renderPass,
      ),
    ).toEqual({ rowCount: 0, columnCount: 0 });
    expect(bodyPlan).not.toHaveBeenCalled();
  });

  test.each(["text", "3d"] as const)(
    "unsupported connector %s fails explicitly before print pixels",
    async (kind) => {
      const f = fixture();
      if (kind === "text") f.connector.text = "Preserve this label";
      else
        f.connector.shapeStyle = {
          rotation3d: {
            kind: "value",
            value: { projection: "parallel", xDeg: 20, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
          },
        };
      const input = passFor(f.sheet),
        context = canvasContext(),
        prepare = vi.spyOn(bodyPaint, "prepareShapeDetailedPaint");
      expect(() => paint(f.sheet, input, context)).toThrow(
        new RegExp(`connector.*connector-${kind}`),
      );
      await expect(
        preparePrintShapeFonts(f.sheet, input.metrics, input.renderPass),
      ).rejects.toThrow(/connector.*unavailable/);
      expect(context.drawImage).not.toHaveBeenCalled();
      expect(prepare).not.toHaveBeenCalled();
    },
  );

  test("no-pass helper admission remains closed and filtered-root passes are rejected", () => {
    const f = fixture(),
      input = passFor(f.sheet);
    expect(() => [...getPrintableShapeLeaves(f.sheet, input.metrics)]).toThrow(/connector/i);
    expect(() => getPrintShapeContentExtent(f.sheet, input.metrics)).toThrow(/connector/i);
    expect(() => getPrintPictureAssetIds(f.sheet, input.metrics)).toThrow(/connector/i);
    expect(() => [
      ...getPrintableShapeLeaves({ drawings: [f.connector] }, input.metrics, input.renderPass),
    ]).toThrow(/outdated/);
    expect(() =>
      assertPrintShapeRenderPass(f.sheet, { ...input.metrics }, input.renderPass),
    ).toThrow(/outdated/);
    expect(() => assertPrintShapeRenderPass(f.sheet, input.metrics, input.renderPass, 8)).toThrow(
      /outdated/,
    );
    delete f.sheet.drawings;
    expect(() => assertPrintShapeRenderPass(f.sheet, input.metrics, input.renderPass)).toThrow(
      /outdated/,
    );
  });

  test("font readiness invalidates the entire pass when a nonprinting external target changes", async () => {
    const f = fixture();
    const label = { ...framedShape(), id: "label", text: "Wait for font" };
    f.sheet.drawings!.push(label);
    const input = passFor(f.sheet);
    let ready!: () => void;
    vi.spyOn(textRuntime, "ensureDrawingShapeTextFont").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve;
        }),
    );
    const pending = preparePrintShapeFonts(f.sheet, input.metrics, input.renderPass);
    f.target.rotation = 10;
    ready();
    await expect(pending).rejects.toThrow(/outdated/);
  });

  test("production image/font boundaries and prepaint reject outdated document sources", async () => {
    const f = fixture();
    const document = createPrintPreviewDocument({
      sheet: f.sheet,
      evaluator: createSheetEvaluator(f.sheet),
      revision: 7,
    });
    const renderer = createPrintPreviewRenderer();
    const pending = renderer.prepareImages([], document);
    f.target.rotation = 11;
    await expect(pending).rejects.toThrow(/outdated/);
    await expect(renderer.prepareShapes(document)).rejects.toThrow(/outdated/);
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: vi.fn(),
    } as unknown as HTMLCanvasElement;
    expect(() =>
      renderer.render({ canvas, document, page: document.pages[0]!, density: 1 }),
    ).toThrow(/outdated/);
    expect(canvas.getContext).not.toHaveBeenCalled();
    renderer.dispose();
  });
});
