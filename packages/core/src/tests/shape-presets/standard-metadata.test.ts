import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  SHAPE_PRESET_NAMES,
  evaluateShapePreset,
  type EvaluatedShapePresetGeometry,
  type ShapePresetFillMode,
} from "../../shape-presets.js";
import { SHAPE_PRESET_DEFAULTS } from "../../shape-presets/catalog.js";
import { SHAPE_PRESET_DEFINITIONS } from "../../shape-presets/definitions.js";
import { shapeGuideVariables } from "../../shape-presets/formula.js";

const source = readFileSync(
  new URL("../../../resources/shape-presets/presetShapeDefinitions.xml", import.meta.url),
  "utf8",
);
function attributes(xml: string): Record<string, string> {
  return Object.fromEntries(
    [...xml.matchAll(/(\w+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]),
  );
}

describe("compiled standard preset metadata", () => {
  test("preserves every source fill mode, text-rectangle token and ordered connection site for all 187 presets", () => {
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "4a762444d8d85876881c02a5b1dedf6f73006fcd8acb7b4e393435615b37c780",
    );
    let rectangles = 0,
      sites = 0;
    const modes = new Set<ShapePresetFillMode>();
    for (const preset of SHAPE_PRESET_NAMES) {
      // Read only the fixed, hash-verified source's simple metadata in this regression test.
      const xml = source.match(new RegExp(`<${preset}>([\\s\\S]*?)</${preset}>`, "u"))![1]!;
      const definition = SHAPE_PRESET_DEFINITIONS[preset];
      const paths = [...xml.matchAll(/<path(?:\s([^>]*))?>/gu)].map((match) =>
        attributes(match[1] ?? ""),
      );
      expect(
        definition.paths.map((path) => path.fillMode),
        preset,
      ).toEqual(paths.map((path) => path.fill ?? "norm"));
      for (const path of definition.paths) modes.add(path.fillMode);
      const rect = xml.match(/<rect\s+([^>]*?)\s*\/>/u);
      if (rect) {
        const fields = attributes(rect[1]!);
        expect(definition.textRect, preset).toEqual([fields.l, fields.t, fields.r, fields.b]);
        rectangles++;
      } else expect(definition.textRect, preset).toBeNull();
      const connections = [...xml.matchAll(/<cxn\s+ang="([^"]+)"\s*>([\s\S]*?)<\/cxn>/gu)].map(
        (match) => {
          const position = attributes(match[2]!.match(/<pos\s+([^>]*?)\s*\/>/u)![1]!);
          return { angle: match[1], position: [position.x, position.y] };
        },
      );
      expect(definition.connectionSites, preset).toEqual(connections);
      expect(connections.length, preset).toBeLessThanOrEqual(16);
      sites += connections.length;
    }
    expect(rectangles).toBe(182);
    expect(sites).toBe(860);
    expect([...modes].sort()).toEqual([
      "darken",
      "darkenLess",
      "lighten",
      "lightenLess",
      "none",
      "norm",
    ]);
  });

  test("exposes complete evaluated metadata while preserving all six ordered shading modes and legacy mask flags", () => {
    const geometry: EvaluatedShapePresetGeometry = evaluateShapePreset(
      { preset: "bevel" },
      360,
      240,
    );
    expect(geometry.paths.map((path) => path.fillMode)).toEqual([
      "norm",
      "lightenLess",
      "darkenLess",
      "lighten",
      "darken",
      "none",
    ]);
    expect(geometry.paths.map((path) => path.filled)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(geometry.connectionSites).toHaveLength(8);
    expect(
      evaluateShapePreset({ preset: "cube" }, 360, 240).paths.map((path) => path.fillMode),
    ).toEqual(["norm", "darkenLess", "lightenLess", "none"]);
  });

  test("evaluates actual text guides in local coordinates, independent of a path's own coordinate space", () => {
    expect(evaluateShapePreset(undefined, 360, 240).textRect).toEqual({
      left: 0,
      top: 0,
      right: 360,
      bottom: 240,
    });
    expect(evaluateShapePreset({ preset: "ellipse" }, 360, 240).textRect).toEqual({
      left: expect.closeTo(180 - 180 / Math.SQRT2, 10),
      top: expect.closeTo(120 - 120 / Math.SQRT2, 10),
      right: expect.closeTo(180 + 180 / Math.SQRT2, 10),
      bottom: expect.closeTo(120 + 120 / Math.SQRT2, 10),
    });
    // This preset's path uses a 2×2 coordinate space; its metadata already uses local w/h.
    const diamond = evaluateShapePreset({ preset: "flowChartDecision" }, 360, 240);
    expect(diamond.textRect).toEqual({ left: 90, top: 60, right: 270, bottom: 180 });
    expect(diamond.connectionSites[0]!.position).toEqual({ x: 180, y: 0 });
    const arrow = evaluateShapePreset(
      { preset: "rightArrow", adjustments: { adj1: 25000, adj2: 20000 } },
      360,
      240,
    );
    expect(arrow.textRect).toEqual({ left: 0, top: 90, right: 348, bottom: 150 });
    expect(arrow.connectionSites[0]!.position).toEqual({ x: 312, y: 0 });
    for (const preset of ["chartPlus", "chartStar", "chartX", "line", "lineInv"] as const)
      expect(evaluateShapePreset({ preset }, 360, 240).textRect, preset).toBeNull();
  });

  test("preserves DrawingML angle units, signed and full-turn directions, and out-of-frame connection positions", () => {
    expect(evaluateShapePreset({ preset: "rect" }, 360, 240).connectionSites).toEqual([
      { position: { x: 180, y: 0 }, angle: 16_200_000 },
      { position: { x: 0, y: 120 }, angle: 10_800_000 },
      { position: { x: 180, y: 240 }, angle: 5_400_000 },
      { position: { x: 360, y: 120 }, angle: 0 },
    ]);
    const arc = evaluateShapePreset(
      { preset: "arc", adjustments: { adj1: 0, adj2: 16_200_000 } },
      360,
      240,
    );
    expect(arc.connectionSites.map((site) => site.angle)).toEqual([
      -5_400_000, 8_100_000, 21_600_000,
    ]);
    expect(shapeGuideVariables(360, 240).cd3).toBe(7_200_000);
    expect(
      evaluateShapePreset({ preset: "curvedLeftArrow" }, 360, 240).connectionSites[2]!.angle,
    ).toBe(7_200_000);
    const callout = evaluateShapePreset(
      { preset: "wedgeRectCallout", adjustments: { adj1: -100000, adj2: 150000 } },
      360,
      240,
    );
    expect(callout.connectionSites.at(-1)).toEqual({
      position: { x: -180, y: 480 },
      angle: 5_400_000,
    });
  });

  test("evaluates finite, bounded metadata across every default and adjusted preset at both orientations and extreme default extents", () => {
    for (const preset of SHAPE_PRESET_NAMES) {
      const adjustments = Object.fromEntries(
        Object.entries(SHAPE_PRESET_DEFAULTS[preset]).map(([name, value]) => [
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
        [10000, 1, false],
        [1, 10000, false],
      ] as const) {
        const geometry = evaluateShapePreset(
          { preset, ...(adjusted ? { adjustments } : {}) },
          width,
          height,
        );
        if (geometry.textRect)
          for (const value of Object.values(geometry.textRect)) {
            expect(Number.isFinite(value), `${preset} text`).toBe(true);
            expect(Math.abs(value), `${preset} text`).toBeLessThanOrEqual(10_000_000);
          }
        for (const site of geometry.connectionSites) {
          expect(Number.isFinite(site.angle), `${preset} angle`).toBe(true);
          expect(Math.abs(site.angle), `${preset} angle`).toBeLessThanOrEqual(2_147_483_647);
          for (const value of Object.values(site.position)) {
            expect(Number.isFinite(value), `${preset} connection`).toBe(true);
            expect(Math.abs(value), `${preset} connection`).toBeLessThanOrEqual(10_000_000);
          }
        }
      }
    }
  });
});
