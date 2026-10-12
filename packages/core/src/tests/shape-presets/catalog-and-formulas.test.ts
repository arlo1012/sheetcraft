import { describe, expect, test } from "vitest";
import {
  SHAPE_PRESET_NAMES,
  evaluateShapePreset,
  isShapePresetName,
  normalizePictureCropShape,
} from "../../shape-presets.js";
import { evaluateShapeGuide, shapeGuideVariables } from "../../shape-presets/formula.js";

describe("pinned DrawingML crop geometry", () => {
  test("all 187 identities evaluate finite paths and actual handles across portrait, landscape and extreme aspect ratios", () => {
    expect(SHAPE_PRESET_NAMES).toHaveLength(187);
    expect(new Set(SHAPE_PRESET_NAMES).size).toBe(187);
    expect(SHAPE_PRESET_NAMES).toContain("upArrow");
    for (const preset of SHAPE_PRESET_NAMES)
      for (const [width, height] of [
        [360, 240],
        [240, 360],
        [1, 1],
        [10000, 1],
        [1, 10000],
      ]) {
        const shape = evaluateShapePreset({ preset }, width!, height!);
        expect(shape.paths.length, preset).toBeGreaterThan(0);
        for (const path of shape.paths)
          for (const command of path.commands)
            for (const value of command.slice(1))
              expect(Number.isFinite(value), `${preset} ${width}/${height}`).toBe(true);
        for (const handle of shape.handles)
          expect(
            Number.isFinite(handle.position.x) && Number.isFinite(handle.position.y),
            preset,
          ).toBe(true);
      }
  });
  test("ellipse arc segments close precisely and preserve its actual local extents", () => {
    const geometry = evaluateShapePreset({ preset: "ellipse" }, 360, 240),
      path = geometry.paths[0]!;
    expect(path.commands[0]).toEqual(["M", 0, 120]);
    expect(path.commands.filter((command) => command[0] === "A")).toHaveLength(4);
    for (const command of path.commands)
      if (command[0] === "A") {
        expect(command[1]).toBe(180);
        expect(command[2]).toBe(120);
        expect(command[3]).toBeCloseTo(180, 10);
        expect(command[4]).toBeCloseTo(120, 10);
        expect(command[6] - command[5]).toBeCloseTo(Math.PI / 2, 10);
      }
  });
  test("rounded rectangle and arrow expose the standard independent adjustment handles", () => {
    expect(evaluateShapePreset({ preset: "roundRect" }, 360, 240).handles).toHaveLength(1);
    const arrow = evaluateShapePreset({ preset: "rightArrow" }, 360, 240);
    expect(arrow.handles).toHaveLength(2);
    expect(arrow.handles[0]!.fields[0]!.name).toBe("adj1");
    expect(arrow.handles[1]!.fields[0]!.name).toBe("adj2");
    expect(arrow.handles[1]!.position.x).toBe(240);
    const thin = evaluateShapePreset(
      { preset: "rightArrow", adjustments: { adj1: 25000 } },
      360,
      240,
    );
    expect(thin.handles[0]!.position.y).toBe(90);
    expect(thin.handles[1]!.position).toEqual(arrow.handles[1]!.position);
  });
  test("formula operators are deterministic and reject unknown operations, arguments and arity", () => {
    const vars = shapeGuideVariables(360, 240);
    expect(evaluateShapeGuide(["*/", "w", "1", "2"], vars)).toBe(180);
    expect(evaluateShapeGuide(["mod", "3", "4", "0"], vars)).toBe(5);
    expect(evaluateShapeGuide(["at2", "-1", "0"], vars)).toBe(10_800_000);
    expect(evaluateShapeGuide(["cos", "w", "cd4"], vars)).toBeCloseTo(0, 10);
    expect(evaluateShapeGuide(["?:", "0", "1", "2"], vars)).toBe(2);
    expect(() => evaluateShapeGuide(["eval", "1", "2", "3"], vars)).toThrow("operator");
    expect(() => evaluateShapeGuide(["val", "globalThis"], vars)).toThrow("unknown");
    expect(() => evaluateShapeGuide(["+-", "1", "2"], vars)).toThrow("arity");
  });
  test("sparse shape normalization clones declared finite adjustments and keeps plain rectangles unchanged", () => {
    expect(normalizePictureCropShape({ preset: "rect" })).toBeUndefined();
    expect(
      normalizePictureCropShape({ preset: "rightArrow", adjustments: { adj1: 50000 } }),
    ).toEqual({ preset: "rightArrow" });
    const original = { preset: "rightArrow" as const, adjustments: { adj1: 25000, adj2: 20000 } };
    const copy = normalizePictureCropShape(original)!;
    original.adjustments.adj1 = 0;
    expect(copy.adjustments?.adj1).toBe(25000);
    expect(isShapePresetName("__proto__")).toBe(false);
    expect(() =>
      normalizePictureCropShape({ preset: "ellipse", adjustments: { arbitrary: 1 } }),
    ).toThrow("Unknown");
    expect(() =>
      normalizePictureCropShape({ preset: "rightArrow", adjustments: { adj1: Infinity } }),
    ).toThrow("finite");
    const access = Object.defineProperty({ preset: "ellipse" as const }, "adjustments", {
      get() {
        throw new Error("must not run");
      },
    });
    expect(() => normalizePictureCropShape(access)).toThrow("accessors");
    expect(() => evaluateShapePreset({ preset: "ellipse" }, 0, 240)).toThrow("extents");
  });
});
