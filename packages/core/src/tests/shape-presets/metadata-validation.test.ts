import { afterEach, describe, expect, test } from "vitest";
import { evaluateShapePreset, type ShapePresetParameters } from "../../shape-presets.js";
import { SHAPE_PRESET_DEFINITIONS } from "../../shape-presets/definitions.js";
import type { ShapePresetDefinition } from "../../shape-presets/types.js";

const original = SHAPE_PRESET_DEFINITIONS.rect;
afterEach(() => {
  Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", original);
});
function replaceDefinition(fields: Record<string, unknown>): void {
  // Simulate corrupt compiled metadata, never expose a caller-provided definition API.
  Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", { ...original, ...fields });
}
const rect = () => evaluateShapePreset({ preset: "rect" }, 360, 240);

describe("standard metadata budgets and validation", () => {
  test("rejects invalid fill modes without silently treating them as filled paths", () => {
    replaceDefinition({ paths: [{ ...original.paths[0], fillMode: "invented" }] });
    expect(rect).toThrow("fill mode");
  });
  test("rejects excessive connection sites before evaluating their guide tokens", () => {
    replaceDefinition({
      connectionSites: Array.from({ length: 17 }, () => ({
        angle: "missing",
        position: ["missing", "missing"],
      })),
    });
    expect(rect).toThrow("work budget");
  });
  test("rejects malformed text/connection tuples and undeclared tokens", () => {
    replaceDefinition({ textRect: ["l", "t", "r"] });
    expect(rect).toThrow("text rectangle");
    replaceDefinition({ textRect: ["l", "t", "r", "__proto__"] });
    expect(rect).toThrow("unknown preset guide");
    replaceDefinition({ connectionSites: [{ angle: "0", position: ["w"] }] });
    expect(rect).toThrow("connection position");
    replaceDefinition({ connectionSites: [{ angle: "0", position: ["unknown", "h"] }] });
    expect(rect).toThrow("unknown preset guide");
    replaceDefinition({ connectionSites: [{ angle: "Infinity", position: ["w", "h"] }] });
    expect(rect).toThrow("unknown preset guide");
  });
  test("applies the unchanged logical-coordinate budget to text and connection positions", () => {
    replaceDefinition({ textRect: ["l", "t", "10000001", "b"] });
    expect(rect).toThrow("logical-coordinate budget");
    replaceDefinition({ connectionSites: [{ angle: "0", position: ["-10000001", "h"] }] });
    expect(rect).toThrow("logical-coordinate budget");
  });
  test("uses a separate signed angular budget and preserves empty/inverted source text rectangles", () => {
    replaceDefinition({
      textRect: ["r", "b", "l", "t"],
      connectionSites: [
        { angle: "-2147483647", position: ["l", "t"] },
        { angle: "2147483647", position: ["r", "b"] },
      ],
    });
    expect(rect().textRect).toEqual({ left: 360, top: 240, right: 0, bottom: 0 });
    expect(rect().connectionSites.map((site) => site.angle)).toEqual([
      -2_147_483_647, 2_147_483_647,
    ]);
    replaceDefinition({ connectionSites: [{ angle: "2147483648", position: ["l", "t"] }] });
    expect(rect).toThrow("angular budget");
    replaceDefinition({ connectionSites: [{ angle: "-2147483648", position: ["l", "t"] }] });
    expect(rect).toThrow("angular budget");
  });
  test("still rejects invalid inputs and extents above 10,000, including the drawing model's larger extent", () => {
    for (const extent of [0, -1, NaN, Infinity, 10000.001, 16384]) {
      expect(() => evaluateShapePreset({ preset: "rect" }, extent, 240)).toThrow("extents");
      expect(() => evaluateShapePreset({ preset: "rect" }, 360, extent)).toThrow("extents");
    }
    for (const input of [
      { preset: "unknown" },
      { preset: "ellipse", textRect: [0, 0, 1, 1] },
      { preset: "rightArrow", adjustments: { adj1: NaN } },
      { preset: "rightArrow", adjustments: { adj1: 2_147_483_648 } },
    ])
      expect(() => evaluateShapePreset(input as ShapePresetParameters, 360, 240)).toThrow();
  });
  test("supports zero-area source text rectangles without guessing substitute bounds", () => {
    const definition: ShapePresetDefinition = { ...original, textRect: ["hc", "vc", "hc", "vc"] };
    Reflect.set(SHAPE_PRESET_DEFINITIONS, "rect", definition);
    expect(rect().textRect).toEqual({ left: 180, top: 120, right: 180, bottom: 120 });
  });
});
