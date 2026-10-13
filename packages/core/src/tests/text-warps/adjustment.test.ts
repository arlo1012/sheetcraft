import { afterEach, describe, expect, test, vi } from "vitest";
import {
  TEXT_WARP_PRESET_NAMES,
  evaluateTextWarp,
  moveTextWarpAdjustment,
  normalizeShapeTextWarp,
  type ShapeTextWarp,
} from "../../text-warps.js";
import * as warpEvaluator from "../../text-warps/evaluate.js";
import * as shapeEvaluator from "../../shape-presets/evaluate.js";
import { evaluateShapePreset, moveShapePresetAdjustment } from "../../shape-presets.js";

afterEach(() => vi.restoreAllMocks());

function distance(
  warp: ShapeTextWarp,
  width: number,
  height: number,
  index: number,
  target: Readonly<{ x: number; y: number }>,
): number {
  const handle = evaluateTextWarp(warp, width, height).handles[index]!;
  const useX = handle.fields.some((field) => !field.disabled && field.axis !== "y"),
    useY = handle.fields.some((field) => !field.disabled && field.axis !== "x");
  return Math.hypot(
    useX ? handle.position.x - target.x : 0,
    useY ? handle.position.y - target.y : 0,
  );
}

function alternative(
  warp: ShapeTextWarp,
  width: number,
  height: number,
  index: number,
): ShapeTextWarp {
  const handle = evaluateTextWarp(warp, width, height).handles[index]!;
  return {
    preset: warp.preset,
    adjustments: {
      ...warp.adjustments,
      ...Object.fromEntries(
        handle.fields
          .filter((field) => !field.disabled)
          .map((field) => [
            field.name,
            field.minimum +
              (field.maximum - field.minimum) * (field.axis === "angle" ? 0.371 : 0.637),
          ]),
      ),
    },
  };
}

describe("standard text-warp adjustment inverse", () => {
  test.each(TEXT_WARP_PRESET_NAMES)(
    "keeps every %s default handle canonical and finite",
    (preset) => {
      for (const [width, height] of [
        [360, 240],
        [240, 360],
      ] as const) {
        const source = { preset },
          geometry = evaluateTextWarp(source, width, height);
        for (let index = 0; index < geometry.handles.length; index++) {
          const moved = moveTextWarpAdjustment(
            source,
            width,
            height,
            index,
            geometry.handles[index]!.position,
          );
          expect(moved).toEqual(source);
          expect(distance(moved, width, height, index, geometry.handles[index]!.position)).toBe(0);
        }
      }
    },
  );

  test.each(TEXT_WARP_PRESET_NAMES)(
    "reaches evaluated valid alternate targets for every %s handle",
    (preset) => {
      for (const [width, height] of [
        [360, 240],
        [240, 360],
      ] as const) {
        const source = { preset },
          geometry = evaluateTextWarp(source, width, height);
        for (let index = 0; index < geometry.handles.length; index++) {
          const known = alternative(source, width, height, index);
          const target = evaluateTextWarp(known, width, height).handles[index]!.position;
          const moved = moveTextWarpAdjustment(source, width, height, index, target);
          expect(moved.preset).toBe(preset);
          expect(
            distance(moved, width, height, index, target),
            `${preset}/${index}/${width}`,
          ).toBeLessThanOrEqual(1e-5);
          const result = evaluateTextWarp(moved, width, height).handles[index]!;
          for (const field of result.fields) {
            expect(Number.isFinite(field.value)).toBe(true);
            expect(field.value).toBeGreaterThanOrEqual(field.minimum);
            expect(field.value).toBeLessThanOrEqual(field.maximum);
          }
        }
      }
    },
  );

  test("preserves unrelated overrides, source objects, preset identity and shape bodies", () => {
    const shapeSpy = vi.spyOn(shapeEvaluator, "evaluateShapePreset");
    for (const [index, unrelated] of [
      [0, "adj2"],
      [1, "adj1"],
    ] as const) {
      const source = Object.freeze({
        preset: "textWave1" as const,
        adjustments: Object.freeze({ adj1: 17000, adj2: -3500 }),
      });
      const before = JSON.stringify(source);
      const known = alternative(source, 360, 240, index);
      const target = evaluateTextWarp(known, 360, 240).handles[index]!.position;
      const result = moveTextWarpAdjustment(source, 360, 240, index, target);
      expect(result.adjustments?.[unrelated]).toBe(source.adjustments[unrelated]);
      expect(result.preset).toBe("textWave1");
      expect(JSON.stringify(source)).toBe(before);
    }
    expect(shapeSpy).not.toHaveBeenCalled();
  });

  test("clamps declared ranges, ignores undeclared axes and normalizes sparse defaults", () => {
    expect(
      moveTextWarpAdjustment({ preset: "textPlain" }, 360, 240, 0, { x: 99999, y: -99999 }),
    ).toEqual({
      preset: "textPlain",
      adjustments: { adj: 70000 },
    });
    expect(
      moveTextWarpAdjustment({ preset: "textPlain", adjustments: { adj: 100000 } }, 360, 240, 0, {
        x: -99999,
        y: 0,
      }),
    ).toEqual({
      preset: "textPlain",
      adjustments: { adj: 30000 },
    });
    expect(
      moveTextWarpAdjustment({ preset: "textPlain", adjustments: { adj: 40000 } }, 360, 240, 0, {
        x: 180,
        y: 99999,
      }),
    ).toEqual({ preset: "textPlain" });
  });

  test("inverts angles near both ends of the declared turn without continuous projection", () => {
    for (const preset of ["textArchUp", "textArchDown", "textCircle", "textButton"] as const)
      for (const angle of [1, 17, 21599998, 16200000, 5400000]) {
        const known = { preset, adjustments: { adj: angle } };
        const target = evaluateTextWarp(known, 360, 240).handles[0]!.position;
        const result = moveTextWarpAdjustment({ preset }, 360, 240, 0, target);
        const actual = evaluateTextWarp(result, 360, 240).handles[0]!;
        expect(distance(result, 360, 240, 0, target), `${preset}/${angle}`).toBeLessThanOrEqual(
          1e-5,
        );
        expect(actual.fields[0]!.value).toBeGreaterThanOrEqual(0);
        expect(actual.fields[0]!.value).toBeLessThanOrEqual(21599999);
      }
  });

  test("escapes a collapsed polar radius and safely keeps an established singular source", () => {
    for (const preset of [
      "textArchUpPour",
      "textArchDownPour",
      "textCirclePour",
      "textButtonPour",
    ] as const) {
      const source = { preset, adjustments: { adj1: 6500000, adj2: 0 } };
      const known = { preset, adjustments: { adj1: 7310000, adj2: 63000 } };
      const target = evaluateTextWarp(known, 360, 240).handles[0]!.position;
      const result = moveTextWarpAdjustment(source, 360, 240, 0, target);
      expect(distance(result, 360, 240, 0, target), preset).toBeLessThanOrEqual(1e-5);
      const center = evaluateTextWarp(source, 360, 240).handles[0]!.position;
      expect(moveTextWarpAdjustment(source, 360, 240, 0, center)).toEqual(source);
    }
  });

  test("verifies dynamic ranges after clamping and does not write disabled fields", () => {
    const actual = warpEvaluator.evaluateTextWarp;
    vi.spyOn(warpEvaluator, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      return {
        ...geometry,
        handles: geometry.handles.map((handle) => ({
          ...handle,
          fields: handle.fields.map((field) => ({
            ...field,
            ...(field.name === "adj1"
              ? { minimum: 3000, maximum: 1000, disabled: true }
              : { maximum: 20000 }),
          })),
        })),
      };
    });
    const source = {
      preset: "textArchUpPour" as const,
      adjustments: { adj1: 9000000, adj2: 50000 },
    };
    const result = moveTextWarpAdjustment(source, 360, 240, 0, { x: 99999, y: 99999 });
    expect(result.adjustments?.adj1).toBe(9000000);
    expect(result.adjustments?.adj2).toBeGreaterThanOrEqual(0);
    expect(result.adjustments?.adj2).toBeLessThanOrEqual(20000);
    vi.restoreAllMocks();
    vi.spyOn(warpEvaluator, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      return {
        ...geometry,
        handles: geometry.handles.map((handle) => ({
          ...handle,
          fields: handle.fields.map((field) => ({ ...field, disabled: true })),
        })),
      };
    });
    expect(moveTextWarpAdjustment(source, 360, 240, 0, { x: 10, y: 20 })).toEqual(
      normalizeShapeTextWarp(source),
    );
  });

  test("re-evaluates a narrowing polar interval without touching another handle", () => {
    const actual = warpEvaluator.evaluateTextWarp;
    const known = {
      preset: "textArchUpPour" as const,
      adjustments: { adj1: 1234567, adj2: 15000 },
    };
    const target = actual(known, 360, 240).handles[0]!.position;
    let narrowed = 0;
    vi.spyOn(warpEvaluator, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      const maximum = geometry.adjustments.adj1! < 5400000 ? 20000 : 100000;
      if (geometry.adjustments.adj2! > maximum) narrowed++;
      return {
        ...geometry,
        handles: geometry.handles.map((handle) => ({
          ...handle,
          fields: handle.fields.map((field) => ({
            ...field,
            ...(field.name === "adj2" ? { maximum } : {}),
          })),
        })),
      };
    });
    const result = moveTextWarpAdjustment({ preset: "textArchUpPour" }, 360, 240, 0, target);
    expect(narrowed).toBeGreaterThan(0);
    expect(distance(result, 360, 240, 0, target)).toBeLessThanOrEqual(1e-5);
    const handle = warpEvaluator.evaluateTextWarp(result, 360, 240).handles[0]!;
    for (const field of handle.fields) {
      expect(field.value).toBeGreaterThanOrEqual(field.minimum);
      expect(field.value).toBeLessThanOrEqual(field.maximum);
    }
  });

  test("counts actual geometry evaluations, including repeated dynamic-range resolution", () => {
    const actual = warpEvaluator.evaluateTextWarp;
    let calls = 0;
    vi.spyOn(warpEvaluator, "evaluateTextWarp").mockImplementation((input, width, height) => {
      calls++;
      const geometry = actual(input, width, height);
      if (calls === 1) return geometry;
      return {
        ...geometry,
        handles: geometry.handles.map((handle) => ({
          ...handle,
          position: {
            x: 1000 - calls + geometry.adjustments.adj1! * 1e-8,
            y: 1000 - calls + geometry.adjustments.adj2! * 1e-6,
          },
          fields: handle.fields.map((field) => ({
            ...field,
            ...(field.name === "adj2" && (calls - 2) % 8 !== 7
              ? { maximum: Math.max(field.minimum, field.value - calls * 0.000001) }
              : {}),
          })),
        })),
      };
    });
    const result = moveTextWarpAdjustment({ preset: "textArchUpPour" }, 360, 240, 0, {
      x: 0,
      y: 0,
    });
    expect(calls).toBe(512);
    expect(result.preset).toBe("textArchUpPour");
    expect(Object.values(result.adjustments ?? {}).every(Number.isFinite)).toBe(true);
  });

  test("rejects invalid identities, inherited/accessor/formula payloads without executing them", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        return "textPlain";
      },
    };
    const badWarp = Object.defineProperty({}, "preset", getter);
    const badAdjustments = Object.defineProperty({}, "adj", getter);
    for (const input of [
      undefined,
      null,
      {},
      [],
      { preset: "textNoShape" },
      { preset: "rect" },
      {
        preset: "textPlain",
        formula: () => {
          reads++;
        },
      },
      { preset: "textPlain", adjustments: { bogus: 1 } },
      { preset: "textPlain", adjustments: { adj: NaN } },
      { preset: "textPlain", adjustments: { adj: Infinity } },
      { preset: "textPlain", adjustments: { adj: 2147483648 } },
      { preset: "textPlain", adjustments: badAdjustments },
      Object.create({ preset: "textPlain" }),
      badWarp,
    ])
      expect(() =>
        moveTextWarpAdjustment(input as ShapeTextWarp, 360, 240, 0, { x: 10, y: 20 }),
      ).toThrow();
    const badTarget = Object.defineProperty({ y: 0 }, "x", getter);
    for (const target of [
      null,
      undefined,
      [],
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
      { x: 10000001, y: 0 },
      Object.create({ x: 0, y: 0 }),
      badTarget,
      {
        x: 0,
        y: 0,
        formula: () => {
          reads++;
        },
      },
    ])
      expect(() =>
        moveTextWarpAdjustment(
          { preset: "textPlain" },
          360,
          240,
          0,
          target as { x: number; y: number },
        ),
      ).toThrow();
    expect(reads).toBe(0);
  });

  test("rejects invalid extents, unknown indices and unusable evaluated math", () => {
    for (const extent of [0, -1, NaN, Infinity, 16384.001]) {
      expect(() =>
        moveTextWarpAdjustment({ preset: "textPlain" }, extent, 240, 0, { x: 0, y: 0 }),
      ).toThrow();
      expect(() =>
        moveTextWarpAdjustment({ preset: "textPlain" }, 360, extent, 0, { x: 0, y: 0 }),
      ).toThrow();
    }
    for (const index of [-1, 0.5, NaN, Infinity, 1, 100, Number.MAX_SAFE_INTEGER + 1])
      expect(() =>
        moveTextWarpAdjustment({ preset: "textPlain" }, 360, 240, index, { x: 0, y: 0 }),
      ).toThrow("handle");
    const actual = warpEvaluator.evaluateTextWarp;
    vi.spyOn(warpEvaluator, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      return {
        ...geometry,
        handles: geometry.handles.map((handle) => ({
          ...handle,
          fields: handle.fields.map((field) => ({ ...field, maximum: Infinity })),
        })),
      };
    });
    expect(() =>
      moveTextWarpAdjustment({ preset: "textPlain" }, 360, 240, 0, { x: 0, y: 0 }),
    ).toThrow("finite");
  });

  test("shared numeric extraction retains ordinary shape XY, polar and independent-field inverses", () => {
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
    expect(() =>
      moveShapePresetAdjustment({ preset: "rect" }, 360, 240, 0, { x: 0, y: 0 }),
    ).toThrow();
  });
});
