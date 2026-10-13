import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  TEXT_WARP_GEOMETRY_LIMITS,
  TEXT_WARP_PRESET_DEFAULTS,
  TEXT_WARP_PRESET_NAMES,
  evaluateTextWarp,
  type ShapeTextWarp,
} from "../../text-warps.js";
import { TEXT_WARP_DEFINITIONS } from "../../text-warps/definitions.js";
import {
  evaluateShapeGuide,
  readShapeGuide,
  shapeGuideVariables,
} from "../../shape-presets/formula.js";

describe("standard text-warp boundary evaluation", () => {
  test("evaluates all 40 defaults and adjustments within the declared text-local budgets", () => {
    for (const preset of TEXT_WARP_PRESET_NAMES) {
      const overrides = Object.fromEntries(
        Object.entries(TEXT_WARP_PRESET_DEFAULTS[preset]).map(([name, value]) => [
          name,
          value === 0 ? 12500 : value * 0.75,
        ]),
      );
      for (const [width, height, adjusted] of [
        [360, 240, false],
        [240, 360, false],
        [360, 240, true],
        [240, 360, true],
        [1, 1, false],
        [16384, 1, false],
        [1, 16384, false],
        [16384, 16384, false],
      ] as const) {
        const geometry = evaluateTextWarp(
          { preset, ...(adjusted ? { adjustments: overrides } : {}) },
          width,
          height,
        );
        expect(geometry.preset).toBe(preset);
        expect(geometry.width).toBe(width);
        expect(geometry.height).toBe(height);
        expect(geometry.boundaries.length, preset).toBeLessThanOrEqual(6);
        expect(
          geometry.boundaries.flatMap((boundary) => boundary.commands).length,
          preset,
        ).toBeLessThanOrEqual(16);
        for (const boundary of geometry.boundaries) {
          expect(Object.keys(boundary)).toEqual(["commands"]);
          expect(boundary.commands[0]?.[0], preset).toBe("M");
          for (const command of boundary.commands) {
            expect(command[0], preset).not.toBe("Z");
            for (const value of command.slice(1)) {
              expect(Number.isFinite(value), preset).toBe(true);
              expect(Math.abs(value as number), preset).toBeLessThanOrEqual(10_000_000);
            }
          }
        }
        const variables = { ...shapeGuideVariables(width, height), ...geometry.adjustments };
        const expectedGuides: Record<string, number> = {};
        for (const guide of TEXT_WARP_DEFINITIONS[preset].guides) {
          const value = evaluateShapeGuide(guide.slice(1), variables);
          expectedGuides[guide[0]!] = variables[guide[0]!] = value;
        }
        expect(geometry.guides, preset).toEqual(expectedGuides);
        geometry.handles.forEach((handle, index) => {
          const source = TEXT_WARP_DEFINITIONS[preset].handles[index]!;
          expect(handle.position, preset).toEqual({
            x: readShapeGuide(source.position[0], variables),
            y: readShapeGuide(source.position[1], variables),
          });
          for (const field of handle.fields) {
            expect(field.value, preset).toBe(geometry.adjustments[field.name]);
            expect(Number.isFinite(field.minimum) && Number.isFinite(field.maximum), preset).toBe(
              true,
            );
          }
        });
        expect(geometry.tracks, preset).toEqual(TEXT_WARP_DEFINITIONS[preset].tracks);
        expect(geometry.bands, preset).toEqual(TEXT_WARP_DEFINITIONS[preset].bands);
      }
    }
    expect(TEXT_WARP_GEOMETRY_LIMITS).toEqual({
      maximumExtent: 16384,
      maximumCoordinate: 10000000,
      maximumGuides: 128,
      maximumPaths: 6,
      maximumCommands: 16,
      maximumAdjustments: 2,
      maximumHandles: 2,
    });
  });

  test("resolves every val cd2 default and exposes actual guide/handle geometry", () => {
    for (const preset of [
      "textArchUp",
      "textArchUpPour",
      "textButtonPour",
      "textCirclePour",
    ] as const) {
      const geometry = evaluateTextWarp({ preset }, 360, 240);
      const name = preset === "textArchUp" ? "adj" : "adj1";
      expect(geometry.adjustments[name], preset).toBe(10_800_000);
      expect(
        geometry.handles.flatMap((handle) => handle.fields).find((field) => field.name === name)
          ?.value,
        preset,
      ).toBe(10_800_000);
    }
    const up = evaluateTextWarp({ preset: "textArchUp" }, 360, 240);
    expect(up.handles[0]!.position.x).toBeCloseTo(0, 10);
    expect(up.handles[0]!.position.y).toBeCloseTo(120, 10);
    expect(up.boundaries[0]!.commands[1]).toEqual([
      "A",
      180,
      120,
      expect.closeTo(180, 10),
      expect.closeTo(120, 10),
      Math.PI,
      2 * Math.PI,
    ]);
    const plain = evaluateTextWarp({ preset: "textPlain", adjustments: { adj: 40000 } }, 360, 240);
    expect(plain.boundaries.map((boundary) => boundary.commands)).toEqual([
      [
        ["M", 72, 0],
        ["L", 360, 0],
      ],
      [
        ["M", 0, 240],
        ["L", 288, 240],
      ],
    ]);
    expect(plain.guides.mid).toBe(144);
    expect(plain.handles[0]!.position).toEqual({ x: 144, y: 240 });
    expect(plain.handles[0]!.fields).toEqual([
      { name: "adj", axis: "x", minimum: 30000, maximum: 70000, value: 40000 },
    ]);
  });

  test("keeps baseline tracks, paired bands, signed almost-full arcs and open endpoints", () => {
    expect(evaluateTextWarp({ preset: "textButton" }, 360, 240).tracks).toEqual([
      { pathIndex: 0 },
      { pathIndex: 1 },
      { pathIndex: 2 },
    ]);
    expect(evaluateTextWarp({ preset: "textDeflateInflate" }, 360, 240).bands).toEqual([
      { topPathIndex: 0, bottomPathIndex: 1 },
      { topPathIndex: 2, bottomPathIndex: 3 },
    ]);
    for (const preset of ["textButtonPour", "textDeflateInflateDeflate"] as const)
      expect(evaluateTextWarp({ preset }, 360, 240).bands).toEqual([
        { topPathIndex: 0, bottomPathIndex: 1 },
        { topPathIndex: 2, bottomPathIndex: 3 },
        { topPathIndex: 4, bottomPathIndex: 5 },
      ]);
    for (const [preset, sign] of [
      ["textRingInside", 1],
      ["textRingOutside", -1],
    ] as const) {
      const geometry = evaluateTextWarp({ preset }, 360, 240);
      expect(geometry.family).toBe("envelope");
      expect(geometry.tracks).toEqual([]);
      for (const boundary of geometry.boundaries) {
        const arc = boundary.commands[1]!;
        if (arc[0] !== "A") throw new Error("Expected standard ring arc");
        expect(Math.sign(arc[6] - arc[5])).toBe(sign);
        expect(Math.abs(arc[6] - arc[5])).toBeLessThan(2 * Math.PI);
        expect(Math.abs(arc[6] - arc[5])).toBeGreaterThan(2 * Math.PI - 0.00001);
        expect(boundary.commands).toHaveLength(2);
      }
    }
    const collapsed = evaluateTextWarp(
      { preset: "textCirclePour", adjustments: { adj2: 0 } },
      360,
      240,
    );
    expect(collapsed.boundaries[1]!.commands.map((command) => command[0])).toEqual(["M", "L"]);
  });

  test("rejects absent active identity and malformed or out-of-budget extents", () => {
    expect(() => evaluateTextWarp(undefined as unknown as ShapeTextWarp, 360, 240)).toThrow(
      "active",
    );
    expect(() =>
      evaluateTextWarp({ preset: "textNoShape" } as unknown as ShapeTextWarp, 360, 240),
    ).toThrow("preset");
    for (const invalid of [0, -1, NaN, Infinity, 16384.001]) {
      expect(() => evaluateTextWarp({ preset: "textPlain" }, invalid, 240)).toThrow("extents");
      expect(() => evaluateTextWarp({ preset: "textPlain" }, 360, invalid)).toThrow("extents");
    }
  });

  test.each([false, true])(
    "locks ordered all-40 evaluated geometry fingerprints (adjusted=%s)",
    (adjusted) => {
      const hash = createHash("sha256");
      for (const preset of TEXT_WARP_PRESET_NAMES) {
        const adjustments = Object.fromEntries(
          Object.entries(TEXT_WARP_PRESET_DEFAULTS[preset]).map(([name, value]) => [
            name,
            value === 0 ? 12500 : value * 0.75,
          ]),
        );
        const geometry = evaluateTextWarp(
          { preset, ...(adjusted ? { adjustments } : {}) },
          360,
          240,
        );
        hash.update(
          JSON.stringify(geometry, (_key, value: unknown) =>
            typeof value === "number" ? Number(value.toPrecision(12)) : value,
          ),
        );
      }
      // Initial fingerprints are captured after source-token and coordinate assertions above.
      expect(hash.digest("hex")).toBe(
        adjusted
          ? "6f9dc35f4053d53ca8c73c4e422d7f8b2c22381a1931cfb1e12ba80f6efa8929"
          : "a164bae65a724f2f4c897a1335c18221a7409bc66f65b0f2335e6769d3eb618a",
      );
    },
  );
});
