import { expect, test } from "vitest";
import {
  evaluateShapePreset,
  flattenShapePath,
  isPointInShapePreset,
  shapePresetPathToSvg,
  SHAPE_PRESET_NAMES,
} from "../../shape-presets.js";

test("all preset paths have bounded numeric-only SVG and hit-test polylines", () => {
  for (const preset of SHAPE_PRESET_NAMES) {
    const geometry = evaluateShapePreset({ preset }, 360, 240);
    for (const path of geometry.paths) {
      expect(
        flattenShapePath(path).flatMap((line) => line.points).length,
        preset,
      ).toBeLessThanOrEqual(4096);
      expect(shapePresetPathToSvg(path), preset).not.toMatch(/NaN|Infinity|undefined|<|>/u);
    }
  }
});
test("ellipse and arrow transparent corners do not intercept picture selection", () => {
  const ellipse = evaluateShapePreset({ preset: "ellipse" }, 360, 240),
    arrow = evaluateShapePreset({ preset: "rightArrow" }, 360, 240);
  expect(isPointInShapePreset(ellipse, { x: 180, y: 120 })).toBe(true);
  expect(isPointInShapePreset(ellipse, { x: 0, y: 0 })).toBe(false);
  expect(isPointInShapePreset(ellipse, { x: 360, y: 120 })).toBe(true);
  expect(isPointInShapePreset(arrow, { x: 10, y: 10 })).toBe(false);
  expect(isPointInShapePreset(arrow, { x: 10, y: 120 })).toBe(true);
  expect(isPointInShapePreset(arrow, { x: 340, y: 10 })).toBe(false);
  expect(isPointInShapePreset(arrow, { x: 340, y: 120 })).toBe(true);
});
test("donut winding preserves its transparent hole instead of treating every contour as solid", () => {
  const shape = evaluateShapePreset({ preset: "donut" }, 360, 240);
  expect(isPointInShapePreset(shape, { x: 180, y: 120 })).toBe(false);
  expect(isPointInShapePreset(shape, { x: 180, y: 10 })).toBe(true);
});
test("SVG ellipse splits a full turn into safe arcs and quadratics/cubics preserve their commands", () => {
  const ellipse = evaluateShapePreset({ preset: "ellipse" }, 360, 240);
  expect(shapePresetPathToSvg(ellipse.paths[0]!)).toMatch(/^M0 120A180 120/u);
  const smile = evaluateShapePreset({ preset: "smileyFace" }, 360, 240);
  expect(smile.paths.some((path) => shapePresetPathToSvg(path).includes("Q"))).toBe(true);
  expect(() => flattenShapePath(ellipse.paths[0]!, 0)).toThrow("tolerance");
});
