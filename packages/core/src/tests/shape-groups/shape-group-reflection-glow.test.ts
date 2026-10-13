import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import { ungroupShapeRoot } from "../../shape-group-planning.js";
import {
  SHAPE_GROUP_EFFECT_CATEGORIES,
  areShapeGroupChildrenEqual,
  areShapeGroupsEqual,
  cloneShapeGroup,
  cloneShapeGroupChild,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  normalizeShapeGroupEffects,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
  type ShapeGroupEffects,
} from "../../shape-group.js";
import { serializeWorkbook } from "../../serialization.js";
import { normalizeShapeStyle, type ShapeDetailedStyle } from "../../shape-style.js";
import { getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, metrics, nested } from "./fixtures.js";

function effects(): ShapeGroupEffects {
  const { shadow, reflection, glow } = fullStyle();
  return { shadow, reflection, glow };
}
function assertDetached(source: unknown, target: unknown): void {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}
function fixture(): ShapeGroupDrawing {
  return {
    ...group("root"),
    groupEffects: effects(),
    members: [
      {
        ...nested("inner"),
        groupEffects: { reflection: { kind: "none" }, glow: fullStyle().glow },
        members: [
          { ...leaf("a"), shapeStyle: { reflection: fullStyle().reflection } },
          leaf("b", "textBox"),
        ],
      },
      leaf("c"),
    ],
  };
}

describe("owned shape group reflection and glow", () => {
  test("shares exactly the shape contracts, retaining sparse choices and explicit none independently", () => {
    expect(SHAPE_GROUP_EFFECT_CATEGORIES).toEqual(["shadow", "reflection", "glow"]);
    expectTypeOf<ShapeGroupEffects["reflection"]>().toEqualTypeOf<
      ShapeDetailedStyle["reflection"]
    >();
    expectTypeOf<ShapeGroupEffects["glow"]>().toEqualTypeOf<ShapeDetailedStyle["glow"]>();
    const inputs: ShapeGroupEffects[] = [
      { reflection: fullStyle().reflection },
      { glow: fullStyle().glow },
      { reflection: { kind: "none" } },
      { glow: { kind: "none" } },
      { reflection: { kind: "none" }, glow: fullStyle().glow },
      effects(),
    ];
    for (const input of inputs) {
      const normalized = normalizeShapeGroupEffects(input);
      expect(normalized).toEqual(normalizeShapeStyle(input));
      expect(Object.keys(normalized!)).toEqual(Object.keys(input));
      assertDetached(input, normalized);
      expect(normalizeShapeGroupEffects(Object.assign(Object.create(null), input))).toEqual(
        normalized,
      );
    }
    expect(normalizeShapeGroupEffects(undefined)).toBeUndefined();
    expect(normalizeShapeGroupEffects({})).toBeUndefined();
    expect(normalizeShapeGroup({ ...group(), groupEffects: undefined })).not.toHaveProperty(
      "groupEffects",
    );
    expect(normalizeShapeGroupChild({ ...nested(), groupEffects: {} })).not.toHaveProperty(
      "groupEffects",
    );
  });

  test("root and nested choices deep-clone, participate in equality, and never inherit to children", () => {
    const input = fixture(),
      clone = cloneShapeGroup(input);
    expect(clone).toEqual(input);
    assertDetached(input, clone);
    expect(areShapeGroupsEqual(input, clone)).toBe(true);
    const inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected inner owner");
    const childClone = cloneShapeGroupChild(inner);
    expect(areShapeGroupChildrenEqual(inner, childClone)).toBe(true);
    expect(clone.members[1]).not.toHaveProperty("groupEffects");
    expect(childClone.members.every((member) => !Object.hasOwn(member, "groupEffects"))).toBe(true);
    childClone.groupEffects = { ...childClone.groupEffects, glow: { kind: "none" } };
    expect(areShapeGroupChildrenEqual(inner, childClone)).toBe(false);
    clone.members[0] = childClone;
    expect(areShapeGroupsEqual(input, clone)).toBe(false);
    const absent = cloneShapeGroup(input);
    delete absent.groupEffects!.reflection;
    expect(areShapeGroupsEqual(input, absent)).toBe(false);
    let id = 0;
    const copied = cloneShapeRootsForClipboard([input], { createId: () => `copy-${++id}` });
    expect(copied[0]).toHaveProperty("groupEffects", input.groupEffects);
    expect(copied[0]).toHaveProperty("members.0.groupEffects", inner.groupEffects);
    expect(copied[0]).not.toHaveProperty("members.1.groupEffects");
    assertDetached(
      input.groupEffects,
      copied[0]!.kind === "shapeGroup" ? copied[0]!.groupEffects : undefined,
    );
  });

  test("rejects unsupported owner fields, unknown choice details and out-of-range or missing values", () => {
    for (const key of ["fill", "line", "softEdges", "format3d", "rotation3d", "theme", "source"])
      expect(() => normalizeShapeGroupEffects({ ...effects(), [key]: { kind: "none" } })).toThrow(
        /Unknown/,
      );
    const invalid: unknown[] = [
      { reflection: undefined },
      { glow: undefined },
      { reflection: { kind: "none", value: {} } },
      { glow: { kind: "inherit" } },
      { reflection: { kind: "value", value: {} } },
      { glow: { kind: "value", value: { color: { kind: "automatic" }, opacity: 1 } } },
    ];
    const reflection = fullStyle().reflection!,
      glow = fullStyle().glow!;
    if (reflection.kind !== "value" || glow.kind !== "value") throw Error("Expected effect values");
    for (const [key, value] of [
      ["size", 2],
      ["opacity", -1],
      ["blurPt", Infinity],
      ["distancePt", -1],
      ["extra", 0],
    ] as const)
      invalid.push({ reflection: { kind: "value", value: { ...reflection.value, [key]: value } } });
    for (const [key, value] of [
      ["opacity", NaN],
      ["sizePt", -1],
      ["extra", 0],
    ] as const)
      invalid.push({ glow: { kind: "value", value: { ...glow.value, [key]: value } } });
    for (const input of invalid) {
      expect(() => normalizeShapeGroupEffects(input)).toThrow();
      expect(() =>
        normalizeShapeGroup({ ...group(), groupEffects: input } as ShapeGroupDrawing),
      ).toThrow();
      expect(() =>
        normalizeShapeGroupChild({ ...nested(), groupEffects: input } as ShapeGroupChild),
      ).toThrow();
    }
    expect(() =>
      normalizeShapeGroupChild({ ...leaf(), groupEffects: effects() } as ShapeGroupChild),
    ).toThrow(/Unknown/);
  });

  test("own data guards reject category, choice, detail and nested color getters without reading them", () => {
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const category of ["reflection", "glow"] as const) {
      for (const level of ["category", "choice", "detail"] as const) {
        const input = effects(),
          choice = input[category]!;
        if (choice.kind !== "value") throw Error("Expected effect value");
        const target = level === "category" ? input : level === "choice" ? choice : choice.value;
        Object.defineProperty(
          target,
          level === "category" ? category : level === "choice" ? "kind" : "opacity",
          { get: access },
        );
        expect(() => normalizeShapeGroupEffects(input)).toThrow(/data fields/);
      }
      expect(() =>
        normalizeShapeGroupEffects(Object.create({ [category]: { kind: "none" } })),
      ).toThrow(/ordinary/);
    }
    const input = effects();
    if (input.glow?.kind !== "value" || input.glow.value.color.kind !== "theme")
      throw Error("Expected theme glow");
    Object.defineProperty(input.glow.value.color.reference, "slot", { get: access });
    expect(() => normalizeShapeGroupEffects(input)).toThrow(/data fields/);
    for (const owner of [group(), nested()]) {
      Object.defineProperty(owner, "groupEffects", { get: access });
      expect(() =>
        "shapeFrame" in owner ? normalizeShapeGroup(owner) : normalizeShapeGroupChild(owner),
      ).toThrow(/data fields/);
    }
    expect(() => normalizeShapeGroupEffects({ ...effects(), [Symbol("effect")]: 1 })).toThrow(
      /Unknown/,
    );
    expect(reads).toBe(0);
  });

  test("one-level releases retain child-owned effects; released leaves receive no removed owner effects", () => {
    const input = fixture(),
      before = structuredClone(input);
    const inner = input.members[0]!;
    if (inner.kind !== "shapeGroup") throw Error("Expected inner owner");
    for (const released of [
      ungroupShapeRoot([input], input.id, metrics()),
      planDeleteShapeGroupNodes([input], [[input.id, "c"]], metrics()),
    ]) {
      const promoted = released.find((root) => root.id === "inner");
      expect(promoted).toHaveProperty("groupEffects", inner.groupEffects);
      expect(promoted).toHaveProperty("members", inner.members);
      const leaves = ungroupShapeRoot(released, "inner", metrics());
      expect(leaves.every((root) => !Object.hasOwn(root, "groupEffects"))).toBe(true);
      expect(leaves.find((root) => root.id === "a")).toHaveProperty("shapeStyle", {
        reflection: fullStyle().reflection,
      });
    }
    const nestedDissolution = planDeleteShapeGroupNodes(
      [input],
      [[input.id, "inner", "b"]],
      metrics(),
    );
    expect(nestedDissolution[0]).toHaveProperty("groupEffects", input.groupEffects);
    expect(nestedDissolution[0]).toHaveProperty("members.0.id", "a");
    expect(nestedDissolution[0]).not.toHaveProperty("members.0.groupEffects");
    const recursiveDissolution = planDeleteShapeGroupNodes(
      [input],
      [
        [input.id, "c"],
        [input.id, "inner", "b"],
      ],
      metrics(),
    );
    expect(recursiveDissolution.map((root) => root.id)).toEqual(["a"]);
    expect(recursiveDissolution[0]).not.toHaveProperty("groupEffects");
    expect(input).toEqual(before);
  });

  test("collection replacement deep-owns choices, skips equal edits and restores exact Undo/Redo snapshots", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [group("root")];
    const before = serializeWorkbook(session.workbook),
      input = fixture();
    const command = createSetSheetDrawingsCommand(sheet.id, [input]);
    input.groupEffects = {};
    expect(executeWorkbookCommand(session, command)).toBe(true);
    const after = serializeWorkbook(session.workbook);
    expect(after.version).toBe(65);
    expect(after.sheets[0]!.drawings![0]).toHaveProperty("groupEffects", effects());
    expect(
      executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [fixture()])),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });

  test("Ungroup and recursive singleton deletion drop only dissolved effects through exact history", () => {
    for (const action of ["ungroup", "delete"] as const) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook),
        input = fixture();
      sheet.drawings = [input];
      const before = serializeWorkbook(session.workbook);
      const next =
        action === "ungroup"
          ? ungroupShapeRoot(ungroupShapeRoot([input], "root", metrics()), "inner", metrics())
          : planDeleteShapeGroupNodes(
              [input],
              [
                ["root", "c"],
                ["root", "inner", "b"],
              ],
              metrics(),
            );
      expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, next))).toBe(
        true,
      );
      const after = serializeWorkbook(session.workbook);
      expect(after.version).toBe(60);
      expect(sheet.drawings!.every((root) => !Object.hasOwn(root, "groupEffects"))).toBe(true);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(session.workbook)).toEqual(after);
    }
  });
});
