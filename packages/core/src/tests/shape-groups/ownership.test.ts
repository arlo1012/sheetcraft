import { describe, expect, test } from "vitest";
import {
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  normalizeShapeGroupCollection,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { group, leaf, localFrame, nested, textModel } from "./fixtures.js";

function chain(depth: number): ShapeGroupDrawing {
  let child: ShapeGroupChild = leaf("tip");
  for (let index = depth - 1; index > 0; index--)
    child = { ...nested(`inner-${index}`), members: [child] };
  return { ...group(), members: [child] };
}

describe("strict bounded shape group ownership", () => {
  test("rejects every competing placement/source/angle owner and ineligible leaf kind", () => {
    for (const field of [
      "anchor",
      "offsetX",
      "offsetY",
      "width",
      "height",
      "frame",
      "source",
      "angleDeg",
    ]) {
      expect(() => normalizeShapeGroup({ ...group(), [field]: 1 } as ShapeGroupDrawing)).toThrow();
      expect(() =>
        normalizeShapeGroupChild({ ...leaf(), [field]: 1 } as ShapeGroupChild),
      ).toThrow();
      expect(() =>
        normalizeShapeGroupChild({ ...nested(), [field]: 1 } as ShapeGroupChild),
      ).toThrow();
    }
    expect(() =>
      normalizeShapeGroupChild({ ...leaf(), shapeFrame: group().shapeFrame } as ShapeGroupChild),
    ).toThrow();
    for (const kind of ["picture", "wordArt", "icon", "equation", "chart", "camera", "control"])
      expect(() => normalizeShapeGroupChild({ ...leaf(), kind } as ShapeGroupChild)).toThrow();
    for (const field of ["rotation", "angleDeg", "width", "source", "anchor"])
      expect(() =>
        normalizeShapeGroupChild({ ...leaf(), groupFrame: { ...localFrame(), [field]: 0 } }),
      ).toThrow();
    expect(() =>
      normalizeShapeGroup({
        ...group(),
        shapeFrame: { ...group().shapeFrame, angleDeg: 0 },
      } as ShapeGroupDrawing),
    ).toThrow();
  });
  test("ordinary own data records and dense plain arrays reject accessors before evaluation", () => {
    let reads = 0;
    const access = () => {
      reads++;
      throw Error("Getter executed");
    };
    for (const target of ["members", "id", "rotation"] as const) {
      const value = group();
      Object.defineProperty(value, target, { get: access });
      expect(() => normalizeShapeGroup(value)).toThrow(/data fields|root shape group/);
    }
    for (const target of ["entry", "method", "iterator", "sparse", "prototype"] as const) {
      const value = group();
      if (target === "entry") Object.defineProperty(value.members, "0", { get: access });
      if (target === "method") Object.defineProperty(value.members, "map", { value: access });
      if (target === "iterator")
        Object.defineProperty(value.members, Symbol.iterator, { value: access });
      if (target === "sparse") delete value.members[0];
      if (target === "prototype")
        Object.setPrototypeOf(value.members, {
          get 0() {
            return access();
          },
        });
      expect(() => normalizeShapeGroup(value)).toThrow(/array|data fields|dense/);
    }
    for (const target of ["local", "text", "properties", "frame"] as const) {
      const a = { ...leaf(), shapeText: textModel(), shapeProperties: { altTitle: "A" } };
      const value = { ...group(), members: [a] };
      if (target === "local") Object.defineProperty(a.groupFrame.rect, "xRatio", { get: access });
      if (target === "text") Object.defineProperty(a.shapeText.layout, "wrap", { get: access });
      if (target === "properties")
        Object.defineProperty(a.shapeProperties, "altTitle", { get: access });
      if (target === "frame")
        Object.defineProperty(value.shapeFrame.anchor, "mode", { get: access });
      expect(() => normalizeShapeGroup(value)).toThrow(/data fields|accessors/);
    }
    expect(reads).toBe(0);
    expect(() =>
      normalizeShapeGroup(Object.assign(Object.create({ hidden: true }), group())),
    ).toThrow(/ordinary/);
    expect(() => normalizeShapeGroup({ ...group(), [Symbol("hidden")]: true })).toThrow(/Unknown/);
  });
  test("whole-tree duplicate and reused ownership rejection happens before leaf appearance clone", () => {
    const shared = leaf();
    expect(() => normalizeShapeGroup({ ...group(), members: [shared, shared] })).toThrow(/shared/);
    const cyclic = nested();
    cyclic.members = [cyclic];
    expect(() => normalizeShapeGroup({ ...group(), members: [cyclic] })).toThrow(/Cyclic/);
    const rootCycle = group();
    rootCycle.members = [rootCycle as unknown as ShapeGroupChild];
    expect(() => normalizeShapeGroup(rootCycle)).toThrow(/Cyclic/);
    const one = group("one"),
      two = group("two");
    two.members = one.members;
    expect(() => normalizeShapeGroupCollection([one, two])).toThrow(/shared/);
    let reads = 0;
    const invalidAppearance = leaf("duplicate");
    invalidAppearance.shapeText = textModel();
    Object.defineProperty(invalidAppearance.shapeText.layout, "wrap", {
      get: () => {
        reads++;
        throw Error("Cloned too soon");
      },
    });
    expect(() =>
      normalizeShapeGroup({ ...group(), members: [invalidAppearance, leaf("duplicate")] }),
    ).toThrow(/Duplicate/);
    expect(reads).toBe(0);
    expect(() => normalizeShapeGroup({ ...group(), members: [leaf("group")] })).toThrow(
      /Duplicate/,
    );
    const a = group("a"),
      b = group("b");
    b.members[0]!.id = a.members[0]!.id;
    expect(() => normalizeShapeGroupCollection([a, b])).toThrow(/Duplicate/);
  });
  test("accepts exact ownership budgets and rejects excess without truncation", () => {
    expect(() => normalizeShapeGroup(chain(MAX_SHAPE_GROUP_DEPTH))).not.toThrow();
    expect(() => normalizeShapeGroup(chain(MAX_SHAPE_GROUP_DEPTH + 1))).toThrow(/depth budget/);
    const value = {
      ...group(),
      members: Array.from({ length: MAX_SHAPE_GROUP_NODES - 1 }, (_, index) =>
        leaf(`leaf-${index}`),
      ),
    };
    expect(normalizeShapeGroup(value).members).toHaveLength(MAX_SHAPE_GROUP_NODES - 1);
    value.members.push(leaf("extra"));
    expect(() => normalizeShapeGroup(value)).toThrow(/node budget/);
    expect(value.members).toHaveLength(MAX_SHAPE_GROUP_NODES);
    expect(() => normalizeShapeGroup({ ...group(), members: [] })).toThrow(/at least one/);
    expect(normalizeShapeGroup({ ...group(), members: [leaf()] }).members).toHaveLength(1);
  });
  test("finite signed positions and positive local spans reject malformed and accessor fields", () => {
    for (const [field, number] of [
      ["xRatio", NaN],
      ["yRatio", Infinity],
      ["widthRatio", 0],
      ["heightRatio", -1],
    ] as const) {
      const value = leaf();
      value.groupFrame.rect[field] = number;
      expect(() => normalizeShapeGroupChild(value)).toThrow();
    }
    const value = leaf();
    value.groupFrame.rect.xRatio = -2;
    value.groupFrame.rect.yRatio = 3;
    expect(normalizeShapeGroupChild(value)).toEqual(value);
    value.rotation = Infinity;
    expect(() => normalizeShapeGroupChild(value)).toThrow(/finite/);
    expect(() =>
      normalizeShapeGroupChild({
        ...leaf(),
        shapeProperties: { unknown: true },
      } as ShapeGroupChild),
    ).toThrow(/Unknown/);
  });
});
