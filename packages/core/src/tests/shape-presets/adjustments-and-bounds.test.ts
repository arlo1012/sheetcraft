import { describe, expect, it } from "vitest";
import {
  SHAPE_PRESET_NAMES,
  evaluateShapePreset,
  getShapePresetFillBounds,
  moveShapePresetAdjustment,
} from "../../shape-presets.js";

describe("preset bounds and adjustment inverse", () => {
  it("computes source fill extents for arcs, braces and out-of-frame callout tails", () => {
    expect(getShapePresetFillBounds(evaluateShapePreset({ preset: "arc" }, 360, 240))).toEqual({
      left: expect.closeTo(180),
      top: expect.closeTo(0),
      width: expect.closeTo(180),
      height: expect.closeTo(120),
    });
    expect(
      getShapePresetFillBounds(evaluateShapePreset({ preset: "leftBrace" }, 360, 240)),
    ).toEqual({
      left: expect.closeTo(0),
      top: expect.closeTo(0),
      width: expect.closeTo(360),
      height: expect.closeTo(240),
    });
    const callout = getShapePresetFillBounds(
      evaluateShapePreset({ preset: "wedgeRectCallout" }, 360, 240),
    )!;
    expect(callout).toEqual({ left: 0, top: 0, width: 360, height: expect.closeTo(270) });
  });
  it("has bounded finite fill extents for all filled presets and none for connectors", () => {
    for (const preset of SHAPE_PRESET_NAMES) {
      const geometry = evaluateShapePreset({ preset }, 360, 240),
        bounds = getShapePresetFillBounds(geometry);
      if (geometry.paths.some((path) => path.filled)) {
        expect(bounds, preset).toBeDefined();
        expect(Object.values(bounds!).every(Number.isFinite), preset).toBe(true);
      } else expect(bounds, preset).toBeUndefined();
    }
  });
  it("uses exact quadratic, cubic and arc extrema instead of just control points", () => {
    const geometry = {
      width: 100,
      height: 100,
      handles: [],
      adjustments: {},
      paths: [
        {
          filled: true,
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["Q", 100, 100, 200, 0],
            ["C", 200, -100, 400, -100, 400, 0],
            ["Z"],
          ],
        },
      ],
    } as const;
    expect(getShapePresetFillBounds(geometry)).toEqual({
      left: 0,
      top: -75,
      width: 400,
      height: 125,
    });
  });
  it("rejects malformed paths and unbounded arc sweeps before bounds iteration", () => {
    const geometry = {
      width: 100,
      height: 100,
      handles: [],
      adjustments: {},
      paths: [{ filled: true, stroke: true, commands: [["A", 20, 20, 0, 0, 0, Infinity]] }],
    } as const;
    expect(() => getShapePresetFillBounds(geometry)).toThrow();
  });
  it("moves round-rectangle and both arrow handles independently with clamped limits", () => {
    const rounded = moveShapePresetAdjustment({ preset: "roundRect" }, 360, 240, 0, {
      x: 72,
      y: 99,
    });
    expect(rounded.adjustments?.adj).toBeCloseTo(30000, 4);
    const arrow = moveShapePresetAdjustment(
      { preset: "rightArrow", adjustments: { adj2: 80000 } },
      360,
      240,
      0,
      { x: 60, y: 72 },
    );
    expect(arrow.adjustments?.adj1).toBeCloseTo(40000, 4);
    expect(arrow.adjustments?.adj2).toBe(80000);
    const head = moveShapePresetAdjustment(arrow, 360, 240, 1, { x: 120, y: 999 });
    expect(head.adjustments?.adj2).toBeCloseTo(100000, 4);
    expect(head.adjustments?.adj1).toBeCloseTo(40000, 4);
    const clamped = moveShapePresetAdjustment({ preset: "roundRect" }, 360, 240, 0, {
      x: 9999,
      y: 0,
    });
    expect(clamped.adjustments?.adj).toBe(50000);
  });
  it("inverts polar angles and two-field callout handles without changing other adjustments", () => {
    const arc = moveShapePresetAdjustment({ preset: "arc" }, 360, 240, 0, { x: 360, y: 120 });
    expect(evaluateShapePreset(arc, 360, 240).handles[0]!.position).toEqual({
      x: expect.closeTo(360, 4),
      y: expect.closeTo(120, 4),
    });
    const callout = moveShapePresetAdjustment({ preset: "wedgeRectCallout" }, 360, 240, 0, {
      x: -36,
      y: 360,
    });
    expect(evaluateShapePreset(callout, 360, 240).handles[0]!.position).toEqual({
      x: expect.closeTo(-36, 4),
      y: expect.closeTo(360, 4),
    });
  });
  it("rejects invalid targets, handle indices and rectangle handles; never mutates input", () => {
    const shape = { preset: "rightArrow", adjustments: { adj1: 40000 } } as const;
    const snapshot = JSON.stringify(shape);
    moveShapePresetAdjustment(shape, 360, 240, 1, { x: 60, y: 0 });
    expect(JSON.stringify(shape)).toBe(snapshot);
    expect(() => moveShapePresetAdjustment(shape, 360, 240, 99, { x: 0, y: 0 })).toThrow();
    expect(() => moveShapePresetAdjustment(shape, 360, 240, 0.5, { x: 0, y: 0 })).toThrow();
    expect(() => moveShapePresetAdjustment(shape, 360, 240, 0, { x: NaN, y: 0 })).toThrow();
    expect(() =>
      moveShapePresetAdjustment({ preset: "rect" }, 360, 240, 0, { x: 0, y: 0 }),
    ).toThrow();
  });
});
