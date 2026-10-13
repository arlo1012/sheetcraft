// @vitest-environment node
import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import { resolveSheetShapeConnections } from "@sheetcraft/core/shape-connector-layout";
import {
  resolveShapeConnectorRoute,
  type ReadyShapeConnectorRoute,
} from "@sheetcraft/core/shape-connector-route";
import { flattenShapePath, type ShapePresetParameters } from "@sheetcraft/core/shape-presets";
import type { ShapeLineEnd } from "@sheetcraft/core/shape-line-ends";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { prepareResolvedShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import {
  getShapeEndPaint,
  shapeDrawingContainsWorldPoint,
  type ShapeEndPaint,
} from "../../../modules/sheet-drawings/shape-line-paint";

type Point = Readonly<{ x: number; y: number }>;
const carrier = resolvePictureLayout({ x: 30, y: 40, width: 100, height: 60 }, 0);
const axis = {
  count: 10,
  nominalSize: () => 40,
  visibleSize: () => 40,
  nominalPrefix: (index: number) => index * 40,
  visiblePrefix: (index: number) => index * 40,
};
const metrics: PictureSheetMetrics = { columns: axis, rows: axis };
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
function commandPoint(paint: ShapeEndPaint, index: number): Point {
  const command = paint.commands[index]!;
  return { x: command[1] as number, y: command[2] as number };
}
function worldVector(angle: number, point: Point): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}
function expectOrderedTriangleDirections(
  route: ReadyShapeConnectorRoute,
  paints: readonly ShapeEndPaint[],
) {
  expect(paints).toHaveLength(2);
  for (const index of [0, 1] as const) {
    const paint = paints[index]!,
      tip = commandPoint(paint, 0),
      a = commandPoint(paint, 1),
      b = commandPoint(paint, 2);
    expect(tip).toEqual(route.localEndpoints[index]);
    const vector = worldVector(route.paintLayout.angleDeg, {
      x: tip.x - (a.x + b.x) / 2,
      y: tip.y - (a.y + b.y) / 2,
    });
    const length = Math.hypot(vector.x, vector.y),
      tangent = index === 0 ? route.beginTangent : route.endTangent,
      sign = index === 0 ? -1 : 1;
    expect(vector.x / length).toBeCloseTo(sign * tangent.x, 10);
    expect(vector.y / length).toBeCloseTo(sign * tangent.y, 10);
    const worldTip = shapeFrameLocalToWorld(
        route.paintLayout.rect,
        route.paintLayout.angleDeg,
        tip,
      ),
      expectedTip = index === 0 ? route.begin : route.end;
    expect(worldTip.x).toBeCloseTo(expectedTip.x, 10);
    expect(worldTip.y).toBeCloseTo(expectedTip.y, 10);
  }
}

describe("resolved connector exact ordered markers", () => {
  test.each(["line", "lineInv", "bentConnector3", "curvedConnector3", "curvedConnector5"] as const)(
    "%s preserves ordered crossed tips and exact curved tangents",
    (preset) => {
      const shape = { preset },
        route = ready(shape, { x: 250, y: 130 }, { x: 20, y: 40 }, 37);
      expectOrderedTriangleDirections(
        route,
        getShapeEndPaint(paintDrawing(route, shape), route.geometry, route),
      );
    },
  );
  test.each([0, 90, 180, 270, 37, -37])("angle %s consumes the world tangent once", (angle) => {
    const route = ready({ preset: "bentConnector3" }, { x: 20, y: 30 }, { x: 120, y: 30 }, angle);
    expectOrderedTriangleDirections(
      route,
      getShapeEndPaint(paintDrawing(route, { preset: "bentConnector3" }), route.geometry, route),
    );
  });
  test("representable subpixel routes keep both markers below the static sampling threshold", () => {
    const route = ready({ preset: "line" }, { x: 0, y: 0 }, { x: 2 ** -30, y: 0 }),
      drawing = paintDrawing(route);
    expect(getShapeEndPaint(drawing, route.geometry)).toEqual([]);
    expectOrderedTriangleDirections(route, getShapeEndPaint(drawing, route.geometry, route));
    expect(route.localEndpoints.map(({ y }) => y)).toEqual([0.5, 0.5]);
  });
  test.each([
    [
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    ],
    [
      { x: 10, y: 20 },
      { x: 110, y: 20.25 },
    ],
    [
      { x: 10, y: 20 },
      { x: 10.25, y: 120 },
    ],
  ])("zero/subpixel axes retain interior marker tips", (begin, end) => {
    const route = ready({ preset: "line" }, begin, end);
    expectOrderedTriangleDirections(
      route,
      getShapeEndPaint(paintDrawing(route), route.geometry, route),
    );
  });
  test.each([
    [true, false],
    [false, true],
    [true, true],
  ])("source flips %s/%s are consumed in Core, never mirrored again", (flipX, flipY) => {
    const {
      anchor: _anchor,
      offsetX: _x,
      offsetY: _y,
      width: _width,
      height: _height,
      ...appearance
    } = createGraphicDrawing("connector", "shape", "connector", { row: 0, column: 0 });
    const source: SheetFramedGraphicDrawing = {
      ...appearance,
      kind: "shape",
      rotation: 37,
      shapeGeometry: { preset: "line" },
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 30, y: 40, size: { width: 100, height: 60 } },
      },
      shapeConnector: {
        kind: "shape-connector-v1",
        begin: { kind: "free", xRatio: 0, yRatio: 0 },
        end: { kind: "free", xRatio: 1, yRatio: 1 },
      },
      ...(flipX ? { shapeFlipX: true as const } : {}),
      ...(flipY ? { shapeFlipY: true as const } : {}),
    };
    const connection = resolveSheetShapeConnections([source], metrics).getConnector(source.id);
    if (!connection || connection.status === "suspended" || connection.route.status !== "ready")
      throw new Error("Expected a ready flipped-source route.");
    const route = connection.route,
      expectedBegin = shapeFrameLocalToWorld(carrier.rect, 37, {
        x: flipX ? 100 : 0,
        y: flipY ? 60 : 0,
      }),
      expectedEnd = shapeFrameLocalToWorld(carrier.rect, 37, {
        x: flipX ? 0 : 100,
        y: flipY ? 0 : 60,
      });
    expect(route.begin).toEqual(expectedBegin);
    expect(route.end).toEqual(expectedEnd);
    expectOrderedTriangleDirections(
      route,
      getShapeEndPaint(paintDrawing(route), route.geometry, route),
    );
  });
  test.each(["triangle", "stealth", "diamond", "oval", "open"] as const)(
    "%s numeric marker paint, bounds and hit use the same local body",
    (kind) => {
      const route = ready({ preset: "line" }, { x: 10, y: 20 }, { x: 110, y: 20 }, 37),
        drawing = {
          ...paintDrawing(route),
          shapeLineEnds: {
            begin: { kind } satisfies ShapeLineEnd,
            end: { kind } satisfies ShapeLineEnd,
          },
        };
      expect(prepareResolvedShapeGeometry(route.geometry)).toBe(route.geometry);
      const paints = getShapeEndPaint(drawing, route.geometry, route);
      expect(paints).toHaveLength(2);
      for (const paint of paints) {
        const polylines = flattenShapePath(
          { commands: paint.commands, filled: paint.filled, stroke: true },
          0.05,
        );
        for (const { points } of polylines)
          for (const point of points) {
            expect(point.x).toBeGreaterThanOrEqual(paint.bounds.x - 0.01);
            expect(point.x).toBeLessThanOrEqual(paint.bounds.x + paint.bounds.width + 0.01);
            expect(point.y).toBeGreaterThanOrEqual(paint.bounds.y - 0.01);
            expect(point.y).toBeLessThanOrEqual(paint.bounds.y + paint.bounds.height + 0.01);
            expect(paint.contains(point)).toBe(true);
            const world = shapeFrameLocalToWorld(
              route.paintLayout.rect,
              route.paintLayout.angleDeg,
              point,
            );
            expect(
              shapeDrawingContainsWorldPoint(
                drawing,
                route.geometry,
                route.paintLayout.rect,
                world,
                route,
              ),
            ).toBe(true);
          }
      }
      const outside = shapeFrameLocalToWorld(route.paintLayout.rect, route.paintLayout.angleDeg, {
        x: -100,
        y: -100,
      });
      expect(
        shapeDrawingContainsWorldPoint(
          drawing,
          route.geometry,
          route.paintLayout.rect,
          outside,
          route,
        ),
      ).toBe(false);
    },
  );
  test("world hit permits pane/page translation without changing route geometry or angle", () => {
    const route = ready(),
      drawing = paintDrawing(route);
    expect(prepareResolvedShapeGeometry(route.geometry)).toBe(route.geometry);
    const translated = {
        ...route.paintLayout.rect,
        x: route.paintLayout.rect.x - 100,
        y: route.paintLayout.rect.y + 200,
      },
      local = commandPoint(getShapeEndPaint(drawing, route.geometry, route)[0]!, 1),
      point = shapeFrameLocalToWorld(translated, drawing.rotation, local);
    expect(shapeDrawingContainsWorldPoint(drawing, route.geometry, translated, point, route)).toBe(
      true,
    );
  });
  test("stale geometry/frame/angle/flips reject before invisible-marker early returns", () => {
    const route = ready(),
      drawing = paintDrawing(route);
    expect(() => getShapeEndPaint(drawing, { ...route.geometry }, route)).toThrow(
      /exact neutral paint frame and geometry/,
    );
    expect(() => getShapeEndPaint(drawing, undefined, route)).toThrow(
      /exact neutral paint frame and geometry/,
    );
    for (const changed of [
      { ...drawing, width: drawing.width + 1 },
      { ...drawing, height: drawing.height + 1 },
      { ...drawing, rotation: drawing.rotation + 1 },
      { ...drawing, shapeFlipX: true as const },
      { ...drawing, shapeFlipY: true as const },
    ]) {
      expect(() =>
        getShapeEndPaint(
          { ...changed, stroke: "transparent", shapeLineEnds: undefined },
          route.geometry,
          route,
        ),
      ).toThrow(/exact neutral paint frame and geometry/);
      expect(() =>
        shapeDrawingContainsWorldPoint(
          changed,
          route.geometry,
          route.paintLayout.rect,
          route.begin,
          route,
        ),
      ).toThrow(/exact neutral paint frame and geometry/);
    }
    expect(() =>
      shapeDrawingContainsWorldPoint(
        drawing,
        route.geometry,
        { ...route.paintLayout.rect, width: drawing.width + 1 },
        route.begin,
        route,
      ),
    ).toThrow(/exact neutral paint frame and geometry/);
  });
});
