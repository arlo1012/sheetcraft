import { describe, expect, test } from "vitest";
import {
  sampleTextWarpBoundary,
  sampleTextWarpBoundaries,
  sampleTextWarpFraction,
  TextWarpSamplingError,
} from "../../text-warps/sampling.js";
import type { TextWarpSamplingOptions } from "../../text-warps/sampling.js";
import type { TextWarpBoundary, TextWarpPathCommand } from "../../text-warps/types.js";

const settings: TextWarpSamplingOptions = {
  width: 200,
  height: 200,
  positionTolerance: 0.02,
  lengthTolerance: 0.001,
};
const line = (x0: number, y0: number, x1: number, y1: number): readonly TextWarpPathCommand[] => [
  ["M", x0, y0],
  ["L", x1, y1],
];
function failure(action: () => unknown, reason: TextWarpSamplingError["reason"]): void {
  try {
    action();
    throw new Error("Expected bounded sampling failure.");
  } catch (error) {
    expect(error).toBeInstanceOf(TextWarpSamplingError);
    expect((error as TextWarpSamplingError).reason).toBe(reason);
  }
}
/** Independent composite Simpson integral, unrelated to the production subdivision. */
function ellipseLength(rx: number, ry: number, start: number, sweep: number, t = 1): number {
  const intervals = 2_048;
  const step = t / intervals;
  const speed = (parameter: number) =>
    Math.abs(sweep) *
    Math.hypot(rx * Math.sin(start + sweep * parameter), ry * Math.cos(start + sweep * parameter));
  let sum = speed(0) + speed(t);
  for (let index = 1; index < intervals; index++)
    sum += (index % 2 === 0 ? 2 : 4) * speed(index * step);
  return (sum * step) / 3;
}

describe("bounded directed text-warp arc-length sampling", () => {
  test.each([
    [0, 0, 100, 0, 25, 0, 1, 0],
    [0, 0, 0, 100, 0, 25, 0, 1],
    [100, 0, 0, 0, 75, 0, -1, 0],
  ])("samples directed line %s,%s -> %s,%s", (x0, y0, x1, y1, x, y, dx, dy) => {
    const boundary = sampleTextWarpBoundary(line(x0!, y0!, x1!, y1!), settings);
    expect(boundary.length).toBe(100);
    expect(boundary.samples).toHaveLength(2);
    expect(boundary.work.positionEvaluations).toBe(1);
    expect(boundary.positionErrorBound).toBeLessThanOrEqual(settings.positionTolerance);
    expect(sampleTextWarpFraction(boundary, 0.25)).toMatchObject({
      position: { x, y },
      tangent: { x: dx, y: dy },
    });
    expect(boundary.work.numericBytes).toBeLessThan(1_048_576);
    expect(Object.isFrozen(boundary)).toBe(true);
    expect(Object.isFrozen(boundary.samples[0]!.position)).toBe(true);
  });

  test("nonuniform straight quadratic and cubic use arc distance rather than raw parameter", () => {
    const quadratic = sampleTextWarpBoundary(
      [
        ["M", 0, 0],
        ["Q", 0, 0, 100, 0],
      ],
      settings,
    );
    const cubic = sampleTextWarpBoundary(
      [
        ["M", 0, 0],
        ["C", 0, 0, 0, 0, 100, 0],
      ],
      settings,
    );
    const q = sampleTextWarpFraction(quadratic, 0.5);
    const c = sampleTextWarpFraction(cubic, 0.5);
    expect(Math.abs(q.position.x - 50)).toBeLessThanOrEqual(quadratic.positionErrorBound + 1e-10);
    expect(Math.abs(c.position.x - 50)).toBeLessThanOrEqual(cubic.positionErrorBound + 1e-10);
    expect(q.parameter).toBeCloseTo(Math.sqrt(0.5), 3);
    expect(c.parameter).toBeCloseTo(Math.cbrt(0.5), 3);
    expect(sampleTextWarpFraction(quadratic, 0).tangent).toEqual({ x: 1, y: 0 });
    expect(quadratic.length).toBe(100);
    expect(cubic.length).toBe(100);
    expect(quadratic.work.positionEvaluations).toBe(quadratic.samples.length - 1);
    expect(cubic.work.positionEvaluations).toBe(cubic.samples.length - 1);
  });

  test("curved quadratic and cubic converge with explicit conservative bounds", () => {
    const quadratic = sampleTextWarpBoundary(
      [
        ["M", 0, 0],
        ["Q", 50, 100, 100, 0],
      ],
      settings,
    );
    const cubic = sampleTextWarpBoundary(
      [
        ["M", 0, 0],
        ["C", 0, 100, 100, 100, 100, 0],
      ],
      settings,
    );
    const q = sampleTextWarpFraction(quadratic, 0.5);
    const c = sampleTextWarpFraction(cubic, 0.5);
    expect(q.position.x).toBeCloseTo(50, 5);
    expect(q.position.y).toBeCloseTo(50, 5);
    expect(c.position.x).toBeCloseTo(50, 5);
    expect(c.position.y).toBeCloseTo(75, 5);
    expect(Math.abs(cubic.length - 200)).toBeLessThanOrEqual(cubic.lengthErrorBound + 1e-9);
    for (const boundary of [quadratic, cubic]) {
      expect(boundary.positionErrorBound).toBeLessThanOrEqual(settings.positionTolerance);
      expect(boundary.lengthErrorBound).toBeLessThanOrEqual(settings.lengthTolerance!);
      expect(boundary.work.maximumDepth).toBeLessThanOrEqual(16);
      expect(boundary.work.samples).toBeLessThanOrEqual(4_096);
      expect(boundary.work.subdivisions).toBeGreaterThan(0);
      expect(boundary.bounds.left).toBeLessThanOrEqual(0);
      expect(boundary.bounds.right).toBeGreaterThanOrEqual(100);
    }
    expect(quadratic.bounds.bottom).toBeGreaterThanOrEqual(50);
    expect(cubic.bounds.bottom).toBeGreaterThanOrEqual(75);
  });

  test("negative eccentric ellipse agrees with an independent length-fraction oracle", () => {
    const sweep = -Math.PI / 2;
    const boundary = sampleTextWarpBoundary(
      [
        ["M", 100, 0],
        ["A", 100, 50, 0, 0, 0, sweep],
      ],
      settings,
    );
    const exactLength = ellipseLength(100, 50, 0, sweep);
    // Two parse endpoint evaluations; two per visited adaptive node and one per leaf.
    expect(boundary.work.positionEvaluations).toBe(5 * (boundary.samples.length - 1));
    expect(Math.abs(boundary.length - exactLength)).toBeLessThanOrEqual(
      boundary.lengthErrorBound + 1e-8,
    );
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 35; iteration++) {
      const middle = (lower + upper) / 2;
      if (ellipseLength(100, 50, 0, sweep, middle) < exactLength * 0.5) lower = middle;
      else upper = middle;
    }
    const expectedAngle = (sweep * (lower + upper)) / 2;
    const sample = sampleTextWarpFraction(boundary, 0.5);
    expect(
      Math.hypot(
        sample.position.x - 100 * Math.cos(expectedAngle),
        sample.position.y - 50 * Math.sin(expectedAngle),
      ),
    ).toBeLessThanOrEqual(boundary.positionErrorBound + 1e-8);
    expect(sampleTextWarpFraction(boundary, 0).tangent).toEqual({ x: 0, y: -1 });
    expect(sample.tangent!.x).toBeLessThan(0);
    expect(sample.tangent!.y).toBeLessThan(0);
    // Public lookup calls never mutate the already-settled builder count.
    expect(boundary.work.positionEvaluations).toBe(5 * (boundary.samples.length - 1));
  });

  test("signed nearly-full circles preserve both open ends and their directed seam", () => {
    const sweep = -(2 * Math.PI - 1e-7);
    const boundary = sampleTextWarpBoundary(
      [
        ["M", 100, 0],
        ["A", 100, 100, 0, 0, 0, sweep],
      ],
      settings,
    );
    const first = sampleTextWarpFraction(boundary, 0);
    const last = sampleTextWarpFraction(boundary, 1);
    expect(first.position).toEqual({ x: 100, y: 0 });
    expect(last.position).not.toEqual(first.position);
    expect(last.position.y).toBeGreaterThan(0);
    expect(first.tangent).toEqual({ x: 0, y: -1 });
    expect(Math.abs(boundary.length - 100 * Math.abs(sweep))).toBeLessThanOrEqual(
      boundary.lengthErrorBound + 1e-8,
    );
    expect(sampleTextWarpFraction(boundary, 0.5).position.x).toBeCloseTo(-100, 5);
  });

  test("constant paths and zero segments have explicit null tangent semantics", () => {
    for (const commands of [
      [["M", 5, 7]],
      [
        ["M", 5, 7],
        ["L", 5, 7],
        ["Q", 5, 7, 5, 7],
      ],
    ] as readonly (readonly TextWarpPathCommand[])[]) {
      const boundary = sampleTextWarpBoundary(commands, settings);
      expect(boundary.constant).toBe(true);
      expect(boundary.length).toBe(0);
      expect(sampleTextWarpFraction(boundary, 0.9)).toMatchObject({
        position: { x: 5, y: 7 },
        tangent: null,
        normal: null,
      });
    }
    const corner = sampleTextWarpBoundary(
      [
        ["M", 0, 0],
        ["L", 0, 0],
        ["L", 10, 0],
        ["L", 10, 10],
        ["L", 10, 10],
      ],
      settings,
    );
    expect(sampleTextWarpFraction(corner, 0).tangent).toEqual({ x: 1, y: 0 });
    expect(sampleTextWarpFraction(corner, 0.5).tangent).toEqual({ x: 0, y: 1 });
    expect(sampleTextWarpFraction(corner, 1).tangent).toEqual({ x: 0, y: 1 });
    const cusp = sampleTextWarpBoundary(
      [
        ["M", 25, 0],
        ["Q", -25, 0, 25, 0],
      ],
      settings,
    );
    expect(sampleTextWarpFraction(cusp, 0.5).tangent).toBeNull();
  });

  test("per-path, aggregate and depth budgets fail instead of silently lowering accuracy", () => {
    const curved: readonly TextWarpPathCommand[] = [
      ["M", 0, 0],
      ["C", 0, 100, 100, 100, 100, 0],
    ];
    failure(
      () => sampleTextWarpBoundary(line(0, 0, 100, 0), { ...settings, maxSamplesPerPath: 1 }),
      "path-sample-budget",
    );
    failure(
      () => sampleTextWarpBoundary(curved, { ...settings, maxSamplesPerPath: 2 }),
      "path-sample-budget",
    );
    failure(() => sampleTextWarpBoundary(curved, { ...settings, maxDepth: 1 }), "depth-budget");
    failure(
      () =>
        sampleTextWarpBoundaries(
          [{ commands: line(0, 0, 100, 0) }, { commands: line(0, 50, 100, 50) }],
          { ...settings, maxSamplesPerObject: 3 },
        ),
      "object-sample-budget",
    );
    failure(
      () =>
        sampleTextWarpBoundaries(
          [{ commands: line(0, 0, 100, 0) }, { commands: line(0, 50, 100, 50) }],
          { ...settings, maxSamplesPerObject: 2 },
        ),
      "object-sample-budget",
    );
    const aggregate = sampleTextWarpBoundaries(
      [{ commands: line(0, 0, 100, 0) }, { commands: line(0, 50, 100, 50) }],
      settings,
    );
    expect(aggregate.samples).toBe(4);
    expect(aggregate.numericBytes).toBe(
      aggregate.boundaries.reduce((sum, boundary) => sum + boundary.work.numericBytes, 0),
    );
    for (const invalid of [
      { ...settings, width: 16_385 },
      { ...settings, height: 0 },
      { ...settings, maxDepth: 17 },
      { ...settings, maxSamplesPerPath: 4_097 },
      { ...settings, maxSamplesPerObject: 8_193 },
      { ...settings, positionTolerance: NaN },
    ]) {
      expect(() => sampleTextWarpBoundary(curved, invalid)).toThrow(RangeError);
    }
    expect(() =>
      sampleTextWarpBoundary(line(0, 0, 1, 1), { ...settings, width: 16_384, height: 16_384 }),
    ).not.toThrow();
    expect(() =>
      sampleTextWarpBoundary(line(0, 0, 100, 0), {
        ...settings,
        positionTolerance: 1e-30,
        lengthTolerance: 1e-30,
      }),
    ).toThrow(TextWarpSamplingError);
  });

  test("malformed commands and own-data records never invoke getters or coerce numbers", () => {
    let getterCalls = 0;
    const getter = () => {
      getterCalls++;
      throw new Error("Getter must not execute.");
    };
    const accessorCommand = Object.defineProperty(["M", 0, 0], "0", { get: getter });
    const accessorOptions = Object.defineProperty({ ...settings }, "width", { get: getter });
    const accessorPath = Object.defineProperty({}, "commands", { get: getter });
    const inheritedOptions = Object.create(settings);
    const sparse: unknown[] = ["M", 0, 0];
    delete sparse[1];
    const malformed: unknown[] = [
      [],
      [["L", 1, 1]],
      [["M", 0, 0], ["Z"]],
      [
        ["M", 0, 0],
        ["M", 1, 1],
      ],
      [["M", 0, 0, 1]],
      [["M", "0", 0]],
      [["M", Infinity, 0]],
      [sparse],
      [accessorCommand],
      [
        ["M", 0, 0],
        ["A", 10, 10, 0, 0, 0, Math.PI],
      ],
      [
        ["M", 10, 0],
        ["A", -10, 10, 0, 0, 0, Math.PI],
      ],
      [
        ["M", 10, 0],
        ["A", 10, 10, 0, 0, 0, 5 * Math.PI],
      ],
    ];
    for (const input of malformed)
      expect(() =>
        sampleTextWarpBoundary(input as readonly TextWarpPathCommand[], settings),
      ).toThrow();
    expect(() => sampleTextWarpBoundary(line(0, 0, 1, 1), accessorOptions)).toThrow(TypeError);
    expect(() => sampleTextWarpBoundary(line(0, 0, 1, 1), inheritedOptions)).toThrow(TypeError);
    expect(() => sampleTextWarpBoundaries([accessorPath as TextWarpBoundary], settings)).toThrow(
      TypeError,
    );
    expect(() =>
      sampleTextWarpBoundary(line(0, 0, 1, 1), { ...settings, [Symbol("extra")]: 1 }),
    ).toThrow(TypeError);
    const good = sampleTextWarpBoundary(line(0, 0, 1, 1), settings);
    expect(() => sampleTextWarpFraction({ ...good }, 0.5)).toThrow(TypeError);
    for (const fraction of [-0.1, 1.1, Infinity, NaN])
      expect(() => sampleTextWarpFraction(good, fraction)).toThrow(RangeError);
    expect(getterCalls).toBe(0);
  });
});
