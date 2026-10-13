import { describe, expect, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { normalizeSheetDrawings, type SheetDrawing } from "../../sheet-drawings.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

function snapshotWith(drawings: SheetDrawing[], version = 64) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "sheet" }));
  const raw = { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings }] };
  const { dateSystem: _dateSystem, ...old } = raw;
  return version < 3 ? old : raw;
}
function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  const target = {
    ...leaf("target"),
    shapeGeometry: { preset: "rect" as const },
    hidden: true as const,
  };
  const connection = {
    ...leaf("connection"),
    shapeGeometry: { preset: "bentConnector3" as const },
    text: "",
    shapeConnector: {
      kind: "shape-connector-v1" as const,
      begin: { kind: "site" as const, targetId: "target", preset: "rect" as const, siteIndex: 3 },
      end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
    },
  };
  const owner = {
    ...group("owner"),
    groupEffects: { shadow: { kind: "none" as const } },
    members: [
      { ...nested("inner"), hidden: true as const, members: [target, connection] },
      { ...leaf("text", "textBox"), shapeFlipX: true as const, shapeFlipY: true as const },
    ],
  };
  sheet.drawings = normalizeSheetDrawings([
    { ...legacyShapeDrawing(), id: "legacy", shapeFlipX: true },
    owner,
  ]);
  return { workbook, sheet };
}

describe("internal shape controls snapshot64", () => {
  test("selects64 for real new state, preserves nested connectors and infers maximum after older independent features", () => {
    const { workbook, sheet } = fixture(),
      snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(64);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    const inferred = createWorkbook({ id: "workbook", sheetId: "sheet" });
    getActiveSheet(inferred).drawings = deserializeSheet(standalone).drawings;
    expect(serializeWorkbook(inferred).version).toBe(64);
    expect(snapshot.sheets[0]!.drawings![1]).toHaveProperty(
      "members.0.members.1.shapeConnector.begin.targetId",
      "target",
    );
    expect(snapshot.sheets[0]!.drawings![1]).toHaveProperty("members.0.members.0.hidden", true);
  });

  test("false controls do not upgrade canonical writes or alter any applicable older protocol", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" }),
      sheet = getActiveSheet(workbook);
    for (const [drawing, version] of [
      [legacyShapeDrawing(), 43],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "ellipse" } }, 54],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "ellipse" }, shapeFlipX: true }, 56],
      [framedShapeDrawing(), 60],
      [group(), 61],
      [{ ...group(), groupEffects: { shadow: { kind: "none" } } }, 62],
    ] as const) {
      sheet.drawings = [drawing];
      const before = serializeWorkbook(workbook);
      expect(before.version).toBe(version);
      sheet.drawings = [{ ...drawing, hidden: false } as unknown as SheetDrawing];
      expect(serializeWorkbook(workbook)).toEqual(before);
      expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
    }
    for (const kind of ["shape", "textBox"] as const) {
      sheet.drawings = [{ ...legacyShapeDrawing(), kind }];
      const before = serializeWorkbook(workbook);
      sheet.drawings = [
        {
          ...legacyShapeDrawing(),
          kind,
          shapeFlipX: false,
          shapeFlipY: false,
        } as unknown as SheetDrawing,
      ];
      expect(serializeWorkbook(workbook)).toEqual(before);
    }
    const { workbook: connected, sheet: connectedSheet } = fixture();
    const owner = connectedSheet.drawings![1]!;
    if (owner.kind !== "shapeGroup") throw Error("Expected owner");
    const inner = owner.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected inner");
    delete inner.hidden;
    delete inner.members[0]!.hidden;
    owner.members.pop();
    connectedSheet.drawings = [owner];
    const older = serializeWorkbook(connected);
    expect(older.version).toBe(63);
    expect(serializeWorkbook(deserializeWorkbook(older))).toEqual(older);
  });

  test("every older version refuses new field presence, including false and undefined at all depths", () => {
    for (let version = 1; version < 64; version++)
      for (const value of [true, false, undefined])
        for (const key of ["hidden", "shapeFlipX", "shapeFlipY"])
          for (const kind of ["shape", "textBox"] as const)
            expect(() =>
              deserializeWorkbook(
                snapshotWith(
                  [{ ...legacyShapeDrawing(), kind, [key]: value } as SheetDrawing],
                  version,
                ),
              ),
            ).toThrow(/version 64/);
    for (const location of ["root", "owner", "leaf", "text"] as const)
      for (const value of [true, false, undefined]) {
        const root = { ...group(), members: [nested(), leaf("text", "textBox")] };
        const inner = root.members[0]!;
        if (inner.kind !== "shapeGroup") throw Error("Expected owner");
        const node =
          location === "root"
            ? root
            : location === "owner"
              ? inner
              : location === "leaf"
                ? inner.members[0]!
                : root.members[1]!;
        Object.defineProperty(node, "hidden", { value });
        expect(() => deserializeWorkbook(snapshotWith([root], 63))).toThrow(/version 64/);
      }
    for (const key of ["shapeFlipX", "shapeFlipY"])
      for (const value of [true, false, undefined]) {
        const root = { ...group(), members: [nested(), leaf("text", "textBox")] };
        Object.defineProperty(root.members[1]!, key, { value });
        expect(() => deserializeWorkbook(snapshotWith([root], 63))).toThrow(/version 64/);
        const inner = root.members[0]!;
        if (inner.kind !== "shapeGroup") throw Error("Expected owner");
        Object.defineProperty(inner.members[0]!, key, { value });
        expect(() => deserializeWorkbook(snapshotWith([root], 63))).toThrow(/version 64/);
      }
  });

  test("new admission and standalone inference reject accessors, inherited controls and accessor collections without reads", () => {
    let reads = 0;
    const get = () => {
      reads++;
      throw Error("Accessor executed");
    };
    for (const key of ["hidden", "shapeFlipX", "shapeFlipY"]) {
      const drawing = legacyShapeDrawing();
      Object.defineProperty(drawing, key, { enumerable: true, get });
      expect(() => deserializeWorkbook(snapshotWith([drawing]))).toThrow(/data|accessor/);
      expect(() => deserializeSheet(snapshotWith([drawing]).sheets[0])).toThrow(/data|accessor/);
      expect(() => deserializeWorkbook(snapshotWith([drawing], 63))).toThrow(/version 64/);
      const inherited = Object.assign(
        Object.create({
          get [key]() {
            return get();
          },
        }),
        legacyShapeDrawing(),
      );
      expect(() => deserializeWorkbook(snapshotWith([inherited]))).toThrow(/own data/);
    }
    const source = snapshotWith([]).sheets[0]!;
    Object.defineProperty(source, "drawings", { enumerable: true, get });
    expect(() => deserializeSheet(source)).toThrow(/data fields/);
    const array = [legacyShapeDrawing()];
    Object.defineProperty(array, "0", { get });
    expect(() => deserializeSheet({ ...snapshotWith([]).sheets[0], drawings: array })).toThrow(
      /data/,
    );
    expect(reads).toBe(0);
  });
});
