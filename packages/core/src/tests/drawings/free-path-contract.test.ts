import { describe, expect, test } from "vitest";
import {
  MAX_SHAPE_FREE_PATH_COMMANDS,
  MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE,
  isShapeFreePathClosed,
  normalizeShapeFreePath,
  type ShapeFreePath,
} from "../../shape-free-path.js";
import { normalizeSheetDrawing, type SheetDrawing } from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { freePath, freePathDrawing } from "./free-path-fixture.js";

describe("bounded numeric free shape contract", () => {
  test.each(["curve", "freeform", "scribble"] as const)(
    "deeply normalizes %s with every supported command",
    (tool) => {
      const input = freePath(tool),
        expected = structuredClone(input),
        output = normalizeShapeFreePath(input);
      expect(output).toEqual(expected);
      expect(output).not.toBe(input);
      expect(output.viewBox).not.toBe(input.viewBox);
      expect(output.commands).not.toBe(input.commands);
      output.commands.forEach((command, index) => expect(command).not.toBe(input.commands[index]));
      input.viewBox.width = 1;
      (input.commands[1] as unknown as (string | number)[])[1] = 1;
      expect(output).toEqual(expected);
      expect(isShapeFreePathClosed(output)).toBe(false);
      const closed = normalizeShapeFreePath({ ...output, commands: [...output.commands, ["Z"]] });
      expect(isShapeFreePathClosed(closed)).toBe(true);
    },
  );

  test("bounds the command count and both viewBox dimensions without imposing a drawing size", () => {
    const commands = [
      ["M", 0, 0],
      ...Array.from({ length: MAX_SHAPE_FREE_PATH_COMMANDS - 1 }, () => ["L", 1, 1]),
    ];
    const largest = {
      tool: "scribble",
      viewBox: {
        width: MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE,
        height: MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE,
      },
      commands,
    };
    expect(normalizeShapeFreePath(largest).commands).toHaveLength(2048);
    expect(() =>
      normalizeShapeFreePath({ ...largest, commands: [...commands, ["L", 1, 1]] }),
    ).toThrow(/budget/);
    expect(
      normalizeShapeFreePath({ ...largest, viewBox: { width: 1, height: 1 } }).viewBox,
    ).toEqual({ width: 1, height: 1 });
    expect(normalizeSheetDrawing({ ...freePathDrawing(), width: 1, height: 16384 })).toMatchObject({
      width: 1,
      height: 16384,
      shapePath: freePath(),
    });
    for (const dimension of [0, -1, 16384.01, NaN, Infinity, -Infinity, "180", undefined])
      for (const key of ["width", "height"])
        expect(() =>
          normalizeShapeFreePath({
            ...freePath(),
            viewBox: { width: 180, height: 90, [key]: dimension },
          }),
        ).toThrow();
  });

  test("canonicalizes negative zero and permits coincident ends when a control defines a curve", () => {
    const path = normalizeShapeFreePath({
      tool: "curve",
      viewBox: { width: 1, height: 1 },
      commands: [
        ["M", -0, -0],
        ["Q", 1, 1, -0, -0],
      ],
    });
    expect(path.commands).toEqual([
      ["M", 0, 0],
      ["Q", 1, 1, 0, 0],
    ]);
    expect(Object.is(path.commands[0]![1], -0)).toBe(false);
    expect(isShapeFreePathClosed(path)).toBe(false);
  });

  test.each(
    [
      [],
      [["M", 0, 0]],
      [["M", 0, 0], ["Z"]],
      [
        ["M", 0, 0],
        ["L", 0, 0],
      ],
      [
        ["M", 0, 0],
        ["Q", 0, 0, 0, 0],
      ],
      [
        ["L", 0, 0],
        ["L", 1, 1],
      ],
      [
        ["M", 0, 0],
        ["M", 1, 1],
      ],
      [["M", 0, 0], ["Z"], ["L", 1, 1]],
      [["M", 0, 0], ["L", 1, 1], ["Z"], ["Z"]],
      [
        ["M", 0],
        ["L", 1, 1],
      ],
      [
        ["M", 0, 0],
        ["L", 1, 1, 2],
      ],
      [
        ["M", 0, 0],
        ["Q", 1, 1, 2],
      ],
      [
        ["M", 0, 0],
        ["C", 1, 1, 2, 2, 3],
      ],
      [
        ["M", 0, 0],
        ["A", 1, 1, 2, 2],
      ],
      [
        ["M", 0, 0],
        ["l", 1, 1],
      ],
      [
        ["M", 0, 0],
        ["eval", "alert(1)"],
      ],
      "M 0 0 L 1 1",
      null,
      {},
    ].map((commands) => ({ commands })),
  )("rejects malformed or unsupported command data $commands", ({ commands }) => {
    expect(() => normalizeShapeFreePath({ ...freePath(), commands })).toThrow();
  });

  test("validates every point and control against its own viewBox axis", () => {
    for (const operation of [
      ["M", 0, 30],
      ["L", 30, 0],
      ["Q", 60, 90, 90, 45],
      ["C", 120, 0, 150, 90, 180, 30],
    ]) {
      for (let coordinate = 1; coordinate < operation.length; coordinate++)
        for (const invalid of [
          -0.1,
          coordinate % 2 ? 180.1 : 90.1,
          NaN,
          Infinity,
          -Infinity,
          "1",
          null,
          undefined,
        ]) {
          const commands =
            operation[0] === "M"
              ? [operation.slice(), ["L", 1, 1]]
              : [["M", 0, 0], operation.slice()];
          commands[operation[0] === "M" ? 0 : 1]![coordinate] = invalid as number;
          expect(() => normalizeShapeFreePath({ ...freePath(), commands })).toThrow();
        }
    }
  });

  test("rejects unknown fields, symbols, holes, inherited values and all accessors without reading them", () => {
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return 1;
      },
      enumerable: true,
    };
    const invalid: unknown[] = [
      undefined,
      null,
      "M0 0",
      [],
      { ...freePath(), tool: "svg" },
      { ...freePath(), source: "external" },
    ];
    for (const key of ["tool", "viewBox", "commands"]) {
      const path = freePath();
      Object.defineProperty(path, key, getter);
      invalid.push(path);
    }
    for (const key of ["width", "height"]) {
      const path = freePath();
      Object.defineProperty(path.viewBox, key, getter);
      invalid.push(path);
    }
    for (const target of ["commands", "tuple"] as const) {
      const path = freePath(),
        array = target === "commands" ? path.commands : path.commands[1]!;
      Object.defineProperty(array, "1", getter);
      invalid.push(path);
    }
    for (const target of ["path", "viewBox", "commands", "tuple"] as const) {
      for (const field of ["unexpected", Symbol("field")]) {
        const path = freePath(),
          value =
            target === "path"
              ? path
              : target === "viewBox"
                ? path.viewBox
                : target === "commands"
                  ? path.commands
                  : path.commands[1]!;
        Object.defineProperty(value, field, getter);
        invalid.push(path);
      }
      const path = freePath(),
        value =
          target === "path"
            ? path
            : target === "viewBox"
              ? path.viewBox
              : target === "commands"
                ? path.commands
                : path.commands[1]!;
      Object.setPrototypeOf(value, { inherited: true });
      invalid.push(path);
    }
    invalid.push({ ...freePath(), viewBox: { width: 180 } });
    const inherited = Object.create({ tool: "curve" });
    Object.assign(inherited, { viewBox: freePath().viewBox, commands: freePath().commands });
    invalid.push(inherited);
    const commandHole = freePath();
    delete (commandHole.commands as unknown[])[1];
    invalid.push(commandHole);
    const tupleHole = freePath();
    delete (tupleHole.commands[1] as unknown as unknown[])[1];
    invalid.push(tupleHole);
    for (const value of invalid) expect(() => normalizeShapeFreePath(value)).toThrow();
    expect(reads).toBe(0);
  });

  test("accepts own nonenumerable data and null-prototype data while returning ordinary detached records", () => {
    const expected = freePath(),
      path = Object.create(null);
    for (const key of ["tool", "viewBox", "commands"] as const)
      Object.defineProperty(path, key, { value: expected[key] });
    Object.setPrototypeOf(path.viewBox, null);
    expect(normalizeShapeFreePath(path)).toEqual(expected);
    expect(Object.getPrototypeOf(normalizeShapeFreePath(path))).toBe(Object.prototype);
  });

  test("sparse vertex types refer only to existing non-Z command indices and are deeply detached", () => {
    const pointTypes = { "0": "smooth", "1": "straight", "2": "smooth", "3": "straight" } as const,
      input = { ...freePath(), pointTypes },
      output = normalizeShapeFreePath(input);
    expect(output.pointTypes).toEqual(pointTypes);
    expect(output.pointTypes).not.toBe(pointTypes);
    (pointTypes as Record<string, string>)["0"] = "straight";
    expect(output.pointTypes?.["0"]).toBe("smooth");
    expect(normalizeShapeFreePath({ ...freePath(), pointTypes: {} })).toEqual(freePath());
    const closed = { ...freePath(), commands: [...freePath().commands, ["Z"]] };
    for (const key of ["-1", "-0", "01", "1.0", "1.5", "4", "2048", "NaN", "Infinity", "__proto__"])
      expect(() =>
        normalizeShapeFreePath({ ...closed, pointTypes: { [key]: "smooth" } }),
      ).toThrow();
    for (const value of [undefined, null, 1, "corner", "unknown"])
      expect(() => normalizeShapeFreePath({ ...freePath(), pointTypes: { "1": value } })).toThrow();
    for (const pointTypes of [undefined, null, [], Object.create({ "1": "smooth" })])
      expect(() => normalizeShapeFreePath({ ...freePath(), pointTypes })).toThrow();
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, "1", {
      enumerable: true,
      get() {
        reads++;
        return "smooth";
      },
    });
    expect(() => normalizeShapeFreePath({ ...freePath(), pointTypes: accessor })).toThrow(
      /accessors/,
    );
    const outer = freePath();
    Object.defineProperty(outer, "pointTypes", {
      get() {
        reads++;
        return { "1": "smooth" };
      },
    });
    expect(() => normalizeShapeFreePath(outer)).toThrow(/accessors/);
    expect(reads).toBe(0);
    const nonenumerable = Object.create(null);
    Object.defineProperty(nonenumerable, "1", { value: "straight" });
    expect(normalizeShapeFreePath({ ...freePath(), pointTypes: nonenumerable }).pointTypes).toEqual(
      { "1": "straight" },
    );
  });

  test.each([
    ["L", 0, 0],
    ["Q", 90, 90, 0, 0],
    ["C", 180, 90, 90, 90, 0, 0],
  ])(
    "canonicalizes a closed coincident %s seam to owner0 but keeps open endpoints independent",
    (...command) => {
      const open = {
          ...freePath(),
          commands: [["M", 0, 0], ["L", 90, 0], command],
          pointTypes: { "2": "smooth" },
        },
        closed = { ...open, commands: [...open.commands, ["Z"]] };
      expect(normalizeShapeFreePath(open).pointTypes).toEqual({ "2": "smooth" });
      expect(
        normalizeShapeFreePath({ ...open, pointTypes: { "0": "straight", "2": "smooth" } })
          .pointTypes,
      ).toEqual({ "0": "straight", "2": "smooth" });
      expect(normalizeShapeFreePath(closed).pointTypes).toEqual({ "0": "smooth" });
      expect(
        normalizeShapeFreePath({ ...closed, pointTypes: { "0": "smooth", "2": "smooth" } })
          .pointTypes,
      ).toEqual({ "0": "smooth" });
      expect(() =>
        normalizeShapeFreePath({ ...closed, pointTypes: { "0": "straight", "2": "smooth" } }),
      ).toThrow(/conflicting/);
      expect(normalizeShapeFreePath(normalizeShapeFreePath(closed))).toEqual(
        normalizeShapeFreePath(closed),
      );
    },
  );

  test("drawing geometry is exclusive and shape-only; open endpoints and sparse flips survive normalization", () => {
    const base = freePathDrawing();
    for (const kind of ["textBox", "wordArt", "icon", "equation", "chart", "attachment", "control"])
      expect(() => normalizeSheetDrawing({ ...base, kind } as SheetDrawing)).toThrow(
        /Only a shape/,
      );
    expect(() =>
      normalizeSheetDrawing({ ...base, kind: "camera", camera: { range: null, gridLines: true } }),
    ).toThrow(/Only a shape/);
    for (const shapeGeometry of [{ preset: "rect" }, undefined])
      expect(() => normalizeSheetDrawing({ ...base, shapeGeometry } as SheetDrawing)).toThrow(
        /mutually exclusive/,
      );
    for (const shapePath of [undefined, null, "M 0 0 L 1 1"])
      expect(() =>
        normalizeSheetDrawing({ ...base, shapePath } as unknown as SheetDrawing),
      ).toThrow();
    const decorated = {
      ...base,
      shapeFlipX: true,
      shapeFlipY: true,
      shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "open" } },
    } as SheetDrawing;
    expect(normalizeSheetDrawing(decorated)).toEqual(decorated);
    const closed: ShapeFreePath = { ...freePath(), commands: [...freePath().commands, ["Z"]] };
    expect(normalizeSheetDrawing({ ...base, shapePath: closed, shapeFlipX: true })).toMatchObject({
      shapePath: closed,
      shapeFlipX: true,
    });
    for (const shapeLineEnds of [
      decorated.kind === "shape" ? decorated.shapeLineEnds : undefined,
      {},
    ])
      expect(() => normalizeSheetDrawing({ ...base, shapePath: closed, shapeLineEnds })).toThrow(
        /open free shape path/,
      );
    expect(
      normalizeSheetDrawing({
        ...base,
        shapeFlipX: false,
        shapeFlipY: false,
      } as unknown as SheetDrawing),
    ).toEqual(base);
  });

  test("outer shapePath getters and inherited features are rejected throughout without execution", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      snapshot = serializeWorkbook(session.workbook),
      sheetSnapshot = serializeSheet(sheet);
    let reads = 0;
    const input = freePathDrawing();
    Object.defineProperty(input, "shapePath", {
      enumerable: true,
      get() {
        reads++;
        return freePath();
      },
    });
    expect(() => normalizeSheetDrawing(input)).toThrow(/accessors/);
    expect(() => createSetSheetDrawingsCommand(sheet.id, [input])).toThrow(/accessors/);
    expect(() => deserializeSheet({ ...sheetSnapshot, drawings: [input] })).toThrow(/accessors/);
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        version: 57,
        sheets: [{ ...snapshot.sheets[0], drawings: [input] }],
      }),
    ).toThrow(/accessors/);
    expect(() =>
      deserializeWorkbook({
        ...snapshot,
        version: 56,
        sheets: [{ ...snapshot.sheets[0], drawings: [input] }],
      }),
    ).toThrow(/version 57/);
    const { shapePath: _path, ...legacy } = freePathDrawing(),
      inherited = Object.create({
        get shapePath() {
          reads++;
          return freePath();
        },
      });
    Object.assign(inherited, legacy);
    expect(() => normalizeSheetDrawing(inherited)).toThrow(/own data/);
    expect(() => deserializeSheet({ ...sheetSnapshot, drawings: [inherited] })).toThrow(/own data/);
    expect(reads).toBe(0);
    const own = { ...legacy };
    Object.defineProperty(own, "shapePath", { value: freePath() });
    expect(normalizeSheetDrawing(own)).toEqual(freePathDrawing());
  });
});
