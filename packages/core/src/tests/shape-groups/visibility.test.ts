import { describe, expect, test } from "vitest";
import {
  cloneShapeGroup,
  isShapeGroupPathVisible,
  MAX_SHAPE_GROUP_DEPTH,
  MAX_SHAPE_GROUP_NODES,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  traverseShapeGroup,
  traverseShapeGroupVisibility,
  type ShapeGroupChild,
  type ShapeGroupDrawing,
} from "../../shape-group.js";
import { group, leaf, nested } from "./fixtures.js";

function fixture(): ShapeGroupDrawing {
  return {
    ...group("root"),
    members: [nested("inner"), leaf("plain"), { ...leaf("hidden", "textBox"), hidden: true }],
  };
}

describe("owned shape visibility", () => {
  test("inherits visibility while retaining node identity, paths, owner order and each own flag", () => {
    const source = fixture();
    source.members[0]!.hidden = true;
    const visits = traverseShapeGroupVisibility(source);
    expect(
      visits.map(({ node, visible, inheritedHidden }) => [node.id, visible, inheritedHidden]),
    ).toEqual([
      ["root", true, false],
      ["inner", false, false],
      ["inner-leaf", false, true],
      ["plain", true, false],
      ["hidden", false, false],
    ]);
    expect(visits.map(({ node, path }) => ({ node, path }))).toEqual(
      traverseShapeGroup(source).map(({ node, path }) => ({ node, path })),
    );
    expect(visits[1]!.node).toBe(source.members[0]);
    expect(source.members[0]).toHaveProperty("hidden", true);
    expect(visits[2]!.node).not.toHaveProperty("hidden");
    expect(isShapeGroupPathVisible(source, ["root", "inner", "inner-leaf"])).toBe(false);
    expect(isShapeGroupPathVisible(source, ["root", "plain"])).toBe(true);
    expect(isShapeGroupPathVisible(source, ["root", "missing"])).toBe(false);
    source.hidden = true;
    expect(traverseShapeGroupVisibility(source).every(({ visible }) => !visible)).toBe(true);
    delete source.hidden;
    delete source.members[0]!.hidden;
    expect(isShapeGroupPathVisible(source, ["root", "inner", "inner-leaf"])).toBe(true);
    expect(isShapeGroupPathVisible(source, ["root", "hidden"])).toBe(false);
  });

  test("normalization and clone retain sparse root/nested/leaf state, while false omits at every depth", () => {
    const source = fixture();
    source.hidden = true;
    source.members[0]!.hidden = true;
    expect(cloneShapeGroup(source)).toEqual(source);
    const clone = cloneShapeGroup(source);
    expect(clone).not.toBe(source);
    expect(clone.members[0]).not.toBe(source.members[0]);
    for (const { node } of traverseShapeGroup(source))
      Object.defineProperty(node, "hidden", { value: false, configurable: true });
    for (const { node } of traverseShapeGroup(normalizeShapeGroup(source)))
      expect(node).not.toHaveProperty("hidden");
    expect(
      normalizeShapeGroupChild({ ...nested(), hidden: false } as unknown as ShapeGroupChild),
    ).not.toHaveProperty("hidden");
  });

  test("every owner and leaf rejects nonboolean hidden data, unknown fields and accessors", () => {
    let reads = 0;
    for (const path of [0, 1, 2, 3]) {
      for (const invalid of [undefined, null, 1, "true", {}, []]) {
        const source = fixture();
        const node = path === 0 ? source : source.members[path - 1]!;
        Object.defineProperty(node, "hidden", { value: invalid });
        expect(() => normalizeShapeGroup(source)).toThrow(/boolean/);
        expect(() => traverseShapeGroupVisibility(source)).toThrow(/boolean/);
      }
      const source = fixture(),
        node = path === 0 ? source : source.members[path - 1]!;
      Object.defineProperty(node, "hidden", {
        get() {
          reads++;
          return true;
        },
      });
      expect(() => normalizeShapeGroup(source)).toThrow(/data fields/);
      expect(() => traverseShapeGroupVisibility(source)).toThrow(/data fields/);
    }
    expect(reads).toBe(0);
    expect(() =>
      normalizeShapeGroup({ ...fixture(), hidden: true, visible: false } as ShapeGroupDrawing),
    ).toThrow(/Unknown/);
    const source = Object.assign(Object.create({ hidden: true }), fixture());
    expect(() => normalizeShapeGroup(source)).toThrow(/own data/);
  });

  test("visibility helpers retain all cycle, node, depth and dense path admission limits", () => {
    const cyclic = fixture();
    cyclic.members = [cyclic as unknown as ShapeGroupChild];
    expect(() => traverseShapeGroupVisibility(cyclic)).toThrow(/Cyclic/);
    const wide = fixture();
    wide.members = Array.from({ length: MAX_SHAPE_GROUP_NODES }, (_, i) => leaf(`leaf-${i}`));
    expect(() => traverseShapeGroupVisibility(wide)).toThrow(/budget/);
    let child: ShapeGroupChild = leaf("end");
    for (let i = 0; i <= MAX_SHAPE_GROUP_DEPTH; i++)
      child = { ...nested(`depth-${i}`), members: [child] };
    const deep = { ...group(), members: [child] };
    expect(() => traverseShapeGroupVisibility(deep)).toThrow(/depth/);
    expect(() => isShapeGroupPathVisible(fixture(), Array(2))).toThrow(/dense/);
  });
});
