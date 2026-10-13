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
  type ShapeGroup3d,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { group, leaf, nested, textModel } from "../shape-groups/fixtures.js";

function camera(): ShapeGroup3d {
  return {
    rotation3d: {
      kind: "value",
      value: {
        projection: "parallel",
        xDeg: 30,
        yDeg: 0,
        zDeg: 0,
        distanceFromGroundPt: 0,
      },
    },
  };
}
function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  const input: ShapeGroupDrawing = {
    ...group("root"),
    members: [nested("inner"), leaf("ordinary")],
  };
  sheet.drawings = [input];
  return { workbook, sheet, input };
}
function rawSnapshot(input: ShapeGroupDrawing, version = 67) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "sheet" }));
  return { ...snapshot, version, sheets: [{ ...snapshot.sheets[0]!, drawings: [input] }] };
}
function owner(input: ShapeGroupDrawing, placement: "root" | "nested") {
  const result = placement === "root" ? input : input.members[0]!;
  if (result.kind !== "shapeGroup") throw Error("Expected owner");
  return result;
}

describe("internal shared group body camera snapshot67", () => {
  test("root or nested value and explicit dormant none select67, deep-round-trip and never spread into leaf carriers", () => {
    for (const choice of [camera(), { rotation3d: { kind: "none" as const } }])
      for (const placement of ["root", "nested"] as const) {
        const { workbook, sheet, input } = fixture(),
          target = owner(input, placement);
        target.group3d = choice;
        const before = serializeWorkbook(workbook);
        expect(before.version).toBe(67);
        expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
        const standalone = serializeSheet(sheet),
          restored = deserializeSheet(standalone);
        expect(serializeSheet(restored)).toEqual(standalone);
        const root = restored.drawings![0]!;
        if (root.kind !== "shapeGroup") throw Error("Expected owner");
        expect(owner(root, placement).group3d).toEqual(choice);
        expect(owner(root, placement).group3d).not.toBe(choice);
        expect(owner(root, placement).group3d!.rotation3d).not.toBe(choice.rotation3d);
        expect(root.members[1]).not.toHaveProperty("group3d");
        expect(root.members[1]).not.toHaveProperty("shapeStyle.rotation3d");
        delete target.group3d;
        expect(serializeWorkbook(workbook).version).toBe(61);
      }
  });

  test("no scene keeps old protocols and mixed newer features cannot lower67", () => {
    const { workbook, input } = fixture();
    input.group3d = undefined;
    expect(serializeWorkbook(workbook).version).toBe(61);
    expect(serializeWorkbook(workbook).sheets[0]!.drawings![0]).not.toHaveProperty("group3d");
    input.groupEffects = { glow: fullStyle().glow };
    expect(serializeWorkbook(workbook).version).toBe(65);
    input.group3d = camera();
    input.members[1] = {
      ...leaf("ordinary"),
      hidden: true,
      shapeText: {
        ...textModel(),
        characterRuns: [{ start: 0, end: 3, bold: true }],
      },
    };
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(67);
    expect(serializeWorkbook(deserializeWorkbook(before))).toEqual(before);
    delete input.group3d;
    expect(serializeWorkbook(workbook).version).toBe(66);
  });

  test("explicit raw group3d presence refuses all older advertised versions, including dormant, undefined and malformed payloads", () => {
    for (const placement of ["root", "nested"] as const)
      for (const value of [
        undefined,
        {},
        null,
        camera(),
        { rotation3d: { kind: "none" } },
        { rotation3d: { kind: "value", value: {} } },
      ]) {
        const { input } = fixture();
        Object.defineProperty(owner(input, placement), "group3d", { value, enumerable: true });
        for (let version = 1; version < 67; version++) {
          const check = expect(() => deserializeWorkbook(rawSnapshot(input, version)));
          if (version >= 25) check.toThrow(/version 67/);
          else check.toThrow();
        }
      }
    expect(() => deserializeWorkbook(rawSnapshot(group(), 68))).not.toThrow();
    expect(() => deserializeWorkbook(rawSnapshot(group(), 70))).toThrow(/Unsupported/);
  });

  test("67 and standalone inputs reject malformed details and nested active composition without invoking getters", () => {
    let reads = 0;
    for (const placement of ["root", "nested"] as const)
      for (const level of ["owner", "scene", "choice", "parameters"] as const) {
        const { input } = fixture(),
          target = owner(input, placement),
          scene = camera();
        target.group3d = scene;
        const choice = scene.rotation3d;
        if (choice.kind !== "value") throw Error("Expected value");
        const payload =
          level === "owner"
            ? target
            : level === "scene"
              ? scene
              : level === "choice"
                ? choice
                : choice.value;
        Object.defineProperty(
          payload,
          level === "owner"
            ? "group3d"
            : level === "scene"
              ? "rotation3d"
              : level === "choice"
                ? "kind"
                : "xDeg",
          {
            get() {
              reads++;
              throw Error("Getter executed");
            },
          },
        );
        expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow(/data field/);
        expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(/data field/);
        expect(() => deserializeWorkbook(rawSnapshot(input, 66))).toThrow(/version 67/);
      }
    expect(reads).toBe(0);
    for (const placement of ["root", "nested"] as const)
      for (const scene of [
        {},
        null,
        { rotation3d: { kind: "value", value: {} } },
        { rotation3d: { kind: "none" }, format3d: {} },
        Object.create({ rotation3d: { kind: "none" } }),
      ]) {
        const { input } = fixture();
        Object.defineProperty(owner(input, placement), "group3d", {
          value: scene,
          enumerable: true,
        });
        expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow();
        expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow();
      }
    const { input } = fixture();
    input.group3d = camera();
    owner(input, "nested").group3d = camera();
    expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow(/nested.*unsupported/);
  });

  test("later scenes still validate after a first valid field; no inherited or leaf owner masquerades", () => {
    const first = { ...group("first"), group3d: camera() },
      second = group("second");
    Object.defineProperty(second, "group3d", { value: {}, enumerable: true });
    const raw = rawSnapshot(first);
    expect(() =>
      deserializeWorkbook({ ...raw, sheets: [{ ...raw.sheets[0]!, drawings: [first, second] }] }),
    ).toThrow();
    const inherited = Object.assign(Object.create({ group3d: camera() }), group());
    expect(() => deserializeWorkbook(rawSnapshot(inherited))).toThrow();
    const { input } = fixture();
    Object.defineProperty(input.members[1]!, "group3d", { value: camera(), enumerable: true });
    expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow(/genuine group/);
  });

  test("scene admission retains whole-tree cycle, sparse, accessor, depth, node and unique-ID guards", () => {
    const cycle = nested("cycle");
    cycle.members = [cycle];
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
      [cycle],
      [deep],
      [accessor],
      Array(2),
      Array(MAX_SHAPE_GROUP_NODES + 1),
      [leaf("same"), leaf("same")],
    ] as ShapeGroupChild[][]) {
      const input = { ...group(), group3d: camera(), members };
      expect(() => deserializeWorkbook(rawSnapshot(input))).toThrow(
        /Cyclic|budget|data field|dense own data|Duplicate/,
      );
      expect(() => deserializeSheet(rawSnapshot(input).sheets[0])).toThrow(
        /Cyclic|budget|data field|dense own data|Duplicate/,
      );
    }
    expect(reads).toBe(0);
  });
});
