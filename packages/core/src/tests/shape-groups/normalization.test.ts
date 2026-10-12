import { describe, expect, test } from "vitest";
import {
  areShapeGroupChildrenEqual,
  areShapeGroupsEqual,
  cloneShapeGroup,
  cloneShapeGroupChild,
  collectShapeGroupAssetIds,
  collectShapeGroupNodeIds,
  findShapeGroupNode,
  isShapeGroupDrawing,
  isShapeGroupedGroup,
  isShapeGroupNode,
  isSheetGroupedGraphicDrawing,
  normalizeShapeGroup,
  normalizeShapeGroupLocalFrame,
  traverseShapeGroup,
} from "../../shape-group.js";
import { group, leaf, localFrame, nested, textModel, texture } from "./fixtures.js";

function assertDetached(source: unknown, target: unknown): void {
  if (!source || typeof source !== "object") return;
  expect(target).not.toBe(source);
  for (const [key, value] of Object.entries(source))
    assertDetached(value, (target as Record<string, unknown>)[key]);
}

describe("shape-owned group normalization", () => {
  test("canonical clone deeply detaches shape, text-box, geometry, fonts, metadata and image fills", () => {
    const a = leaf("a");
    a.shapeGeometry = { preset: "rect" };
    a.shapeFlipX = true;
    a.shapeFlipY = true;
    a.shapeStyle = { fill: { kind: "value", value: texture("body-fill") } };
    a.shapeText = {
      ...textModel(),
      style: { fill: { kind: "value", value: texture("glyph-fill") } },
    };
    a.shapeProperties = { lockAspectRatio: true, altTitle: "A", altDescription: "Details" };
    const b = leaf("b", "textBox");
    b.shapeText = { ...textModel(), style: { fill: { kind: "none" } } };
    const inner = { ...nested("inner"), members: [b], shapeProperties: { locked: false as const } };
    const input = {
      ...group(),
      shapeProperties: { printObject: false as const, altTitle: "Group" },
      members: [a, inner],
    };
    const normalized = normalizeShapeGroup(input);
    expect(normalized).toEqual(input);
    assertDetached(input, normalized);
    const clone = cloneShapeGroup(input);
    expect(areShapeGroupsEqual(input, clone)).toBe(true);
    expect(areShapeGroupChildrenEqual(a, cloneShapeGroupChild(a))).toBe(true);
    assertDetached(a, cloneShapeGroupChild(a));
    expect([...collectShapeGroupAssetIds(normalized)]).toEqual(["body-fill", "glyph-fill"]);
    for (const { node } of traverseShapeGroup(normalized)) {
      expect(node).not.toHaveProperty("anchor");
      expect(node).not.toHaveProperty("width");
      expect(node).not.toHaveProperty("height");
      expect(node).not.toHaveProperty("source");
      if ("groupFrame" in node) expect(node.groupFrame).not.toHaveProperty("angleDeg");
    }
    clone.members[0]!.name = "Changed";
    expect(areShapeGroupsEqual(input, clone)).toBe(false);
  });
  test("finite rotations canonicalize once and sparse properties remain independently owned", () => {
    const value = group();
    value.rotation = -360;
    value.members[0]!.rotation = 757;
    const normalized = normalizeShapeGroup(value);
    expect(Object.is(normalized.rotation, -0)).toBe(false);
    expect(normalized.rotation).toBe(0);
    expect(normalized.members[0]!.rotation).toBe(37);
    expect(normalized).not.toHaveProperty("shapeProperties");
    expect(normalized.members[0]).not.toHaveProperty("shapeProperties");
    const frame = localFrame();
    frame.rect.xRatio = -0;
    frame.rect.yRatio = -2;
    expect(normalizeShapeGroupLocalFrame(frame).rect).toEqual({
      xRatio: 0,
      yRatio: -2,
      widthRatio: 0.5,
      heightRatio: 0.5,
    });
  });
  test("root, nested and leaf guards distinguish ownership without reading getters", () => {
    expect(isShapeGroupDrawing(group())).toBe(true);
    expect(isShapeGroupDrawing(nested())).toBe(false);
    expect(isShapeGroupedGroup(nested())).toBe(true);
    expect(isShapeGroupedGroup(group())).toBe(false);
    expect(isSheetGroupedGraphicDrawing(leaf())).toBe(true);
    expect(isSheetGroupedGraphicDrawing(leaf("t", "textBox"))).toBe(true);
    expect(isShapeGroupNode(nested())).toBe(true);
    expect(isShapeGroupNode({ kind: "picture" })).toBe(false);
    let reads = 0;
    const accessor = {
      get kind() {
        reads++;
        return "shapeGroup";
      },
      shapeFrame: {},
    };
    expect(isShapeGroupDrawing(accessor)).toBe(false);
    expect(reads).toBe(0);
  });
  test("bounded paths follow IDs and exact owner chains in source preorder", () => {
    const inner = { ...nested("inner"), members: [leaf("a"), leaf("b", "textBox")] };
    const value = { ...group("root"), members: [leaf("first"), inner] };
    const visits = traverseShapeGroup(value);
    expect(visits.map(({ node }) => node.id)).toEqual(["root", "first", "inner", "a", "b"]);
    expect(visits[0]!.parentPath).toBeNull();
    expect(findShapeGroupNode(value, ["root", "inner", "a"])!.node).toBe(inner.members[0]);
    expect(findShapeGroupNode(value, ["root", "a"])).toBeUndefined();
    expect(findShapeGroupNode(value, ["other", "inner", "a"])).toBeUndefined();
    expect([...collectShapeGroupNodeIds(value)]).toEqual(["root", "first", "inner", "a", "b"]);
    expect(() => findShapeGroupNode(value, Array(34).fill("root"))).toThrow(/budget/);
  });
});
