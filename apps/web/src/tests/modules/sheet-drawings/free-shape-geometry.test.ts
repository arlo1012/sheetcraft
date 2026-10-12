// @vitest-environment node
import { describe, expect, test } from "vitest";
import type { ShapeFreePath, ShapeFreePathCommand } from "@sheetcraft/core/shape-free-path";
import {
  FREE_SHAPE_GEOMETRY_LIMITS,
  getFreeShapeGeometry,
} from "../../../modules/sheet-drawings/free-shape-geometry";

function path(closed = false): ShapeFreePath {
  return {
    tool: "curve",
    viewBox: { width: 100, height: 80 },
    commands: [
      ["M", 10, 15],
      ["L", 35, 20],
      ["Q", 40, 5, 55, 30],
      ["C", 62, 52, 77, 65, 100, 80],
      ...(closed ? [["Z"] as const] : []),
    ],
  };
}

describe("free shape numeric evaluation", () => {
  test.each(["curve", "freeform", "scribble"] as const)(
    "%s preserves every authored numeric command at independent axis scales",
    (tool) => {
      const geometry = getFreeShapeGeometry({ ...path(), tool }, 240, 120)!;
      expect(geometry.paths).toEqual([
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: [
            ["M", 24, 22.5],
            ["L", 84, 30],
            ["Q", 96, 7.5, 132, 45],
            ["C", 148.79999999999998, 78, 184.79999999999998, 97.5, 240, 120],
          ],
        },
      ]);
      expect(geometry.width).toBe(240);
      expect(geometry.height).toBe(120);
      expect(geometry.handles).toEqual([]);
      expect(geometry.adjustments).toEqual({});
      expect(geometry.connectionSites).toEqual([]);
      expect(geometry.textRect).toBeNull();
    },
  );

  test("only explicit final Z enables fill and the full-frame text rectangle", () => {
    const closed = getFreeShapeGeometry(path(true), 240, 120)!;
    expect(closed.paths[0]!.filled).toBe(true);
    expect(closed.paths[0]!.fillMode).toBe("norm");
    expect(closed.paths[0]!.commands.at(-1)).toEqual(["Z"]);
    expect(closed.textRect).toEqual({ left: 0, top: 0, right: 240, bottom: 120 });
    const coincident = getFreeShapeGeometry(
      {
        tool: "freeform",
        viewBox: { width: 100, height: 80 },
        commands: [
          ["M", 10, 15],
          ["L", 50, 60],
          ["L", 10, 15],
        ],
      },
      240,
      120,
    )!;
    expect(coincident.paths[0]!.filled).toBe(false);
    expect(coincident.paths[0]!.fillMode).toBe("none");
    expect(coincident.textRect).toBeNull();
  });

  test("results detach deeply, canonical numeric geometry reuses an LRU entry", () => {
    const input = path(true);
    const first = getFreeShapeGeometry(input, 240, 120)!;
    (input.commands[1] as ["L", number, number])[1] = 60;
    input.viewBox.width = 120;
    expect(first.paths[0]!.commands[1]).toEqual(["L", 84, 30]);
    expect(getFreeShapeGeometry(path(true), 240, 120)).toBe(first);
    expect(getFreeShapeGeometry(input, 240, 120)).not.toBe(first);
    for (const value of [
      first,
      first.paths,
      first.paths[0],
      first.paths[0]!.commands,
      ...first.paths[0]!.commands,
      first.handles,
      first.adjustments,
      first.textRect,
      first.connectionSites,
    ])
      expect(Object.isFrozen(value)).toBe(true);
    for (let index = 0; index <= FREE_SHAPE_GEOMETRY_LIMITS.cache; index++)
      getFreeShapeGeometry(path(), 500 + index, 120);
    expect(getFreeShapeGeometry(path(true), 240, 120)).not.toBe(first);
    expect(first.paths[0]!.commands[1]).toEqual(["L", 84, 30]);
  });

  test("rejects malformed, executable, unbounded and absent geometry without a fallback", () => {
    expect(getFreeShapeGeometry(undefined, 240, 120)).toBeUndefined();
    for (const dimensions of [
      [0, 120],
      [240, -1],
      [Infinity, 120],
      [NaN, 120],
      [16385, 120],
    ])
      expect(getFreeShapeGeometry(path(), dimensions[0]!, dimensions[1]!)).toBeUndefined();
    for (const invalid of [
      { ...path(), tool: "rect" },
      { ...path(), d: "M0 0 L100 80" },
      { ...path(), commands: "M0 0 L100 80" },
      {
        ...path(),
        commands: [
          ["M", 0, 0],
          ["A", 0, 0, 10, 10, 0, 90],
        ],
      },
      {
        ...path(),
        commands: [
          ["M", 0, 0],
          ["C", 1, 1, 101, 2, 100, 80],
        ],
      },
      {
        ...path(),
        commands: [
          ["M", 0, 0],
          ["L", NaN, 80],
        ],
      },
      { ...path(), viewBox: { width: 0, height: 80 } },
    ])
      expect(getFreeShapeGeometry(invalid as unknown as ShapeFreePath, 240, 120)).toBeUndefined();
    let reads = 0;
    const accessor = Object.defineProperty({}, "commands", {
      get: () => {
        reads++;
        return path().commands;
      },
      enumerable: true,
    });
    expect(getFreeShapeGeometry(accessor as ShapeFreePath, 240, 120)).toBeUndefined();
    expect(reads).toBe(0);
  });

  test("accepts exactly the authored command and extent budgets, rejects overflow", () => {
    const commands: ShapeFreePathCommand[] = [["M", 0, 0]];
    for (let index = 1; index < FREE_SHAPE_GEOMETRY_LIMITS.commands; index++)
      commands.push(["L", index % 2, index % 2]);
    const largest = { tool: "scribble" as const, viewBox: { width: 1, height: 1 }, commands };
    const geometry = getFreeShapeGeometry(largest, 16384, 16384)!;
    expect(geometry.paths[0]!.commands).toHaveLength(2048);
    expect(geometry.paths[0]!.commands[1]).toEqual(["L", 16384, 16384]);
    expect(
      getFreeShapeGeometry({ ...largest, commands: [...commands, ["L", 0, 0]] }, 16384, 16384),
    ).toBeUndefined();
  });
});
