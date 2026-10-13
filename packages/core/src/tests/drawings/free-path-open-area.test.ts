import { describe, expect, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import {
  isShapeFreePathClosed,
  normalizeShapeFreePath,
  type ShapeFreePath,
} from "../../shape-free-path.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";
import { freePath, freePathDrawing } from "./free-path-fixture.js";

function retainedArea(): ShapeFreePath {
  return { ...freePath(), openArea: true };
}

function rawSnapshot(drawing: unknown, version: number) {
  const session = createTestWorkbookSession(),
    snapshot = serializeWorkbook(session.workbook);
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }] };
}

describe("retained free-path area independent of open stroke", () => {
  test("normalization deeply detaches the sparse true flag, original viewBox, controls and point types", () => {
    const input = { ...retainedArea(), pointTypes: { "1": "smooth" as const } },
      expected = structuredClone(input),
      output = normalizeShapeFreePath(input);
    expect(output).toEqual(expected);
    expect(isShapeFreePathClosed(output)).toBe(false);
    expect(output.commands).not.toBe(input.commands);
    expect(output.viewBox).not.toBe(input.viewBox);
    expect(output.pointTypes).not.toBe(input.pointTypes);
    input.viewBox.width = 1;
    (input.commands[2] as unknown as (string | number)[])[1] = 1;
    (input.pointTypes as Record<string, string>)["1"] = "straight";
    expect(output).toEqual(expected);
    expect(normalizeSheetDrawing({ ...freePathDrawing(), shapePath: expected })).toEqual({
      ...freePathDrawing(),
      shapePath: expected,
    });
    expect(normalizeShapeFreePath(freePath())).not.toHaveProperty("openArea");
  });

  test("real curved two-knot areas and bowties need no signed-area or endpoint-count shortcut", () => {
    for (const commands of [
      [
        ["M", 0, 0],
        ["Q", 90, 90, 180, 0],
      ],
      [
        ["M", 0, 0],
        ["C", 180, 0, 180, 90, 0, 0],
      ],
      [
        ["M", 0, 0],
        ["L", 180, 90],
        ["L", 0, 90],
        ["L", 180, 0],
      ],
    ])
      expect(normalizeShapeFreePath({ ...retainedArea(), commands }).openArea).toBe(true);
  });

  test("shallow authored curves retain area independent of viewBox flatten tolerance", () => {
    for (const commands of [
      [
        ["M", 0, 0],
        ["Q", 0.5, 0.001, 1, 0],
      ],
      [
        ["M", 0, 0],
        ["C", 0.25, 0.001, 0.75, 0.002, 1, 0],
      ],
    ]) {
      const path = { tool: "curve", viewBox: { width: 1, height: 1 }, commands, openArea: true };
      expect(normalizeShapeFreePath(path).openArea).toBe(true);
    }
  });

  test("requires literal true, an open single contour and nondegenerate authored fill area", () => {
    for (const openArea of [false, undefined, null, 1, "true", {}])
      expect(() => normalizeShapeFreePath({ ...freePath(), openArea })).toThrow();
    expect(() =>
      normalizeShapeFreePath({ ...retainedArea(), commands: [...freePath().commands, ["Z"]] }),
    ).toThrow(/open/i);
    for (const commands of [
      [
        ["M", 0, 0],
        ["L", 180, 90],
      ],
      [
        ["M", 0, 0],
        ["L", 90, 45],
        ["L", 180, 90],
      ],
      [
        ["M", 0, 0],
        ["Q", 90, 0, 180, 0],
      ],
      [
        ["M", 0, 0],
        ["C", 60, 0, 120, 0, 0, 0],
      ],
      [
        ["M", 0, 0],
        ["L", 0, 0],
      ],
      [
        ["M", 0, 0],
        ["L", 180, 90],
        ["M", 0, 90],
        ["L", 180, 0],
      ],
    ])
      expect(() => normalizeShapeFreePath({ ...retainedArea(), commands })).toThrow();
    expect(() => normalizeShapeFreePath({ ...retainedArea(), textRect: {} })).toThrow(/Unknown/);
  });

  test("never invokes an openArea accessor and retains the aggregate curve point budget", () => {
    let reads = 0;
    const input = freePath();
    Object.defineProperty(input, "openArea", {
      enumerable: true,
      get() {
        reads++;
        return true;
      },
    });
    expect(() => normalizeShapeFreePath(input)).toThrow(/accessor/);
    expect(reads).toBe(0);
    const commands = [
      ["M", 0, 0],
      ...Array.from({ length: 2047 }, () => ["C", 180, 0, 180, 90, 0, 0]),
    ];
    expect(normalizeShapeFreePath({ ...freePath(), commands }).commands).toHaveLength(2048);
    expect(() => normalizeShapeFreePath({ ...retainedArea(), commands })).toThrow(/point budget/);
  });

  test("commands, undo, redo and sheet/workbook snapshots preserve fill, text and exact placement", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      closed = {
        ...freePathDrawing(),
        shapePath: { ...freePath(), commands: [...freePath().commands, ["Z"] as const] },
      };
    sheet.drawings = [closed];
    const before = serializeWorkbook(session.workbook),
      input: SheetGraphicDrawing = { ...freePathDrawing(), shapePath: retainedArea() },
      expected = structuredClone(input),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.shapePath!.viewBox.height = 1;
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(sheet.drawings).toEqual([expected]);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(69);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(session.history.undoStack).toHaveLength(1);
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [expected])),
    ).toBe(false);
  });

  test("raw field presence rejects versions57–68 before malformed values or accessors can be dropped", () => {
    let reads = 0;
    const accessorPath = freePath();
    Object.defineProperty(accessorPath, "openArea", {
      enumerable: true,
      get() {
        reads++;
        return true;
      },
    });
    for (const shapePath of [
      retainedArea(),
      { ...freePath(), openArea: false },
      { ...freePath(), openArea: undefined },
      accessorPath,
    ])
      for (const drawing of [
        { ...freePathDrawing(), shapePath },
        {
          ...group("owner"),
          members: [{ ...nested("inner"), members: [{ ...leaf("free"), shapePath }] }],
        },
      ])
        for (let version = 57; version < 69; version++)
          expect(() => deserializeWorkbook(rawSnapshot(drawing, version))).toThrow(/version 69/);
    expect(() =>
      deserializeWorkbook(rawSnapshot({ ...freePathDrawing(), shapePath: accessorPath }, 69)),
    ).toThrow(/accessor/);
    expect(reads).toBe(0);
  });

  test("nested group leaves select69, reject raw old containers and retain owner frames", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook),
      inner = { ...nested("inner"), members: [{ ...leaf("free"), shapePath: retainedArea() }] },
      owner = { ...group("owner"), members: [inner] };
    sheet.drawings = [owner];
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(69);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    for (let version = 57; version < 69; version++)
      expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow(/version 69/);
    inner.members[0]!.shapePath = freePath();
    expect(serializeWorkbook(session.workbook).version).toBe(61);
  });

  test("no flag keeps the prior protocol and68 cannot downgrade a mixed69 sheet", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [freePathDrawing()];
    const legacy = serializeWorkbook(session.workbook);
    expect(legacy.version).toBe(57);
    for (let version = 57; version <= 69; version++)
      expect(serializeWorkbook(deserializeWorkbook({ ...legacy, version }))).toEqual(legacy);
    const { shapePath: _path, ...textBox } = freePathDrawing();
    sheet.drawings = [
      { ...textBox, id: "text-box", kind: "textBox", shapeStyle: { rotation3d: { kind: "none" } } },
    ];
    const body = serializeWorkbook(session.workbook);
    expect(body.version).toBe(68);
    expect(serializeWorkbook(deserializeWorkbook({ ...body, version: 69 }))).toEqual(body);
    sheet.drawings.push({ ...freePathDrawing(), shapePath: retainedArea() });
    const mixed = serializeWorkbook(session.workbook);
    expect(mixed.version).toBe(69);
    expect(serializeWorkbook(deserializeWorkbook(mixed))).toEqual(mixed);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    expect(() => deserializeWorkbook({ ...mixed, version: 70 })).toThrow(/Unsupported/);
  });
});
