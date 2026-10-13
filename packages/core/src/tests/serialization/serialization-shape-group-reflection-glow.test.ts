import { describe, expect, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import {
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupEffects,
} from "../../shape-group.js";
import { normalizeSheetDrawings } from "../../sheet-drawings.js";
import { createWorkbook, getActiveSheet, setCellValue } from "../../workbook.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  const input: ShapeGroupDrawing = { ...group(), members: [nested("inner"), leaf("ordinary")] };
  sheet.drawings = [input];
  return { workbook, sheet, input };
}
function rawSnapshot(input: ShapeGroupDrawing, version = 65) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "sheet" }));
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [input] }] };
}
function owner(input: ShapeGroupDrawing, placement: "root" | "nested") {
  const result = placement === "root" ? input : input.members[0]!;
  if (result.kind !== "shapeGroup") throw Error("Expected owner");
  return result;
}

describe("internal shape group reflection and glow snapshot65", () => {
  test("single root or nested none/value independently selects65, deep-round-trips and never spreads", () => {
    for (const category of ["reflection", "glow"] as const)
      for (const choice of [fullStyle()[category]!, { kind: "none" as const }])
        for (const placement of ["root", "nested"] as const) {
          const { workbook, sheet, input } = fixture(),
            target = owner(input, placement);
          target.groupEffects = { [category]: choice };
          const before = serializeWorkbook(workbook);
          expect(before.version).toBe(65);
          expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
          const standalone = serializeSheet(sheet),
            restoredSheet = deserializeSheet(standalone);
          expect(serializeSheet(restoredSheet)).toEqual(standalone);
          const restored = restoredSheet.drawings![0]!;
          if (restored.kind !== "shapeGroup") throw Error("Expected root owner");
          const restoredTarget = owner(restored, placement);
          expect(restoredTarget.groupEffects).toEqual({ [category]: choice });
          expect(restoredTarget.groupEffects).not.toBe(target.groupEffects);
          expect(restoredTarget.groupEffects![category]).not.toBe(choice);
          expect(restored.members[1]).not.toHaveProperty("groupEffects");
          const inner = owner(restored, "nested");
          expect(inner.members[0]).not.toHaveProperty("groupEffects");
          if (placement === "nested") expect(restored).not.toHaveProperty("groupEffects");
          else expect(inner).not.toHaveProperty("groupEffects");
          delete target.groupEffects;
          expect(serializeWorkbook(workbook).version).toBe(61);
        }
  });

  test("mixed new choices coexist with shadow, nested connectors, visibility and older independent features", () => {
    const { workbook, sheet, input } = fixture(),
      inner = owner(input, "nested");
    const target = {
      ...leaf("target"),
      shapeGeometry: { preset: "rect" as const },
      hidden: true as const,
    };
    const connection = {
      ...leaf("connection"),
      text: "",
      shapeGeometry: { preset: "bentConnector3" as const },
      shapeConnector: {
        kind: "shape-connector-v1" as const,
        begin: { kind: "site" as const, targetId: "target", preset: "rect" as const, siteIndex: 3 },
        end: { kind: "free" as const, xRatio: 1, yRatio: 1 },
      },
    };
    inner.members = [target, connection, { ...leaf("text", "textBox"), shapeFlipX: true }];
    input.groupEffects = { shadow: fullStyle().shadow, reflection: fullStyle().reflection };
    inner.groupEffects = { reflection: { kind: "none" }, glow: fullStyle().glow };
    sheet.drawings = normalizeSheetDrawings([
      {
        ...legacyShapeDrawing(),
        id: "legacy",
        shapeGeometry: { preset: "rect" },
        shapeStyle: { glow: { kind: "none" } },
        shapeFlipY: true,
      },
      input,
    ]);
    setCellValue(sheet, { row: 0, column: 0 }, "Independent cell");
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(65);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    getActiveSheet(workbook).drawings = deserializeSheet(standalone).drawings;
    expect(serializeWorkbook(workbook).version).toBe(65);
    expect(snapshot.sheets[0]!.drawings![1]).toHaveProperty(
      "members.0.members.1.shapeConnector.begin.targetId",
      "target",
    );
    expect(snapshot.sheets[0]!.drawings![1]).toHaveProperty("members.0.members.0.hidden", true);
  });

  test("empty or undefined owner effects omit without upgrading old protocols; leaf styles stay58", () => {
    const { workbook, sheet, input } = fixture(),
      inner = owner(input, "nested");
    input.groupEffects = {};
    inner.groupEffects = undefined;
    const empty = serializeWorkbook(workbook);
    expect(empty.version).toBe(61);
    expect(empty.sheets[0]!.drawings![0]).not.toHaveProperty("groupEffects");
    expect(empty.sheets[0]!.drawings![0]).not.toHaveProperty("members.0.groupEffects");
    inner.groupEffects = { shadow: { kind: "none" } };
    expect(serializeWorkbook(workbook).version).toBe(62);
    inner.members = [
      {
        ...leaf("connection"),
        text: "",
        shapeGeometry: { preset: "bentConnector3" },
        shapeConnector: {
          kind: "shape-connector-v1",
          begin: { kind: "free", xRatio: 0, yRatio: 0 },
          end: { kind: "free", xRatio: 1, yRatio: 1 },
        },
      },
    ];
    expect(serializeWorkbook(workbook).version).toBe(63);
    input.hidden = true;
    expect(serializeWorkbook(workbook).version).toBe(64);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    sheet.drawings = [
      {
        ...legacyShapeDrawing(),
        shapeStyle: { reflection: fullStyle().reflection, glow: { kind: "none" } },
      },
    ];
    expect(serializeWorkbook(workbook).version).toBe(58);
    sheet.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(43);
  });

  test("raw new-category presence refuses61 through64 even for undefined, empty or malformed choices", () => {
    for (const category of ["reflection", "glow"])
      for (const choice of [undefined, {}, { kind: "none" }, { kind: "value", value: {} }])
        for (const placement of ["root", "nested"] as const) {
          const { input } = fixture(),
            target = owner(input, placement);
          Object.defineProperty(target, "groupEffects", {
            value: { [category]: choice },
            enumerable: true,
          });
          for (let version = 61; version < 65; version++)
            expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(/version 65/);
        }
    const input = { ...group(), groupEffects: { reflection: { kind: "none" as const } } };
    for (let version = 25; version < 61; version++)
      expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(/version 61/);
    expect(() => deserializeWorkbook(rawSnapshot(input, 66))).toThrow(/Unsupported/);
  });

  test("65 still rejects malformed, inherited, symbol and unknown categories at every owner depth", () => {
    const reflection = fullStyle().reflection!,
      glow = fullStyle().glow!;
    if (reflection.kind !== "value" || glow.kind !== "value") throw Error("Expected effect values");
    const invalid: unknown[] = [
      null,
      [],
      { reflection: undefined },
      { glow: { kind: "none", value: {} } },
      { reflection: { kind: "value", value: { ...reflection.value, size: 2 } } },
      { glow: { kind: "value", value: { ...glow.value, sizePt: -1 } } },
      Object.create({ reflection: { kind: "none" } }),
      { [Symbol("glow")]: { kind: "none" } },
    ];
    for (const key of ["fill", "line", "softEdges", "format3d", "rotation3d", "theme", "source"])
      invalid.push({ reflection: { kind: "none" }, [key]: { kind: "none" } });
    for (const effects of invalid)
      for (const placement of ["root", "nested"] as const) {
        const { input } = fixture();
        Object.defineProperty(owner(input, placement), "groupEffects", {
          value: effects,
          enumerable: true,
        });
        expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow();
        expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow();
      }
  });

  test("raw new choices reject getters in admission and normalization without executing any accessor", () => {
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const category of ["reflection", "glow"] as const)
      for (const placement of ["root", "nested"] as const)
        for (const level of ["owner", "category", "choice", "detail", "color"] as const) {
          if (level === "color" && category !== "glow") continue;
          const { input } = fixture(),
            target = owner(input, placement);
          const effects: ShapeGroupEffects = { [category]: fullStyle()[category] };
          target.groupEffects = effects;
          const choice = effects[category]!;
          if (choice.kind !== "value") throw Error("Expected effect value");
          if (level === "owner") Object.defineProperty(target, "groupEffects", { get: access });
          if (level === "category") Object.defineProperty(effects, category, { get: access });
          if (level === "choice") Object.defineProperty(choice, "kind", { get: access });
          if (level === "detail") Object.defineProperty(choice.value, "opacity", { get: access });
          if (level === "color") {
            const glow = effects.glow!;
            if (glow.kind !== "value" || glow.value.color.kind !== "theme")
              throw Error("Expected theme glow");
            Object.defineProperty(glow.value.color.reference, "slot", { get: access });
          }
          for (let version = 61; version <= 65; version++)
            expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(
              /version 65|data field/,
            );
          expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(/data field/);
        }
    expect(reads).toBe(0);
  });

  test("new effects do not bypass cyclic, sparse, accessor or depth and node owner graph guards", () => {
    const cyclic = nested("cycle");
    cyclic.members = [cyclic];
    let deep: ShapeGroupChild = leaf("tip");
    for (let index = MAX_SHAPE_GROUP_DEPTH; index > 0; index--)
      deep = { ...nested(`deep-${index}`), members: [deep] };
    let reads = 0;
    const accessor = nested("accessor");
    Object.defineProperty(accessor, "members", {
      get() {
        reads++;
        throw Error("Getter executed");
      },
    });
    for (const members of [
      [cyclic],
      [deep],
      [accessor],
      Array(2),
      Array(MAX_SHAPE_GROUP_NODES + 1),
    ] as ShapeGroupChild[][]) {
      const input = { ...group(), groupEffects: { glow: { kind: "none" as const } }, members };
      expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow(
        /Cyclic|budget|data fields|dense own data/,
      );
      expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(
        /Cyclic|budget|data fields|dense own data/,
      );
    }
    expect(reads).toBe(0);
  });
});
