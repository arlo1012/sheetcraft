import { afterEach, describe, expect, test } from "vitest";
import {
  SHAPE_PRESET_DISPLAY_SIZE_LIMITS,
  SHAPE_PRESET_NAMES,
  evaluateShapePreset,
  evaluateShapePresetAtDisplaySize,
  type EvaluatedShapePresetGeometry,
  type ShapePathCommand,
} from "../../shape-presets.js";
import { SHAPE_PRESET_DEFINITIONS } from "../../shape-presets/definitions.js";
import type { ShapePresetDefinition } from "../../shape-presets/types.js";

const originalRect = SHAPE_PRESET_DEFINITIONS.rect;
afterEach(() => {
  Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", originalRect);
});

/** The existing Web adapter's value transform, independent of output freezing. */
function scaledGeometry(
  geometry: EvaluatedShapePresetGeometry,
  width: number,
  height: number,
  scale: number,
): EvaluatedShapePresetGeometry {
  const point = ({ x, y }: Readonly<{ x: number; y: number }>) => ({
    x: x * scale || 0,
    y: y * scale || 0,
  });
  return {
    width,
    height,
    paths: geometry.paths.map((path) => ({
      ...path,
      commands: path.commands.map(
        (command) =>
          command.map((value, index) =>
            index === 0 || (command[0] === "A" && index >= 5)
              ? value
              : (value as number) * scale || 0,
          ) as unknown as ShapePathCommand,
      ),
    })),
    handles: geometry.handles.map((handle) => ({ ...handle, position: point(handle.position) })),
    adjustments: { ...geometry.adjustments },
    textRect: geometry.textRect
      ? {
          left: geometry.textRect.left * scale || 0,
          top: geometry.textRect.top * scale || 0,
          right: geometry.textRect.right * scale || 0,
          bottom: geometry.textRect.bottom * scale || 0,
        }
      : null,
    connectionSites: geometry.connectionSites.map((site) => ({
      position: point(site.position),
      angle: site.angle,
    })),
  };
}

function expectDeeplyFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested);
}

describe("preset evaluation at actual display size", () => {
  test("exports frozen display budgets and rejects invalid extents on either axis", () => {
    expect(SHAPE_PRESET_DISPLAY_SIZE_LIMITS).toEqual({
      extent: 16_384,
      evaluatorExtent: 10_000,
      coordinate: 10_000_000,
    });
    expect(Object.isFrozen(SHAPE_PRESET_DISPLAY_SIZE_LIMITS)).toBe(true);
    for (const extent of [0, -0, -1, NaN, Infinity, -Infinity, 16_384.001]) {
      expect(() => evaluateShapePresetAtDisplaySize(undefined, extent, 240)).toThrow(RangeError);
      expect(() => evaluateShapePresetAtDisplaySize(undefined, 360, extent)).toThrow(RangeError);
    }
    expect(evaluateShapePresetAtDisplaySize(undefined, 16_384, 16_384).textRect).toEqual({
      left: 0,
      top: 0,
      right: 16_384,
      bottom: 16_384,
    });
    expect(() => evaluateShapePreset(undefined, 16_384, 240)).toThrow("extents");
    expect(() => evaluateShapePreset(undefined, 360, 10_000.001)).toThrow("extents");
  });

  test("preserves all low-level values at evaluator-sized frames, including default rect", () => {
    for (const preset of SHAPE_PRESET_NAMES)
      for (const [width, height] of [
        [360, 240],
        [240, 360],
        [10_000, 1],
        [1, 10_000],
      ] as const)
        expect(evaluateShapePresetAtDisplaySize({ preset }, width, height), preset).toEqual(
          evaluateShapePreset({ preset }, width, height),
        );
    expect(evaluateShapePresetAtDisplaySize(undefined, 360, 240)).toEqual(
      evaluateShapePreset(undefined, 360, 240),
    );
  });

  test("matches the existing display transform for every preset in both large orientations", () => {
    const scale = 16_384 / 10_000;
    for (const preset of SHAPE_PRESET_NAMES)
      for (const [width, height] of [
        [16_384, 4096],
        [4096, 16_384],
      ] as const) {
        const evaluated = evaluateShapePreset({ preset }, width / scale, height / scale);
        expect(evaluateShapePresetAtDisplaySize({ preset }, width, height), preset).toEqual(
          scaledGeometry(evaluated, width, height, scale),
        );
      }
  });

  test("uses a common scale for shortest/longest sides and aspect-dependent adjustment guides", () => {
    const rounded = evaluateShapePresetAtDisplaySize(
      { preset: "roundRect", adjustments: { adj: 25_000 } },
      16_384,
      4096,
    );
    expect(rounded.handles[0]!.position).toEqual({ x: 1024, y: 0 });
    const corner = rounded.paths[0]!.commands.find((command) => command[0] === "A")!;
    expect(corner.slice(1, 3)).toEqual([1024, 1024]);
    const arrow = evaluateShapePresetAtDisplaySize(
      { preset: "rightArrow", adjustments: { adj1: 40_000, adj2: 150_000 } },
      16_384,
      4096,
    );
    expect(arrow.handles[1]!.position).toEqual({ x: 10_240, y: 0 });
    expect(arrow.handles[1]!.fields[0]!.maximum).toBe(400_000);

    // The pinned catalog currently has no ls consumer; isolate both guide variables here.
    const definition: ShapePresetDefinition = {
      ...originalRect,
      paths: [{ fillMode: "none", stroke: true, commands: [["moveTo", "ss", "ls"]] }],
    };
    Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", definition);
    expect(evaluateShapePresetAtDisplaySize(undefined, 16_384, 4096).paths[0]!.commands).toEqual([
      ["M", 4096, 16_384],
    ]);
    expect(evaluateShapePresetAtDisplaySize(undefined, 4096, 16_384).paths[0]!.commands).toEqual([
      ["M", 4096, 16_384],
    ]);
  });

  test("scales arc dimensions and centers while retaining angles, field values and input ownership", () => {
    const adjustments = { adj1: 0, adj2: 16_200_000 };
    const input = { preset: "arc" as const, adjustments };
    const snapshot = JSON.stringify(input);
    const scale = 16_384 / 10_000;
    const evaluated = evaluateShapePreset(input, 10_000, 4096 / scale);
    const displayed = evaluateShapePresetAtDisplaySize(input, 16_384, 4096);
    expect(displayed).toEqual(scaledGeometry(evaluated, 16_384, 4096, scale));
    const sourceArc = evaluated.paths[0]!.commands.find((command) => command[0] === "A")!;
    const displayArc = displayed.paths[0]!.commands.find((command) => command[0] === "A")!;
    expect(displayArc.slice(1, 5)).toEqual(
      sourceArc.slice(1, 5).map((value) => (value as number) * scale || 0),
    );
    expect(displayArc.slice(5)).toEqual(sourceArc.slice(5));
    expect(displayed.handles.map((handle) => handle.fields)).toEqual(
      evaluated.handles.map((handle) => handle.fields),
    );
    expect(displayed.connectionSites.map((site) => site.angle)).toEqual([
      -5_400_000, 8_100_000, 21_600_000,
    ]);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(displayed.adjustments).not.toBe(input.adjustments);
    expect(Object.isFrozen(input.adjustments)).toBe(false);
    adjustments.adj2 = 5_400_000;
    expect(displayed.adjustments.adj2).toBe(16_200_000);
    expectDeeplyFrozen(displayed);
  });

  test("retains ordered shading/sites, actual text guides, and null text metadata in frozen output", () => {
    const bevel = evaluateShapePresetAtDisplaySize({ preset: "bevel" }, 16_384, 4096);
    expect(bevel.paths.map((path) => path.fillMode)).toEqual([
      "norm",
      "lightenLess",
      "darkenLess",
      "lighten",
      "darken",
      "none",
    ]);
    expectDeeplyFrozen(bevel);
    const rect = evaluateShapePresetAtDisplaySize(undefined, 16_384, 4096);
    expect(rect.connectionSites).toEqual([
      { position: { x: 8192, y: 0 }, angle: 16_200_000 },
      { position: { x: 0, y: 2048 }, angle: 10_800_000 },
      { position: { x: 8192, y: 4096 }, angle: 5_400_000 },
      { position: { x: 16_384, y: 2048 }, angle: 0 },
    ]);
    const decision = evaluateShapePresetAtDisplaySize(
      { preset: "flowChartDecision" },
      16_384,
      4096,
    );
    expect(decision.textRect).toEqual({ left: 4096, top: 1024, right: 12_288, bottom: 3072 });
    const line = evaluateShapePresetAtDisplaySize({ preset: "line" }, 16_384, 4096);
    expect(line.textRect).toBeNull();
    expectDeeplyFrozen(line);
  });

  test("applies the coordinate budget after scaling paths, handles, text and connection sites", () => {
    const coordinate = "10000000";
    for (const fields of [
      { paths: [{ fillMode: "none", stroke: true, commands: [["moveTo", coordinate, "0"]] }] },
      { handles: [{ kind: "ahXY", fields: {}, position: [coordinate, "0"] }] },
      { textRect: ["0", "0", coordinate, "0"] },
      { connectionSites: [{ angle: "3cd4", position: [coordinate, "0"] }] },
    ]) {
      Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", { ...originalRect, ...fields });
      expect(() => evaluateShapePreset(undefined, 10_000, 2500)).not.toThrow();
      expect(() => evaluateShapePresetAtDisplaySize(undefined, 16_384, 4096)).toThrow(
        "local-coordinate budget",
      );
    }
  });
});
