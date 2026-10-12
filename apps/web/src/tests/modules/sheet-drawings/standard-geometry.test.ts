// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  evaluateShapePreset,
  getShapePresetFillBounds,
  SHAPE_PRESET_NAMES,
  type EvaluatedShapePresetGeometry,
  type ShapePresetParameters,
} from "@sheetcraft/core/shape-presets";
import {
  getStandardShapeGeometry,
  getStandardShapeLocalBounds,
  getStandardShapeSvgPaths,
  getStandardShapeWorldBounds,
  moveStandardShapeAdjustment,
  STANDARD_SHAPE_GEOMETRY_LIMITS,
  standardShapeContainsLocalPoint,
  standardShapeContainsWorldPoint,
  standardShapeFillColor,
  standardShapeLocalToWorld,
  standardShapeWorldToLocal,
  type StandardShapeAppearance,
} from "../../../modules/sheet-drawings/shape-geometry";

const solid: StandardShapeAppearance = {
  fill: "#336699",
  stroke: "#123456",
  strokeWidth: 2,
};
const fillOnly = { ...solid, stroke: "transparent", strokeWidth: 0 };
const strokeOnly = { ...solid, fill: "transparent" };
const invisible = { ...solid, fill: "transparent", stroke: "transparent" };
function geometry(shape: ShapePresetParameters, width = 240, height = 160) {
  const result = getStandardShapeGeometry(shape, width, height);
  expect(result, `${shape.preset} at ${width}×${height}`).toBeDefined();
  return result!;
}
function checkUniformMapping(actual: EvaluatedShapePresetGeometry, shape: ShapePresetParameters) {
  const scale = Math.max(1, Math.max(actual.width, actual.height) / 10_000),
    expected = evaluateShapePreset(shape, actual.width / scale, actual.height / scale);
  expect(actual.paths).toHaveLength(expected.paths.length);
  expected.paths.forEach((path, pathIndex) => {
    expect(actual.paths[pathIndex]).toMatchObject({
      filled: path.filled,
      fillMode: path.fillMode,
      stroke: path.stroke,
    });
    path.commands.forEach((command, commandIndex) => {
      const mapped = actual.paths[pathIndex]!.commands[commandIndex]!;
      expect(mapped[0]).toBe(command[0]);
      command.slice(1).forEach((value, valueIndex) => {
        const index = valueIndex + 1;
        expect(mapped[index]).toBeCloseTo(
          (value as number) * (command[0] === "A" && index >= 5 ? 1 : scale),
          8,
        );
      });
    });
  });
  expect(actual.adjustments).toEqual(expected.adjustments);
  expected.handles.forEach((handle, index) => {
    expect(actual.handles[index]!.position.x).toBeCloseTo(handle.position.x * scale, 8);
    expect(actual.handles[index]!.position.y).toBeCloseTo(handle.position.y * scale, 8);
    expect(actual.handles[index]!.fields).toEqual(handle.fields);
  });
  if (expected.textRect) {
    for (const key of ["left", "top", "right", "bottom"] as const)
      expect(actual.textRect![key]).toBeCloseTo(expected.textRect[key] * scale, 8);
  } else expect(actual.textRect).toBeNull();
  expected.connectionSites.forEach((site, index) => {
    expect(actual.connectionSites[index]!.position.x).toBeCloseTo(site.position.x * scale, 8);
    expect(actual.connectionSites[index]!.position.y).toBeCloseTo(site.position.y * scale, 8);
    expect(actual.connectionSites[index]!.angle).toBe(site.angle);
  });
}

describe("standard shape evaluation boundary", () => {
  test("keeps actual rectangular aspect and short-side corner radii", () => {
    const rect = geometry({ preset: "rect" }, 400, 100);
    expect(getStandardShapeLocalBounds(rect, fillOnly)).toEqual({
      left: 0,
      top: 0,
      width: 400,
      height: 100,
    });
    const rounded = geometry({ preset: "roundRect" }, 400, 100);
    expect(rounded.handles[0]!.position.x).toBeCloseTo(16.667, 8);
    expect(rounded.handles[0]!.position.y).toBe(0);
    expect(
      rounded.paths[0]!.commands.filter((command) => command[0] === "A").every(
        (command) => command[1] === command[2],
      ),
    ).toBe(true);
    checkUniformMapping(rounded, { preset: "roundRect" });
  });

  test("evaluates every one of 187 standard defaults with complete metadata and SVG", () => {
    expect(SHAPE_PRESET_NAMES).toHaveLength(187);
    for (const preset of SHAPE_PRESET_NAMES) {
      const result = geometry({ preset }, 180, 120);
      expect(result.width, preset).toBe(180);
      expect(result.height, preset).toBe(120);
      expect(getStandardShapeSvgPaths(result), preset).toHaveLength(result.paths.length);
      expect(
        result.paths.every((path) => typeof path.fillMode === "string"),
        preset,
      ).toBe(true);
      expect(result.connectionSites, preset).toBeDefined();
      expect(Object.hasOwn(result, "textRect"), preset).toBe(true);
      expect(getStandardShapeLocalBounds(result, solid), preset).toBeDefined();
    }
  });

  test.each([
    [16_384, 16_384],
    [16_384, 997],
    [997, 16_384],
    [16_384, 1],
    [1, 16_384],
  ])("uses one common scale at the maximum drawing extents %s × %s", (width, height) => {
    for (const preset of [
      "roundRect",
      "ellipse",
      "rightArrow",
      "wedgeRectCallout",
      "cube",
    ] as const)
      checkUniformMapping(geometry({ preset }, width, height), { preset });
    expect(
      getStandardShapeLocalBounds(geometry({ preset: "rect" }, width, height), fillOnly),
    ).toEqual({ left: 0, top: 0, width, height });
  });

  test("all default presets stay within bounded flatten work at maximum square extents", () => {
    for (const preset of SHAPE_PRESET_NAMES) {
      const result = geometry({ preset }, 16_384, 16_384);
      expect(getStandardShapeSvgPaths(result).length, preset).toBeGreaterThan(0);
      expect(getStandardShapeLocalBounds(result, solid), preset).toBeDefined();
    }
  });

  test("returns explicit absence for missing, invalid or over-budget geometry", () => {
    expect(getStandardShapeGeometry(undefined, 240, 160)).toBeUndefined();
    for (const [width, height] of [
      [0, 1],
      [0.5, 1],
      [16_385, 1],
      [1, Infinity],
      [NaN, 1],
    ] as const)
      expect(getStandardShapeGeometry({ preset: "rect" }, width, height)).toBeUndefined();
    expect(
      getStandardShapeGeometry({ preset: "unknown" } as unknown as ShapePresetParameters, 240, 160),
    ).toBeUndefined();
    expect(
      getStandardShapeGeometry({ preset: "roundRect", adjustments: { adj: NaN } }, 240, 160),
    ).toBeUndefined();
    expect(
      getStandardShapeGeometry({ preset: "roundRect", adjustments: { other: 12 } }, 240, 160),
    ).toBeUndefined();
    expect(
      getStandardShapeGeometry(
        { preset: "wedgeRectCallout", adjustments: { adj1: 2_147_483_647 } },
        16_384,
        16_384,
      ),
    ).toBeUndefined();
    expect(getStandardShapeSvgPaths(undefined)).toEqual([]);
    expect(getStandardShapeLocalBounds(undefined, solid)).toBeUndefined();
    expect(standardShapeContainsLocalPoint(undefined, solid, { x: 120, y: 80 })).toBe(false);
  });

  test("rejects accessors without executing them", () => {
    let reads = 0;
    const input = Object.defineProperty({}, "preset", {
      get: () => {
        reads++;
        return "rect";
      },
      enumerable: true,
    });
    expect(getStandardShapeGeometry(input as ShapePresetParameters, 240, 160)).toBeUndefined();
    expect(reads).toBe(0);
  });

  test("LRU outputs detach and deeply freeze every coordinate and preserve canonical reuse", () => {
    const input = { preset: "roundRect" as const, adjustments: { adj: 20000 } };
    const first = geometry(input);
    input.adjustments.adj = 30000;
    const second = geometry(input);
    expect(first.adjustments.adj).toBe(20000);
    expect(second.adjustments.adj).toBe(30000);
    expect(geometry({ preset: "roundRect", adjustments: { adj: 20000 } })).toBe(first);
    for (const value of [
      first,
      first.paths,
      first.paths[0],
      first.paths[0]!.commands,
      first.paths[0]!.commands[0],
      first.handles,
      first.handles[0],
      first.handles[0]!.position,
      first.handles[0]!.fields,
      first.handles[0]!.fields[0],
      first.adjustments,
      first.textRect,
      first.connectionSites,
      first.connectionSites[0],
      first.connectionSites[0]!.position,
      getStandardShapeSvgPaths(first),
    ])
      expect(Object.isFrozen(value)).toBe(true);
    for (let index = 0; index < STANDARD_SHAPE_GEOMETRY_LIMITS.cache + 1; index++)
      geometry({ preset: "rect" }, 300 + index, 100);
    expect(geometry({ preset: "roundRect", adjustments: { adj: 20000 } })).not.toBe(first);
    // An evicted geometry still retained by its caller has valid weakly held hit data.
    expect(standardShapeContainsLocalPoint(first, fillOnly, { x: 120, y: 80 })).toBe(true);
  });
});

describe("visible standard shape paint and hits", () => {
  test("donut center holes remain transparent, independent of the outer frame", () => {
    const donut = geometry({ preset: "donut" }, 200, 120);
    expect(standardShapeContainsLocalPoint(donut, solid, { x: 100, y: 60 })).toBe(false);
    expect(standardShapeContainsLocalPoint(donut, fillOnly, { x: 190, y: 60 })).toBe(true);
    expect(standardShapeContainsLocalPoint(donut, fillOnly, { x: 1, y: 1 })).toBe(false);
    expect(standardShapeContainsLocalPoint(donut, invisible, { x: 190, y: 60 })).toBe(false);
    expect(getStandardShapeLocalBounds(donut, invisible)).toBeUndefined();
  });

  test("line shapes hit actual stroke distance rather than the diagonal frame", () => {
    const line = geometry({ preset: "line" }, 240, 120);
    expect(standardShapeContainsLocalPoint(line, strokeOnly, { x: 120, y: 60 })).toBe(true);
    expect(standardShapeContainsLocalPoint(line, strokeOnly, { x: 120, y: 61 })).toBe(true);
    expect(standardShapeContainsLocalPoint(line, strokeOnly, { x: 120, y: 63 })).toBe(false);
    expect(standardShapeContainsLocalPoint(line, strokeOnly, { x: 120, y: 10 })).toBe(false);
    expect(standardShapeContainsLocalPoint(line, fillOnly, { x: 120, y: 60 })).toBe(false);
    expect(getStandardShapeLocalBounds(line, fillOnly)).toBeUndefined();
    expect(
      standardShapeContainsLocalPoint(line, { ...strokeOnly, strokeWidth: 0 }, { x: 120, y: 60 }),
    ).toBe(false);
    expect(
      standardShapeContainsLocalPoint(line, { ...strokeOnly, stroke: "none" }, { x: 120, y: 60 }),
    ).toBe(false);
    expect(getStandardShapeLocalBounds(line, strokeOnly)).toEqual({
      left: -1,
      top: -1,
      width: 242,
      height: 122,
    });
  });

  test("none-fill paths paint only their declared open outline without an implicit closing stroke", () => {
    const connector = geometry({ preset: "bentConnector2" }, 240, 160);
    expect(getStandardShapeSvgPaths(connector)[0]).toMatchObject({
      fillMode: "none",
      filled: false,
      stroke: true,
    });
    expect(standardShapeContainsLocalPoint(connector, solid, { x: 120, y: 80 })).toBe(false);
    expect(standardShapeContainsLocalPoint(connector, solid, { x: 120, y: 0.5 })).toBe(true);
    expect(standardShapeContainsLocalPoint(connector, solid, { x: 239.5, y: 80 })).toBe(true);
    expect(getStandardShapeLocalBounds(connector, fillOnly)).toBeUndefined();
    expect(getStandardShapeLocalBounds(connector, strokeOnly)).toEqual({
      left: -1,
      top: -1,
      width: 242,
      height: 162,
    });
  });

  test("unfilled standard curves remain selectable only on their visible stroke", () => {
    const ellipse = geometry({ preset: "ellipse" }, 200, 120);
    expect(standardShapeContainsLocalPoint(ellipse, strokeOnly, { x: 100, y: 60 })).toBe(false);
    expect(standardShapeContainsLocalPoint(ellipse, strokeOnly, { x: 199.8, y: 60 })).toBe(true);
    expect(
      standardShapeContainsLocalPoint(
        ellipse,
        { ...strokeOnly, stroke: "transparent" },
        { x: 200, y: 60 },
      ),
    ).toBe(false);
    expect(getStandardShapeLocalBounds(ellipse, strokeOnly)).toEqual({
      left: expect.closeTo(-1, 10),
      top: expect.closeTo(-1, 10),
      width: expect.closeTo(202, 10),
      height: expect.closeTo(122, 10),
    });
  });

  test("callout tails keep visible bounds and hits beyond the body rectangle", () => {
    const callout = geometry({ preset: "wedgeRectCallout" });
    const tail = callout.handles[0]!.position;
    expect(tail.y).toBeGreaterThan(callout.height);
    const nearTip = {
      x: tail.x + (callout.width / 3 - tail.x) * 0.05,
      y: tail.y + (callout.height - tail.y) * 0.05,
    };
    expect(standardShapeContainsLocalPoint(callout, fillOnly, nearTip)).toBe(true);
    expect(getStandardShapeLocalBounds(callout, solid)!.height).toBeGreaterThan(callout.height);
    expect(standardShapeContainsLocalPoint(callout, invisible, nearTip)).toBe(false);
  });

  test("text creates a hit only for nonempty visible text inside its standard text rectangle", () => {
    const donut = geometry({ preset: "donut" }, 200, 120),
      center = { x: 100, y: 60 };
    expect(standardShapeContainsLocalPoint(donut, invisible, center)).toBe(false);
    expect(standardShapeContainsLocalPoint(donut, { ...invisible, text: "" }, center)).toBe(false);
    expect(standardShapeContainsLocalPoint(donut, { ...invisible, text: "  \n" }, center)).toBe(
      false,
    );
    expect(
      standardShapeContainsLocalPoint(
        donut,
        { ...invisible, text: "shape text", color: "#000000" },
        center,
      ),
    ).toBe(true);
    expect(
      standardShapeContainsLocalPoint(
        donut,
        { ...invisible, text: "shape text", color: "transparent" },
        center,
      ),
    ).toBe(false);
    expect(
      standardShapeContainsLocalPoint(donut, { ...invisible, text: "shape text" }, { x: 1, y: 1 }),
    ).toBe(false);
    expect(getStandardShapeLocalBounds(donut, { ...invisible, text: "shape text" })).toEqual({
      left: donut.textRect!.left,
      top: donut.textRect!.top,
      width: donut.textRect!.right - donut.textRect!.left,
      height: donut.textRect!.bottom - donut.textRect!.top,
    });
    expect(
      standardShapeContainsLocalPoint(
        geometry({ preset: "line" }),
        { ...invisible, text: "shape text" },
        center,
      ),
    ).toBe(false);
  });

  test("native curve bounds include Bezier extrema, not just endpoints", () => {
    const heart = geometry({ preset: "heart" }, 240, 160),
      bounds = getStandardShapeLocalBounds(heart, strokeOnly)!,
      nativeBounds = getShapePresetFillBounds(heart)!;
    expect(bounds).toEqual({
      left: expect.closeTo(nativeBounds.left - 1, 10),
      top: expect.closeTo(nativeBounds.top - 1, 10),
      width: expect.closeTo(nativeBounds.width + 2, 10),
      height: expect.closeTo(nativeBounds.height + 2, 10),
    });
    const endpointYs = heart.paths.flatMap((path) =>
      path.commands.flatMap((command) =>
        command[0] === "M" || command[0] === "L"
          ? [command[2]]
          : command[0] === "C"
            ? [command[6]]
            : [],
      ),
    );
    expect(bounds.top).toBeLessThan(Math.min(...endpointYs) - 1);
  });

  test("shaded SVG paths stay in native path order and preserve every paint flag", () => {
    const bevel = geometry({ preset: "bevel" });
    const paths = getStandardShapeSvgPaths(bevel);
    expect(paths.map((path) => path.fillMode)).toEqual([
      "norm",
      "lightenLess",
      "darkenLess",
      "lighten",
      "darken",
      "none",
    ]);
    expect(paths.every((path) => /^M[\d.-]/.test(path.d))).toBe(true);
    expect(standardShapeFillColor("#336699", "norm")).toBe("#336699");
    expect(standardShapeFillColor("#000000", "lighten")).toBe("#666666");
    expect(standardShapeFillColor("#000000", "lightenLess")).toBe("#333333");
    expect(standardShapeFillColor("#ffffff", "darken")).toBe("#999999");
    expect(standardShapeFillColor("#ffffff", "darkenLess")).toBe("#CCCCCC");
    expect(standardShapeFillColor("#336699", "none")).toBe("transparent");
    expect(standardShapeFillColor("transparent", "lighten")).toBe("transparent");
  });
});

describe("rotation and actual local adjustment coordinates", () => {
  test("rotates and inverses actual local points, with painted hits and out-of-frame tail bounds", () => {
    const callout = geometry({ preset: "wedgeRectCallout" }),
      frame = { x: 550, y: 375, width: 240, height: 160 };
    for (const local of [{ x: 120, y: 80 }, { x: 1, y: 1 }, callout.handles[0]!.position]) {
      const world = standardShapeLocalToWorld(frame, 37, local),
        restored = standardShapeWorldToLocal(frame, 37, world);
      expect(restored.x).toBeCloseTo(local.x, 10);
      expect(restored.y).toBeCloseTo(local.y, 10);
      expect(standardShapeContainsWorldPoint(callout, solid, frame, 37, world)).toBe(
        standardShapeContainsLocalPoint(callout, solid, local),
      );
      const bounds = getStandardShapeWorldBounds(callout, solid, frame, 37)!;
      expect(world.x).toBeGreaterThanOrEqual(bounds.x - 1e-8);
      expect(world.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-8);
      expect(world.y).toBeGreaterThanOrEqual(bounds.y - 1e-8);
      expect(world.y).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-8);
    }
    expect(standardShapeContainsWorldPoint(callout, solid, frame, NaN, { x: 100, y: 100 })).toBe(
      false,
    );
    expect(
      standardShapeContainsWorldPoint(callout, solid, { ...frame, width: 1 }, 37, {
        x: 100,
        y: 100,
      }),
    ).toBe(false);
    expect(getStandardShapeWorldBounds(callout, invisible, frame, 37)).toBeUndefined();
  });

  test.each([
    [400, 100],
    [16_384, 4096],
    [4096, 16_384],
  ])(
    "round radius edits use actual local coordinates at %s × %s without resizing",
    (width, height) => {
      const source = { preset: "roundRect" as const },
        target = { x: Math.min(width, height) * 0.4, y: 0 },
        moved = moveStandardShapeAdjustment(source, width, height, 0, target)!;
      expect(moved.adjustments!.adj).toBeCloseTo(40000, 2);
      const result = geometry(moved, width, height);
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.handles[0]!.position.x).toBeCloseTo(target.x, 3);
      expect(source).toEqual({ preset: "roundRect" });
    },
  );

  test("arrow handles edit shaft/head separately and callout tips can move outside every frame edge", () => {
    const arrow = { preset: "rightArrow" as const },
      before = geometry(arrow, 240, 140);
    const shaft = moveStandardShapeAdjustment(arrow, 240, 140, 0, { x: 0, y: 60 })!;
    const narrowed = geometry(shaft, 240, 140);
    expect(narrowed.handles[0]!.position.y).toBeCloseTo(60, 3);
    expect(narrowed.handles[1]!.position).toEqual(before.handles[1]!.position);
    const head = moveStandardShapeAdjustment(shaft, 240, 140, 1, { x: 125, y: 0 })!;
    expect(geometry(head, 240, 140).handles[1]!.position.x).toBeCloseTo(125, 3);
    const callout = { preset: "wedgeRectCallout" as const },
      target = { x: -2048, y: 7000 },
      moved = moveStandardShapeAdjustment(callout, 16_384, 4096, 0, target)!;
    const result = geometry(moved, 16_384, 4096);
    expect(result.handles[0]!.position.x).toBeCloseTo(target.x, 3);
    expect(result.handles[0]!.position.y).toBeCloseTo(target.y, 3);
    expect(getStandardShapeLocalBounds(result, solid)!.left).toBeLessThan(-2000);
    expect(getStandardShapeLocalBounds(result, solid)!.height).toBeGreaterThan(4096);
  });

  test("adjustment failures remain explicit and bounded", () => {
    const source = { preset: "roundRect" as const };
    for (const index of [-1, 1, 0.5, NaN])
      expect(moveStandardShapeAdjustment(source, 240, 160, index, { x: 40, y: 0 })).toBeUndefined();
    for (const target of [
      { x: Infinity, y: 0 },
      { x: 0, y: NaN },
      { x: 10_000_001, y: 0 },
    ])
      expect(moveStandardShapeAdjustment(source, 240, 160, 0, target)).toBeUndefined();
    expect(moveStandardShapeAdjustment(source, 16_385, 160, 0, { x: 40, y: 0 })).toBeUndefined();
    expect(
      moveStandardShapeAdjustment({ preset: "rect" }, 240, 160, 0, { x: 40, y: 0 }),
    ).toBeUndefined();
    const atLimit = moveStandardShapeAdjustment(source, 240, 160, 0, { x: 10000, y: 0 })!;
    expect(atLimit.adjustments!.adj).toBe(50000);
  });
});
