import { describe, expect, test } from "vitest";
import { sampleTextWarpBoundary } from "../../text-warps/sampling.js";
import { mapTextWarpBaselinePoint, mapTextWarpEnvelopePoint } from "../../text-warps/mapping.js";
import type { TextWarpMappingSource } from "../../text-warps/mapping.js";
import type { TextWarpPathCommand } from "../../text-warps/types.js";

const settings = { width: 200, height: 200, positionTolerance: 0.02, lengthTolerance: 0.001 };
const native: TextWarpMappingSource = {
  kind: "native-text",
  left: 10,
  top: 20,
  width: 100,
  height: 100,
};
const boundary = (commands: readonly TextWarpPathCommand[]) =>
  sampleTextWarpBoundary(commands, settings);
const horizontal = (y: number) =>
  boundary([
    ["M", 0, y],
    ["L", 100, y],
  ]);

describe("explicit native-source text-warp point mapping", () => {
  test("envelopes use each edge's independent directed arc fraction", () => {
    const top = horizontal(0);
    const bottom = boundary([
      ["M", 0, 100],
      ["L", 100, 100],
      ["L", 100, 300],
    ]);
    expect(top.length).toBe(100);
    expect(bottom.length).toBe(300);
    expect(mapTextWarpEnvelopePoint(top, bottom, native, { x: 60, y: 70 })).toEqual({
      x: 75,
      y: 75,
    });
    const reversed = boundary([
      ["M", 100, 0],
      ["L", 0, 0],
    ]);
    expect(mapTextWarpEnvelopePoint(reversed, horizontal(100), native, { x: 35, y: 20 })).toEqual({
      x: 75,
      y: 0,
    });
  });

  test("nonuniform curved parameterization is not substituted for arc length", () => {
    const top = boundary([
      ["M", 0, 0],
      ["Q", 0, 0, 100, 0],
    ]);
    const bottom = boundary([
      ["M", 0, 100],
      ["C", 0, 100, 0, 100, 200, 100],
    ]);
    const mapped = mapTextWarpEnvelopePoint(top, bottom, native, { x: 60, y: 70 })!;
    expect(mapped.x).toBeCloseTo(75, 2);
    expect(mapped.y).toBe(50);
  });

  test("native signed baseline distance follows the directed normal without stretching height", () => {
    const source: TextWarpMappingSource = {
      kind: "native-text",
      left: 0,
      top: 0,
      width: 50,
      height: 20,
    };
    const horizontalBaseline = horizontal(0);
    const verticalBaseline = boundary([
      ["M", 0, 0],
      ["L", 0, 100],
    ]);
    const reversed = boundary([
      ["M", 100, 0],
      ["L", 0, 0],
    ]);
    expect(mapTextWarpBaselinePoint(horizontalBaseline, source, { x: 25, y: 14 }, 10)).toEqual({
      x: 50,
      y: 4,
    });
    expect(mapTextWarpBaselinePoint(verticalBaseline, source, { x: 25, y: 14 }, 10)).toEqual({
      x: -4,
      y: 50,
    });
    expect(mapTextWarpBaselinePoint(reversed, source, { x: 25, y: 14 }, 10)).toEqual({
      x: 50,
      y: -4,
    });
    expect(mapTextWarpBaselinePoint(horizontalBaseline, source, { x: 25, y: 6 }, 10)).toEqual({
      x: 50,
      y: -4,
    });
    expect(() =>
      mapTextWarpBaselinePoint(horizontalBaseline, source, { x: 25, y: 14 }, 30),
    ).toThrow(RangeError);
  });

  test("curved baseline mapping preserves signed native height along its analytic normal", () => {
    const arc = boundary([
      ["M", 100, 0],
      ["A", 100, 100, 0, 0, 0, Math.PI / 2],
    ]);
    const result = mapTextWarpBaselinePoint(arc, native, { x: 60, y: 74 }, 70)!;
    expect(result.x).toBeCloseTo(96 / Math.sqrt(2), 5);
    expect(result.y).toBeCloseTo(96 / Math.sqrt(2), 5);
  });

  test("explicit overhang extrapolates open tangents and vertical fractions without clamping", () => {
    const top = horizontal(0);
    const bottom = horizontal(100);
    expect(() => mapTextWarpEnvelopePoint(top, bottom, native, { x: 60, y: 140 })).toThrow(
      RangeError,
    );
    expect(
      mapTextWarpEnvelopePoint(
        top,
        bottom,
        native,
        { x: 60, y: 140 },
        { extrapolation: { verticalAfter: 0.25 } },
      ),
    ).toEqual({ x: 50, y: 120 });
    expect(() => mapTextWarpEnvelopePoint(top, bottom, native, { x: 0, y: 70 })).toThrow(
      RangeError,
    );
    expect(
      mapTextWarpEnvelopePoint(
        top,
        bottom,
        native,
        { x: 0, y: 70 },
        { extrapolation: { horizontalBefore: 0.1 }, origin: { x: 5, y: 7 } },
      ),
    ).toEqual({ x: -5, y: 57 });
    const extended = mapTextWarpBaselinePoint(top, native, { x: 120, y: 75 }, 70, {
      extrapolation: { horizontalAfter: 0.1 },
    })!;
    expect(extended.x).toBeCloseTo(110, 10);
    expect(extended.y).toBe(5);
    expect(() =>
      mapTextWarpEnvelopePoint(
        top,
        bottom,
        native,
        { x: 0, y: 70 },
        { extrapolation: { horizontalBefore: 1.01 } },
      ),
    ).toThrow(RangeError);
  });

  test("constant envelope edges collapse explicitly; zero baselines and whitespace are transparent", () => {
    const constant = boundary([["M", 10, 20]]);
    expect(mapTextWarpEnvelopePoint(constant, horizontal(100), native, { x: 60, y: 70 })).toEqual({
      x: 30,
      y: 60,
    });
    expect(mapTextWarpEnvelopePoint(constant, constant, native, { x: 60, y: 70 })).toEqual({
      x: 10,
      y: 20,
    });
    expect(mapTextWarpBaselinePoint(constant, native, { x: 60, y: 70 }, 70)).toBeNull();
    expect(
      mapTextWarpEnvelopePoint(
        horizontal(0),
        horizontal(100),
        { kind: "whitespace" },
        { x: 0, y: 0 },
      ),
    ).toBeNull();
    expect(
      mapTextWarpBaselinePoint(horizontal(0), { kind: "whitespace" }, { x: 0, y: 0 }, 0),
    ).toBeNull();
    const cusp = boundary([
      ["M", 25, 0],
      ["Q", -25, 0, 25, 0],
    ]);
    expect(mapTextWarpBaselinePoint(cusp, native, { x: 60, y: 70 }, 70)).toBeNull();
  });

  test("mapping admits exact own finite data and validates nested records before property reads", () => {
    const top = horizontal(0);
    const bottom = horizontal(100);
    let getterCalls = 0;
    const getter = () => {
      getterCalls++;
      throw new Error("Getter must not execute.");
    };
    const accessorSource = Object.defineProperty({ ...native }, "width", { get: getter });
    const accessorPoint = Object.defineProperty({ x: 60, y: 70 }, "x", { get: getter });
    const accessorOverhang = Object.defineProperty({}, "verticalAfter", { get: getter });
    for (const source of [
      accessorSource,
      Object.create(native),
      { ...native, width: 0 },
      { ...native, height: 16_385 },
      { ...native, left: Infinity },
      { ...native, extra: 1 },
      { kind: "whitespace", width: 1 },
    ]) {
      expect(() =>
        mapTextWarpEnvelopePoint(top, bottom, source as TextWarpMappingSource, { x: 60, y: 70 }),
      ).toThrow();
    }
    expect(() => mapTextWarpEnvelopePoint(top, bottom, native, accessorPoint)).toThrow(TypeError);
    expect(() =>
      mapTextWarpEnvelopePoint(
        top,
        bottom,
        native,
        { x: 60, y: 70 },
        { extrapolation: accessorOverhang },
      ),
    ).toThrow(TypeError);
    expect(() => mapTextWarpEnvelopePoint(top, bottom, native, { x: NaN, y: 70 })).toThrow(
      RangeError,
    );
    expect(() =>
      mapTextWarpEnvelopePoint(
        top,
        bottom,
        native,
        { x: 60, y: 70 },
        { origin: { x: Infinity, y: 0 } },
      ),
    ).toThrow(RangeError);
    expect(() =>
      mapTextWarpEnvelopePoint(top, bottom, { ...native, [Symbol("extra")]: 1 }, { x: 60, y: 70 }),
    ).toThrow(TypeError);
    expect(getterCalls).toBe(0);
  });
});
