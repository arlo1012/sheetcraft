import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SHAPE_PRESET_NAMES } from "../../shape-presets.js";
import {
  TEXT_WARP_PRESET_DEFAULTS,
  TEXT_WARP_PRESET_NAMES,
  isTextWarpPresetName,
  normalizeShapeTextWarp,
  type ShapeTextWarp,
} from "../../text-warps.js";
import { TEXT_WARP_DEFINITIONS } from "../../text-warps/definitions.js";

const source = readFileSync(
  new URL("../../../resources/text-warps/presetTextWarpDefinitions.xml", import.meta.url),
);
const xml = source.toString("utf8");
const followPaths = ["textArchDown", "textArchUp", "textButton", "textCircle"];
function attributes(value: string): Record<string, string> {
  return Object.fromEntries(
    [...value.matchAll(/(\w+)="([^"]*)"/gu)].map((match) => [match[1], match[2]]),
  );
}
function normalizeUnknown(value: unknown) {
  return normalizeShapeTextWarp(value as ShapeTextWarp | undefined);
}

describe("pinned standard text-warp catalog and sparse own-data admission", () => {
  test("retains the full applicable Ecma notices in both generated derivatives", () => {
    const notices = readFileSync(
      new URL("../../../resources/text-warps/ECMA-NOTICES.txt", import.meta.url),
      "utf8",
    );
    expect(notices).toContain("Copyright © <> <>");
    expect(notices).toContain("No patent license is granted");
    expect(notices).toContain("Redistribution and use in source and binary forms");
    expect(notices).toContain("IN NO EVENT SHALL ECMA INTERNATIONAL BE LIABLE");
    expect(notices).toContain("© Ecma International");
    for (const filename of ["catalog.ts", "definitions.ts"]) {
      const generated = readFileSync(
        new URL(`../../text-warps/${filename}`, import.meta.url),
        "utf8",
      );
      expect(generated, filename).toContain(`/*!\n${notices}*/`);
      // TypeScript erases type imports and their attached leading comments.
      // Keep the complete license attached to an emitted value declaration.
      expect(generated.indexOf("/*!"), filename).toBeGreaterThan(
        generated.lastIndexOf("import type"),
      );
      expect(generated.indexOf("export const"), filename).toBeGreaterThan(generated.indexOf("*/"));
    }
  });

  test("pins the unchanged official source and every distinct active identity separately from the 187 body presets", () => {
    expect(source.byteLength).toBe(51_599);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "89640bd4aeedfa2c578d1d1acc50d569865ebdef315fd4b468087c25e36acada",
    );
    expect(TEXT_WARP_PRESET_NAMES).toEqual(
      [...xml.matchAll(/<(text\w+)>/gu)].map((match) => match[1]),
    );
    expect(TEXT_WARP_PRESET_NAMES).toHaveLength(40);
    expect(new Set(TEXT_WARP_PRESET_NAMES).size).toBe(40);
    expect(
      TEXT_WARP_PRESET_NAMES.filter((name) =>
        (SHAPE_PRESET_NAMES as readonly string[]).includes(name),
      ),
    ).toEqual([]);
    expect(isTextWarpPresetName("textNoShape")).toBe(false);
    expect(isTextWarpPresetName("textPlain")).toBe(true);
    for (const value of ["rect", "__proto__", "constructor", "toString", "None", null, 0])
      expect(isTextWarpPresetName(value)).toBe(false);
    expect(Object.isFrozen(TEXT_WARP_PRESET_NAMES)).toBe(true);
    expect(Object.isFrozen(TEXT_WARP_PRESET_DEFAULTS)).toBe(true);
  });

  test("retains every ordered source formula, handle and open command without fill/body metadata", () => {
    let paths = 0,
      symbolicDefaults = 0;
    for (const preset of TEXT_WARP_PRESET_NAMES) {
      const shapeXml = xml.match(new RegExp(`<${preset}>([\\s\\S]*?)</${preset}>`, "u"))![1]!;
      const definition = TEXT_WARP_DEFINITIONS[preset];
      const av = shapeXml.match(/<avLst[^>]*>([\s\S]*?)<\/avLst>/u)![1]!;
      const defaults = Object.fromEntries(
        [...av.matchAll(/<gd\s+([^>]*)>/gu)].map((match) => {
          const fields = attributes(match[1]!);
          const [operator, value] = fields.fmla!.split(" ");
          expect(operator).toBe("val");
          if (value === "cd2") symbolicDefaults++;
          return [fields.name, value === "cd2" ? 10_800_000 : Number(value)];
        }),
      );
      expect(TEXT_WARP_PRESET_DEFAULTS[preset], preset).toEqual(defaults);
      expect(Object.isFrozen(TEXT_WARP_PRESET_DEFAULTS[preset]), preset).toBe(true);
      const gd = shapeXml.match(/<gdLst[^>]*>([\s\S]*?)<\/gdLst>/u)![1]!;
      expect(definition.guides, preset).toEqual(
        [...gd.matchAll(/<gd\s+([^>]*)>/gu)].map((match) => {
          const fields = attributes(match[1]!);
          return [fields.name, ...fields.fmla!.split(" ")];
        }),
      );
      const handles = [...shapeXml.matchAll(/<(ahXY|ahPolar)\s+([^>]*)>([\s\S]*?)<\/\1>/gu)].map(
        (match) => {
          const position = attributes(match[3]!.match(/<pos\s+([^>]*)>/u)![1]!);
          return {
            kind: match[1],
            fields: attributes(match[2]!),
            position: [position.x, position.y],
          };
        },
      );
      expect(definition.handles, preset).toEqual(handles);
      const sourcePaths = [...shapeXml.matchAll(/<path>([\s\S]*?)<\/path>/gu)].map((match) => {
        const commands = [
          ...match[1]!.matchAll(
            /<(moveTo|lnTo|quadBezTo|cubicBezTo)>([\s\S]*?)<\/\1>|<arcTo\s+([^>]*)><\/arcTo>/gu,
          ),
        ].map((command) => {
          if (command[3]) {
            const fields = attributes(command[3]);
            return ["arcTo", fields.wR, fields.hR, fields.stAng, fields.swAng];
          }
          return [
            command[1],
            ...[...command[2]!.matchAll(/<pt\s+([^>]*)>/gu)].flatMap((point) => {
              const fields = attributes(point[1]!);
              return [fields.x, fields.y];
            }),
          ];
        });
        return { commands };
      });
      expect(definition.paths, preset).toEqual(sourcePaths);
      expect(definition.guides.length + Object.keys(defaults).length, preset).toBeLessThanOrEqual(
        128,
      );
      expect(definition.paths.flatMap((path) => path.commands).length, preset).toBeLessThanOrEqual(
        16,
      );
      paths += sourcePaths.length;
      const isFollowPath = followPaths.includes(preset);
      expect(definition.family, preset).toBe(isFollowPath ? "follow-path" : "envelope");
      expect(definition.tracks, preset).toEqual(
        isFollowPath ? sourcePaths.map((_path, pathIndex) => ({ pathIndex })) : [],
      );
      expect(definition.bands, preset).toEqual(
        isFollowPath
          ? []
          : Array.from({ length: sourcePaths.length / 2 }, (_unused, bandIndex) => ({
              topPathIndex: bandIndex * 2,
              bottomPathIndex: bandIndex * 2 + 1,
            })),
      );
    }
    expect(paths).toBe(88);
    expect(symbolicDefaults).toBe(4);
    expect(
      TEXT_WARP_DEFINITIONS.textButtonPour.guides.filter((guide) => guide[0] === "v1"),
    ).toHaveLength(2);
  });

  test("canonicalizes declared defaults sparsely without erasing active textPlain", () => {
    expect(normalizeShapeTextWarp(undefined)).toBeUndefined();
    expect(normalizeShapeTextWarp({ preset: "textPlain" })).toEqual({ preset: "textPlain" });
    for (const preset of TEXT_WARP_PRESET_NAMES)
      expect(
        normalizeShapeTextWarp({ preset, adjustments: TEXT_WARP_PRESET_DEFAULTS[preset] }),
        preset,
      ).toEqual({ preset });
    const original: ShapeTextWarp = { preset: "textWave1", adjustments: { adj1: 8000, adj2: -0 } };
    expect(normalizeShapeTextWarp(original)).toEqual({
      preset: "textWave1",
      adjustments: { adj1: 8000 },
    });
    const sourceAdjustments = { adj: 40_000 };
    const copy = normalizeShapeTextWarp({ preset: "textPlain", adjustments: sourceAdjustments })!;
    sourceAdjustments.adj = 60_000;
    expect(copy.adjustments?.adj).toBe(40_000);
    const nullRecord = Object.assign(Object.create(null) as Record<string, unknown>, {
      preset: "textPlain",
      adjustments: Object.assign(Object.create(null) as Record<string, number>, { adj: 40_000 }),
    });
    expect(normalizeUnknown(nullRecord)).toEqual({
      preset: "textPlain",
      adjustments: { adj: 40_000 },
    });
    const signedZero = normalizeShapeTextWarp({ preset: "textPlain", adjustments: { adj: -0 } })!;
    expect(Object.is(signedZero.adjustments!.adj, -0)).toBe(false);
  });

  test("rejects malformed, inherited, symbol and hidden unknown fields before executing any getter", () => {
    for (const value of [
      null,
      false,
      1,
      "textPlain",
      [],
      {},
      { preset: "textNoShape" },
      { preset: "textPlain", unknown: 1 },
      Object.create({ preset: "textPlain" }),
    ])
      expect(() => normalizeUnknown(value)).toThrow(TypeError);
    const symbol = { preset: "textPlain", [Symbol("unknown")]: 1 };
    expect(() => normalizeUnknown(symbol)).toThrow("symbol");
    const hiddenUnknown = Object.defineProperty({ preset: "textPlain" }, "unknown", { value: 1 });
    expect(() => normalizeUnknown(hiddenUnknown)).toThrow("Unknown");
    let getterReads = 0;
    const getter = () => {
      getterReads++;
      return "textPlain";
    };
    const presetAccessor = Object.defineProperty({}, "preset", { get: getter });
    const adjustmentAccessor = Object.defineProperty({ preset: "textPlain" }, "adjustments", {
      get: getter,
    });
    const emptyAccessor = Object.defineProperty({ preset: "textPlain" }, "adjustments", {
      get: undefined,
    });
    const nestedAccessor = {
      preset: "textPlain",
      adjustments: Object.defineProperty({}, "adj", { get: getter }),
    };
    for (const value of [presetAccessor, adjustmentAccessor, emptyAccessor, nestedAccessor])
      expect(() => normalizeUnknown(value)).toThrow("accessors");
    expect(getterReads).toBe(0);
    for (const adjustments of [
      null,
      [],
      Object.create({ adj: 1 }),
      { unknown: 1 },
      { adj: 1, adj1: 2, adj2: 3 },
      Object.defineProperty({}, "unknown", { value: 1 }),
      { [Symbol("adj")]: 1 },
    ])
      expect(() => normalizeUnknown({ preset: "textPlain", adjustments })).toThrow(TypeError);
    for (const adj of [
      undefined,
      null,
      true,
      "40000",
      NaN,
      Infinity,
      -Infinity,
      2_147_483_648,
      -2_147_483_648,
    ])
      expect(() => normalizeUnknown({ preset: "textPlain", adjustments: { adj } })).toThrow(
        "finite",
      );
    for (const adj of [2_147_483_647, -2_147_483_647])
      expect(normalizeShapeTextWarp({ preset: "textPlain", adjustments: { adj } })).toEqual({
        preset: "textPlain",
        adjustments: { adj },
      });
  });
});
