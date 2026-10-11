import { describe, expect, test } from "vitest";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import { isPictureGroup, type GroupedGroup } from "../../picture-group.js";
import { isFramedPictureObject } from "../../picture-object.js";
import { fixture, group, layouts, leaf, nested } from "./fixture.js";

describe("owned-picture Delete membership", () => {
  test("two-child deletion releases the actual survivor at the original root stacking slot", () => {
    const f = fixture(group());
    const before = structuredClone(f.sheet.floatingImages);
    const old = layouts(before, f.metrics).get("b")!;
    const next = planDeletePictureGroupNodes(f.sheet.floatingImages, [["root", "a"]], f.metrics);
    expect(next.map((root) => root.id)).toEqual(["under", "b", "above"]);
    const survivor = next[1]!;
    if (!isFramedPictureObject(survivor)) throw Error("Expected standalone survivor");
    expect(survivor.frame.anchor.mode).toBe("move-and-size");
    expect(survivor.assetId).toBe("shared-asset");
    expect(survivor.frame.source).toEqual(
      f.root.members[1]!.kind === "grouped-picture-v1"
        ? f.root.members[1]!.frame.source
        : undefined,
    );
    expect(layouts(next, f.metrics).get("b")!.rect).toEqual(old.rect);
    expect(f.sheet.floatingImages).toEqual(before);
    expect(next[0]).not.toBe(f.sheet.floatingImages[0]);
    expect((next[0] as { groupId?: string }).groupId).toBe("legacy-flat-id");
  });
  test("nested singleton dissolves into outer owner, then outer singleton dissolves", () => {
    const f = fixture();
    const old = layouts(f.sheet.floatingImages, f.metrics);
    const once = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "inner", "a"]],
      f.metrics,
    );
    const outer = once[1]!;
    if (!isPictureGroup(outer)) throw Error("Expected surviving outer group");
    expect(outer.members.map((child) => child.id)).toEqual(["b", "c"]);
    const shrunk = layouts(once, f.metrics);
    expect(shrunk.has("inner")).toBe(false);
    expect(shrunk.get("root")!.rect.width).toBeLessThan(old.get("root")!.rect.width);
    expect(shrunk.get("root")!.rect.height).toBeLessThan(old.get("root")!.rect.height);
    for (const id of ["b", "c"])
      for (const key of ["x", "y", "width", "height"] as const)
        expect(shrunk.get(id)!.rect[key]).toBeCloseTo(old.get(id)!.rect[key], 9);
    expect(outer.frame.anchor.mode).toBe("fixed");
    const twice = planDeletePictureGroupNodes(once, [["root", "b"]], f.metrics);
    expect(twice.map((root) => root.id)).toEqual(["under", "c", "above"]);
    expect(layouts(twice, f.metrics).get("c")!.rect).toEqual(old.get("c")!.rect);
  });
  test("deleting an outer sibling promotes a real subgroup without a fake asset", () => {
    const f = fixture();
    const old = layouts(f.sheet.floatingImages, f.metrics);
    const next = planDeletePictureGroupNodes(f.sheet.floatingImages, [["root", "c"]], f.metrics);
    const inner = next[1]!;
    if (!isPictureGroup(inner)) throw Error("Expected promoted subgroup");
    expect(inner.id).toBe("inner");
    expect(inner).not.toHaveProperty("assetId");
    expect(inner.members.map((node) => node.id)).toEqual(["a", "b"]);
    for (const id of ["a", "b", "inner"])
      expect(layouts(next, f.metrics).get(id)!.rect).toEqual(old.get(id)!.rect);
  });
  test("affected empty owners are removed safely and a completely empty forest is valid", () => {
    const f = fixture();
    const next = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [
        ["root", "inner", "a"],
        ["root", "inner", "b"],
      ],
      f.metrics,
    );
    expect(next.map((root) => root.id)).toEqual(["under", "c", "above"]);
    expect(planDeletePictureGroupNodes(next, [["under"], ["c"], ["above"]], f.metrics)).toEqual([]);
    expect(planDeletePictureGroupNodes([], [], f.metrics)).toEqual([]);
  });
  test("singleton dissolution cascades through arbitrary existing one-child owners", () => {
    const root = nested();
    const inner = root.members[0] as GroupedGroup;
    root.members = [inner];
    const f = fixture(root);
    const old = layouts(f.sheet.floatingImages, f.metrics).get("b")!;
    const next = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "inner", "a"]],
      f.metrics,
    );
    expect(next.map((node) => node.id)).toEqual(["under", "b", "above"]);
    expect(layouts(next, f.metrics).get("b")!.rect).toEqual(old.rect);
  });
  test("unaffected singleton ownership is retained on no-op and unrelated deletion", () => {
    const f = fixture(group([leaf("only")]));
    const next = planDeletePictureGroupNodes(f.sheet.floatingImages, [["above"]], f.metrics);
    expect(next[1]).toEqual(f.root);
    expect(planDeletePictureGroupNodes(f.sheet.floatingImages, [], f.metrics)).toEqual(
      f.sheet.floatingImages,
    );
  });
});
