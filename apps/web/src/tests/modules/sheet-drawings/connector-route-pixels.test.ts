// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resolveShapeConnectorRoute,
  type ReadyShapeConnectorRoute,
} from "@sheetcraft/core/shape-connector-route";
import type { ShapePresetParameters } from "@sheetcraft/core/shape-presets";
import type { ShapeDetailedStyle } from "@sheetcraft/core/shape-style";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import * as geometry from "../../../modules/sheet-drawings/shape-geometry";
import * as markers from "../../../modules/sheet-drawings/shape-line-paint";
import * as detailed from "../../../modules/sheet-drawings/shape-detailed-paint";
import {
  planShapeLeafPixels,
  prepareShapeLeafPixels,
  getShapeLeafPixelsOwnedBytes,
} from "../../../modules/sheet-drawings/shape-leaf-pixels";
import * as compositor from "../../../shared/images/picture-detailed-compositor";

type Point = Readonly<{ x: number; y: number }>;
const carrier = resolvePictureLayout({ x: 30, y: 40, width: 100, height: 60 }, 0);
function ready(
  shape: ShapePresetParameters = { preset: "line" },
  begin: Point = { x: 10, y: 20 },
  end: Point = { x: 210, y: 140 },
  angleDeg = 0,
): ReadyShapeConnectorRoute {
  const route = resolveShapeConnectorRoute(shape, { ...carrier, angleDeg }, begin, end);
  if (route.status !== "ready") throw new Error("Expected a ready Core connector route.");
  return route;
}
function paintDrawing(
  route: ReadyShapeConnectorRoute,
  shape: ShapePresetParameters = { preset: "line" },
) {
  return {
    ...createGraphicDrawing("connector", "shape", "connector", { row: 0, column: 0 }),
    width: route.geometry.width,
    height: route.geometry.height,
    rotation: route.paintLayout.angleDeg,
    shapeGeometry: shape,
    strokeWidth: 0.2,
    shapeLineEnds: { begin: { kind: "triangle" as const }, end: { kind: "triangle" as const } },
  };
}
function options(
  route: ReadyShapeConnectorRoute = ready(),
  shape: ShapePresetParameters = { preset: "line" },
) {
  return {
    drawing: paintDrawing(route, shape),
    geometry: route.geometry,
    connectorRoute: route,
    density: 1,
  };
}
const rotation3d: ShapeDetailedStyle = {
  rotation3d: {
    kind: "value",
    value: { projection: "parallel", xDeg: 20, yDeg: 30, zDeg: 10, distanceFromGroundPt: 0 },
  },
};
const format3d: ShapeDetailedStyle = {
  format3d: {
    kind: "value",
    value: {
      depthPt: 3,
      depthColor: { kind: "rgb", rgb: "#777777" },
      contourPt: 1,
      contourColor: { kind: "rgb", rgb: "#000000" },
      material: "plastic",
      lighting: "three-point",
      lightingAngleDeg: 20,
    },
  },
};
function canvasBoundary() {
  const contexts: {
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    translate: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
  }[] = [];
  const canvases: HTMLCanvasElement[] = [];
  const make = vi.fn(() => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    contexts.push(context);
    canvases.push(canvas);
    return canvas;
  });
  return { make, contexts, canvases };
}
afterEach(() => {
  detailed.clearShapeDetailedPaintCache();
  vi.restoreAllMocks();
  expect(getShapeLeafPixelsOwnedBytes()).toBe(0);
});

describe("resolved connector numeric detailed and leaf transport", () => {
  test.each(["line", "lineInv", "bentConnector3", "curvedConnector3", "curvedConnector5"] as const)(
    "%s detailed preflight uses original route identity for ordered markers",
    (preset) => {
      const shape = { preset },
        route = ready(shape, { x: 250, y: 130 }, { x: 20, y: 40 }, 37),
        input = options(route, shape);
      const expected = markers.getShapeEndPaint(input.drawing, route.geometry, route);
      const markerCall = vi.spyOn(markers, "getShapeEndPaint");
      const before = JSON.stringify(input.drawing),
        plan = detailed.planShapeDetailedPaint(input);
      expect(plan.kind).toBe("ready");
      expect(plan.isProjected).toBe(false);
      expect(plan.effectiveGeometry).not.toBe(route.geometry);
      expect(plan.effectiveGeometry.paths.map(({ commands }) => commands)).toEqual(
        route.geometry.paths.map(({ commands }) => commands),
      );
      expect(
        plan.effectiveGeometry.paths.every(
          ({ filled, fillMode }) => !filled && fillMode === "none",
        ),
      ).toBe(true);
      expect(plan.sourceProfile.lineDecorations?.map(({ commands }) => commands)).toEqual(
        expected.map(({ commands }) => commands),
      );
      expect(markerCall).toHaveBeenCalledOnce();
      expect(markerCall.mock.calls[0]![1]).toBe(route.geometry);
      expect(markerCall.mock.calls[0]![2]).toBe(route);
      expect(JSON.stringify(input.drawing)).toBe(before);
    },
  );
  test.each([
    [
      { x: 0, y: 0 },
      { x: 2 ** -30, y: 0 },
    ],
    [
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    ],
    [
      { x: 10, y: 20 },
      { x: 110, y: 20.25 },
    ],
  ])("leaf plan keeps true padded tips without any preset reevaluation", (begin, end) => {
    const route = ready({ preset: "line" }, begin, end),
      input = options(route),
      lookup = vi.spyOn(geometry, "getDrawingShapeGeometry"),
      body = vi.spyOn(detailed, "planShapeDetailedPaint");
    const plan = planShapeLeafPixels(input);
    expect(plan.kind).toBe("ready");
    expect(lookup).not.toHaveBeenCalled();
    expect(
      body.mock.calls.every(
        ([call]) => call.geometry === route.geometry && call.connectorRoute === route,
      ),
    ).toBe(true);
    expect(plan.bodyPlan.effectiveGeometry.paths[0]!.commands[0]!.slice(1)).toEqual([
      route.localEndpoints[0].x,
      route.localEndpoints[0].y,
    ]);
    expect(plan.bodyPlan.effectiveGeometry.paths[0]!.commands.at(-1)!.slice(-2)).toEqual([
      route.localEndpoints[1].x,
      route.localEndpoints[1].y,
    ]);
    expect(plan.bodyPlan.sourceProfile.lineDecorations).toHaveLength(2);
    expect(plan.bodyFlipX).toBe(false);
    expect(plan.bodyFlipY).toBe(false);
    expect(plan.textLayout).toBeUndefined();
    expect(plan.textPlan).toBeUndefined();
  });
  test("second prepare uses the original route geometry, not detached body-plan geometry", () => {
    const route = ready({ preset: "curvedConnector3" }, { x: 30, y: 50 }, { x: 10, y: 100 }, 37),
      input = options(route, { preset: "curvedConnector3" }),
      boundary = canvasBoundary();
    // The real numeric/resource planners run. This boundary checks transport and
    // ownership, not native Canvas pixels or browser antialiasing.
    const kernel = vi
      .spyOn(compositor, "createDetailedPictureRaster")
      .mockImplementation((call) => {
        const plan = compositor.planDetailedPictureRaster(call);
        if (plan.kind !== "ready") throw new Error("Expected ready numeric raster preflight.");
        const canvas = call.canvasFactory!();
        canvas.width = plan.widthRaster;
        canvas.height = plan.heightRaster;
        return { ...plan, canvas };
      });
    const prepare = vi.spyOn(detailed, "prepareShapeDetailedPaint"),
      markerCall = vi.spyOn(markers, "getShapeEndPaint"),
      result = prepareShapeLeafPixels({ ...input, canvasFactory: boundary.make });
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    try {
      expect(prepare).toHaveBeenCalledOnce();
      expect(prepare.mock.calls[0]![0].geometry).toBe(route.geometry);
      expect(prepare.mock.calls[0]![0].connectorRoute).toBe(route);
      expect(prepare.mock.calls[0]![0].geometry).not.toBe(result.bodyPlan.effectiveGeometry);
      expect(markerCall.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(
        markerCall.mock.calls.every(
          ([, source, supplied]) => source === route.geometry && supplied === route,
        ),
      ).toBe(true);
      expect(kernel).toHaveBeenCalledOnce();
      expect(kernel.mock.calls[0]![0].shapeSource?.lineDecorations).toEqual(
        result.bodyPlan.sourceProfile.lineDecorations,
      );
      expect(boundary.contexts.at(-1)!.scale.mock.calls.every(([x, y]) => x > 0 && y > 0)).toBe(
        true,
      );
      expect(boundary.contexts.at(-1)!.drawImage).toHaveBeenCalledOnce();
      expect(boundary.canvases.filter((canvas) => canvas.width > 0)).toEqual([result.canvas]);
      expect(getShapeLeafPixelsOwnedBytes()).toBe(result.ownedBytes);
    } finally {
      result.dispose();
    }
    expect(result.canvas.width).toBe(0);
    expect(result.canvas.height).toBe(0);
  });
  test("detailed line width drives exact marker profile without breaking route identity", () => {
    const input = options();
    const style: ShapeDetailedStyle = {
      line: {
        kind: "value",
        value: {
          paint: { kind: "solid", color: { kind: "rgb", rgb: "#123456" }, opacity: 1 },
          widthPt: 3,
          compound: "single",
          dash: "solid",
          cap: "round",
          join: "round",
          miterLimit: 4,
        },
      },
    };
    const expected = markers.getShapeEndPaint(
        { ...input.drawing, strokeWidth: 4 },
        input.geometry,
        input.connectorRoute,
      ),
      plan = detailed.planShapeDetailedPaint({ ...input, style });
    expect(plan.sourceProfile.lineDecorations?.map(({ commands }) => commands)).toEqual(
      expected.map(({ commands }) => commands),
    );
  });
  test.each(["existing label", " "])(
    "connector text %j refuses before resources/Canvas/layout without modifying source",
    (text) => {
      const input = options(),
        drawing = { ...input.drawing, text, color: "transparent" },
        before = JSON.stringify(drawing),
        factory = vi.fn(),
        getAssetSize = vi.fn(),
        resources = { getAssetSize };
      for (const run of [
        () => detailed.planShapeDetailedPaint({ ...input, drawing, resources }),
        () =>
          detailed.prepareShapeDetailedPaint({
            ...input,
            drawing,
            resources,
            canvasFactory: factory,
          }),
        () => planShapeLeafPixels({ ...input, drawing, resources }),
        () => prepareShapeLeafPixels({ ...input, drawing, resources, canvasFactory: factory }),
      ]) {
        expect(run).toThrow(detailed.ShapePaintPreflightError);
        expect(run).toThrow(/connector text is unsupported/);
      }
      expect(factory).not.toHaveBeenCalled();
      expect(getAssetSize).not.toHaveBeenCalled();
      expect(JSON.stringify(drawing)).toBe(before);
    },
  );
  test.each([rotation3d, format3d])(
    "active connector 3D refuses before resources/Canvas and preserves style",
    (style) => {
      const input = options(),
        drawing = { ...input.drawing, shapeStyle: style },
        before = JSON.stringify(drawing),
        factory = vi.fn(),
        getAssetSize = vi.fn(),
        resources = { getAssetSize };
      for (const run of [
        () => detailed.planShapeDetailedPaint({ ...input, drawing, resources }),
        () =>
          detailed.prepareShapeDetailedPaint({
            ...input,
            drawing,
            resources,
            canvasFactory: factory,
          }),
        () => planShapeLeafPixels({ ...input, drawing, resources }),
        () => prepareShapeLeafPixels({ ...input, drawing, resources, canvasFactory: factory }),
      ]) {
        expect(run).toThrow(detailed.ShapePaintPreflightError);
        expect(run).toThrow(/connector 3D is unsupported/);
      }
      expect(factory).not.toHaveBeenCalled();
      expect(getAssetSize).not.toHaveBeenCalled();
      expect(JSON.stringify(drawing)).toBe(before);
    },
  );
  test("explicit none 3D is allowed but conflicting angle/geometry/frame/flips cannot fall back", () => {
    const input = options(ready({ preset: "line" }, { x: 10, y: 20 }, { x: 110, y: 20 }, 37));
    expect(
      detailed.planShapeDetailedPaint({
        ...input,
        style: { format3d: { kind: "none" }, rotation3d: { kind: "none" } },
      }).kind,
    ).toBe("ready");
    expect(() => detailed.planShapeDetailedPaint({ ...input, angleDeg: 0 })).toThrow(
      /exact world angle/,
    );
    expect(() => planShapeLeafPixels({ ...input, angleDeg: 0 })).toThrow(/exact world angle/);
    expect(() =>
      detailed.planShapeDetailedPaint({ ...input, geometry: { ...input.geometry } }),
    ).toThrow(/exact neutral paint frame and geometry/);
    for (const drawing of [
      { ...input.drawing, width: input.drawing.width + 1 },
      { ...input.drawing, rotation: input.drawing.rotation + 1 },
      { ...input.drawing, shapeFlipX: true as const },
    ])
      expect(() => planShapeLeafPixels({ ...input, drawing })).toThrow();
  });
  test("absent route retains the old static source, text and 3D preflight behavior", () => {
    const input = options(ready({ preset: "line" }, { x: 10, y: 20 }, { x: 110, y: 20 })),
      drawing = { ...input.drawing, text: "existing static label", shapeStyle: rotation3d },
      lookup = vi.spyOn(geometry, "getDrawingShapeGeometry"),
      markerCall = vi.spyOn(markers, "getShapeEndPaint");
    const plan = detailed.planShapeDetailedPaint({ drawing, geometry: input.geometry, density: 1 });
    expect(plan.kind).toBe("ready");
    expect(plan.isProjected).toBe(true);
    expect(markerCall.mock.calls[0]).toHaveLength(2);
    const staticLeaf = planShapeLeafPixels({
      drawing: { ...input.drawing, shapeText: undefined },
      density: 1,
    });
    expect(staticLeaf.kind).toBe("ready");
    expect(lookup).toHaveBeenCalledOnce();
    expect(staticLeaf.bodyPlan.effectiveGeometry.paths).not.toEqual(input.geometry.paths);
  });
});
