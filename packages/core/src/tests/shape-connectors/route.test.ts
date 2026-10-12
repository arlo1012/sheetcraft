import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "../../picture-frame.js";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import { resolveShapeConnectorRoute } from "../../shape-connector-route.js";
import { evaluateShapePresetAtDisplaySize } from "../../shape-presets/display-size.js";
import type { ShapePresetName } from "../../shape-presets/catalog.js";

const carrier = resolvePictureLayout({ x: 0, y: 0, width: 100, height: 60 }, 0);
const presets: readonly ShapePresetName[] = [
  "line",
  "lineInv",
  "bentConnector2",
  "bentConnector3",
  "bentConnector4",
  "bentConnector5",
  "curvedConnector2",
  "curvedConnector3",
  "curvedConnector4",
  "curvedConnector5",
];
function ready(
  preset: ShapePresetName,
  begin = { x: 20, y: 30 },
  end = { x: 220, y: 150 },
  angle = 0,
) {
  const route = resolveShapeConnectorRoute({ preset }, { ...carrier, angleDeg: angle }, begin, end);
  if (route.status !== "ready") throw new Error("Expected ready route");
  return route;
}
function expectPaintTips(
  route: ReturnType<typeof ready>,
  begin: { x: number; y: number },
  end: { x: number; y: number },
) {
  for (const [local, expected] of [
    [route.localEndpoints[0], begin],
    [route.localEndpoints[1], end],
  ] as const) {
    const actual = shapeFrameLocalToWorld(
      route.paintLayout.rect,
      route.paintLayout.angleDeg,
      local,
    );
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
  }
}

describe("bounded deterministic connector preset routes", () => {
  test.each(presets)("%s retains source command family and ordered exact tips", (preset) => {
    const route = ready(preset),
      source = evaluateShapePresetAtDisplaySize({ preset }, 100, 60);
    expect(route.geometry.paths[0]!.commands.map((command) => command[0])).toEqual(
      source.paths[0]!.commands.map((command) => command[0]),
    );
    expect(route.begin).toEqual({ x: 20, y: 30 });
    expect(route.end).toEqual({ x: 220, y: 150 });
    expectPaintTips(route, route.begin, route.end);
    expect(route.shapeFlipX).toBe(false);
    expect(route.shapeFlipY).toBe(false);
  });
  test("default right-to-left elbow has the observed middle spine and adjustment handle", () => {
    const route = ready("bentConnector3");
    expect(route.geometry.paths[0]!.commands).toEqual([
      ["M", 0, 0],
      ["L", 100, 0],
      ["L", 100, 120],
      ["L", 200, 120],
    ]);
    expect(route.geometry.handles[0]!.position).toEqual({ x: 100, y: 60 });
    expect(route.beginTangent).toEqual({ x: 1, y: 0 });
    expect(route.endTangent).toEqual({ x: 1, y: 0 });
  });
  test("route adjustments remain source-authoritative and out-of-tip controls expand actual bounds", () => {
    const route = resolveShapeConnectorRoute(
      { preset: "bentConnector3", adjustments: { adj1: 150000 } },
      carrier,
      { x: 10, y: 20 },
      { x: 110, y: 100 },
    );
    if (route.status !== "ready") throw new Error("Expected route");
    expect(route.geometry.paths[0]!.commands).toEqual([
      ["M", 0, 0],
      ["L", 150, 0],
      ["L", 150, 80],
      ["L", 100, 80],
    ]);
    expect(route.geometry.adjustments.adj1).toBe(150000);
    expect(route.worldBounds).toEqual({ x: 10, y: 20, width: 150, height: 80 });
    expect(route.endTangent).toEqual({ x: -1, y: 0 });
  });
  test.each([
    [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ],
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
  ])("zero/subpixel axes pad the container without a half-pixel endpoint drift", (begin, end) => {
    const route = ready("bentConnector3", begin, end);
    expect(route.paintLayout.rect.width).toBeGreaterThanOrEqual(1);
    expect(route.paintLayout.rect.height).toBeGreaterThanOrEqual(1);
    expectPaintTips(route, begin, end);
    const path = route.geometry.paths[0]!.commands;
    expect(path[0]!.slice(1)).toEqual([route.localEndpoints[0].x, route.localEndpoints[0].y]);
    expect(path.at(-1)!.slice(-2)).toEqual([route.localEndpoints[1].x, route.localEndpoints[1].y]);
    if (begin.y === end.y) expect(route.localEndpoints.map((point) => point.y)).toEqual([0.5, 0.5]);
    if (begin.x === end.x) expect(route.localEndpoints.map((point) => point.x)).toEqual([0.5, 0.5]);
  });
  test("unrepresentable subpixel tips fail instead of rounding to one padded point", () => {
    expect(() => ready("line", { x: 0, y: 0 }, { x: 1e-20, y: 100 })).toThrow(/represented/);
    expect(() => ready("line", { x: 0, y: 0 }, { x: 100, y: 1e-20 })).toThrow(/represented/);
    // Distinct padded local tips can still lose almost half a real component.
    expect(() => ready("line", { x: 0, y: 0 }, { x: 100, y: 1e-16 })).toThrow(
      /represented accurately/,
    );
    expect(() => ready("line", { x: 0, y: 0 }, { x: 1e-16, y: 100 })).toThrow(
      /represented accurately/,
    );
  });
  test("source world angle is the sole paint transform and crossing never reorders tips", () => {
    for (const angle of [37, 90, 270]) {
      const begin = { x: 250, y: 130 },
        end = { x: 20, y: 40 };
      const route = ready("curvedConnector3", begin, end, angle);
      expect(route.paintLayout.angleDeg).toBe(angle);
      expect(route.begin).toEqual(begin);
      expect(route.end).toEqual(end);
      expectPaintTips(route, begin, end);
    }
  });
  test("ordinary non-cardinal rotation roundoff does not reject axis-aligned routes", () => {
    for (const angle of [13, 37, 73, 143, 323]) {
      for (const [begin, end] of [
        [
          { x: 10, y: 20 },
          { x: 110, y: 20 },
        ],
        [
          { x: 10, y: 20 },
          { x: 10, y: 120 },
        ],
      ] as const)
        expectPaintTips(ready("line", begin, end, angle), begin, end);
      const begin = shapeFrameLocalToWorld(carrier.rect, angle, { x: 0, y: 30 });
      const end = shapeFrameLocalToWorld(carrier.rect, angle, { x: 100, y: 30 });
      expectPaintTips(ready("bentConnector3", begin, end, angle), begin, end);
    }
  });
  test("coincident tips are typed degenerate, with no fake path/vector", () => {
    const route = resolveShapeConnectorRoute(
      { preset: "bentConnector3" },
      carrier,
      { x: 20, y: 30 },
      { x: 20, y: 30 },
    );
    expect(route).toEqual({ status: "degenerate", begin: { x: 20, y: 30 }, end: { x: 20, y: 30 } });
    expect(Object.isFrozen(route)).toBe(true);
  });
  test("invalid families, nonfinite values and oversized routes fail explicitly", () => {
    expect(() =>
      resolveShapeConnectorRoute({ preset: "rect" }, carrier, { x: 0, y: 0 }, { x: 10, y: 10 }),
    ).toThrow(/line preset/);
    expect(() => ready("line", { x: Infinity, y: 0 })).toThrow(/coordinate budget/);
    expect(() => ready("line", { x: 0, y: 0 }, { x: 16385, y: 10 })).toThrow(/render-extent/);
    expect(() => ready("line", { x: 0, y: 0 }, { x: 1, y: 1 }, Infinity)).toThrow(/angle/);
    expect(() =>
      resolveShapeConnectorRoute(
        { preset: "bentConnector3", adjustments: { adj1: 2147483648 } },
        carrier,
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ),
    ).toThrow();
  });
  test("returned geometry/layout is deeply immutable and detached", () => {
    const route = ready("curvedConnector3");
    for (const object of [
      route,
      route.begin,
      route.localEndpoints,
      route.geometry,
      route.geometry.paths,
      route.geometry.paths[0],
      route.geometry.paths[0]!.commands,
      route.geometry.paths[0]!.commands[0],
      route.geometry.handles[0],
      route.geometry.handles[0]!.fields,
      route.paintLayout,
      route.paintLayout.rect,
      route.worldBounds,
    ])
      expect(Object.isFrozen(object)).toBe(true);
    expect(carrier.rect).toEqual({ x: 0, y: 0, width: 100, height: 60 });
  });
});
