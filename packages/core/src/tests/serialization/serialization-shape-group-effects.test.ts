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
} from "../../shape-group.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const input: ShapeGroupDrawing = { ...group(), members: [nested("inner"), leaf("ordinary")] };
  sheet.drawings = [input];
  return { workbook, sheet, input };
}
function rawSnapshot(input: ShapeGroupDrawing, version = 62) {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const snapshot = serializeWorkbook(workbook);
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [input] }] };
}

describe("internal shape group effects snapshot62", () => {
  test("root and nested effects round-trip through workbook and standalone sheet snapshots", () => {
    const { workbook, sheet, input } = fixture();
    input.groupEffects = { shadow: fullStyle().shadow };
    const inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected nested group");
    inner.groupEffects = { shadow: { kind: "none" } };
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(62);
    expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    const restored = deserializeWorkbook(before);
    const root = getActiveSheet(restored).drawings![0]!;
    if (root.kind !== "shapeGroup") throw Error("Expected root group");
    expect(root.groupEffects).not.toBe(input.groupEffects);
    const child = root.members[0]!;
    if (child.kind !== "shapeGroup") throw Error("Expected restored nested group");
    expect(child.groupEffects).not.toBe(inner.groupEffects);
    delete root.groupEffects;
    expect(serializeWorkbook(restored).version).toBe(62);
    delete child.groupEffects;
    expect(serializeWorkbook(restored).version).toBe(61);
    expect(() => deserializeWorkbook({ ...before, version: 68 })).toThrow(/Unsupported/);
  });

  test("a nested shadow or explicit none alone selects62 without adding effects to its owners", () => {
    for (const shadow of [fullStyle().shadow!, { kind: "none" as const }]) {
      const { workbook, sheet, input } = fixture();
      const inner = input.members[0]!;
      if (inner.kind !== "shapeGroup") throw Error("Expected nested group");
      inner.groupEffects = { shadow };
      expect(serializeWorkbook(workbook).version).toBe(62);
      const standalone = serializeSheet(deserializeSheet(serializeSheet(sheet)));
      expect(standalone.drawings![0]).not.toHaveProperty("groupEffects");
      expect(standalone.drawings![0]).toHaveProperty("members.0.groupEffects", { shadow });
    }
    const { workbook, input } = fixture();
    input.groupEffects = { shadow: { kind: "none" } };
    expect(serializeWorkbook(workbook).version).toBe(62);
  });

  test("empty effects omit recursively and preserve61 or the earlier applicable protocol", () => {
    const { workbook, sheet, input } = fixture();
    expect(serializeWorkbook(workbook).version).toBe(61);
    input.groupEffects = {};
    const inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected nested group");
    inner.groupEffects = {};
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(61);
    expect(snapshot.sheets[0]!.drawings![0]).not.toHaveProperty("groupEffects");
    expect(snapshot.sheets[0]!.drawings![0]).not.toHaveProperty("members.0.groupEffects");
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    sheet.drawings = [framedShapeDrawing()];
    expect(serializeWorkbook(workbook).version).toBe(60);
    sheet.drawings = [{ ...legacyShapeDrawing(), shapeStyle: { shadow: { kind: "none" } } }];
    expect(serializeWorkbook(workbook).version).toBe(58);
    sheet.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(43);
  });

  test("all raw root or nested effects fields reject61, including empty or undefined payloads", () => {
    for (const placement of ["root", "nested"] as const) {
      for (const effects of [{ shadow: { kind: "none" as const } }, {}, undefined]) {
        const { input } = fixture();
        const owner = placement === "root" ? input : input.members[0]!;
        if (owner.kind !== "shapeGroup") throw Error("Expected group owner");
        owner.groupEffects = effects;
        expect(() => deserializeWorkbook(rawSnapshot(input, 61))).toThrow(/version 62/);
      }
    }
    const input = { ...group(), groupEffects: { shadow: { kind: "none" as const } } };
    for (let version = 25; version < 61; version++)
      expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(/version 61/);
  });

  test("standalone inference stays62 when owned effects coexist with older independent features", () => {
    const { sheet, input } = fixture();
    const inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected nested group");
    inner.groupEffects = { shadow: { kind: "none" } };
    sheet.drawings!.push({
      ...legacyShapeDrawing(),
      id: "styled-root",
      shapeGeometry: { preset: "rect" },
      shapeStyle: { shadow: { kind: "none" } },
      shapeFlipX: true,
    });
    const restored = deserializeSheet(serializeSheet(sheet));
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    getActiveSheet(workbook).drawings = restored.drawings;
    expect(serializeWorkbook(workbook).version).toBe(62);
  });

  test("malformed root and nested effects reject62 without executing effect accessors", () => {
    for (const effects of [
      null,
      [],
      { fill: { kind: "none" } },
      { softEdges: { kind: "none" } },
      { shadow: { kind: "value", value: { kind: "outer" } } },
      { shadow: { kind: "none", value: {} } },
    ]) {
      for (const placement of ["root", "nested"] as const) {
        const { input } = fixture();
        const owner = placement === "root" ? input : input.members[0]!;
        Object.defineProperty(owner, "groupEffects", { enumerable: true, value: effects });
        expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow();
      }
    }
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const target of ["owner", "effects", "choice", "detail"] as const) {
      const { input } = fixture();
      const owner = input.members[0]!;
      if (owner.kind !== "shapeGroup") throw Error("Expected nested group");
      owner.groupEffects = { shadow: fullStyle().shadow! };
      if (target === "owner") Object.defineProperty(owner, "groupEffects", { get: access });
      if (target === "effects")
        Object.defineProperty(owner.groupEffects, "shadow", { get: access });
      if (target === "choice")
        Object.defineProperty(owner.groupEffects.shadow!, "kind", { get: access });
      if (target === "detail") {
        const shadow = owner.groupEffects.shadow!;
        if (shadow.kind !== "value") throw Error("Expected shadow value");
        Object.defineProperty(shadow.value, "opacity", { get: access });
      }
      for (const version of [61, 62])
        expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(/data field/);
      expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(/data field/);
    }
    expect(reads).toBe(0);
  });

  test("raw nested admission rejects cycles, accessor members and exceeded existing budgets", () => {
    const cyclic = nested("cycle");
    cyclic.members = [cyclic];
    let deep: ShapeGroupChild = leaf("tip");
    for (let index = MAX_SHAPE_GROUP_DEPTH; index > 0; index--)
      deep = { ...nested(`deep-${index}`), members: [deep] };
    const wide = { ...group(), members: Array(MAX_SHAPE_GROUP_NODES + 1) as ShapeGroupChild[] };
    const accessor = nested("accessor");
    let reads = 0;
    Object.defineProperty(accessor, "members", {
      get() {
        reads++;
        throw Error("Getter executed");
      },
    });
    for (const input of [
      { ...group(), members: [cyclic] },
      { ...group(), members: [deep] },
      wide,
      { ...group(), members: [accessor] },
    ]) {
      for (const version of [61, 62])
        expect(() => deserializeWorkbook(rawSnapshot(input, version))).toThrow(
          /Cyclic|budget|data fields/,
        );
      expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(
        /Cyclic|budget|data fields/,
      );
    }
    expect(reads).toBe(0);
  });
});
