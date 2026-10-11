import { describe, expect, test } from "vitest";
import { groupPictureRoots, ungroupPictureRoot } from "../../picture-group-planning.js";
import { isPictureGroup, clonePictureGroup, traversePictureGroup } from "../../picture-group.js";
import { resolvePictureGroup } from "../../picture-group-layout.js";
import { isFramedPictureObject } from "../../picture-object.js";
import { resolvePictureFrame, anchorPictureFrameRect } from "../../picture-frame.js";
import { fixture, groupedFixture } from "./fixture.js";

describe("explicit durable root grouping", () => {
  test("noncontiguous roots retain sibling order and the group uses layout boxes, not rotated bounds", () => {
    const f = fixture();
    const before = structuredClone(f.sheet.floatingImages);
    const result = groupPictureRoots(
      f.sheet.floatingImages,
      ["b", "a"],
      { id: "g", altText: "Group" },
      f.metrics,
    );
    expect(result.map((root) => root.id)).toEqual(["middle", "g"]);
    const group = result[1]!;
    if (!isPictureGroup(group)) throw Error("Expected group");
    expect(group.members.map((child) => child.id)).toEqual(["a", "b"]);
    expect(group.lockAspectRatio).toBe(false);
    expect(group.frame.anchor.mode).toBe("move-and-size");
    const resolved = resolvePictureGroup(group, f.metrics);
    expect(resolved.layout.rect).toEqual({ x: 194, y: 74, width: 622, height: 144 });
    expect(resolved.members[0]!.layout!.angleDeg).toBe(37);
    expect(f.sheet.floatingImages).toEqual(before);
  });
  test("nonuniform parent resizing preserves a rotated member's orthogonal local angle and ungroup has no jump", () => {
    const f = groupedFixture();
    const group = clonePictureGroup(f.group);
    const old = resolvePictureGroup(group, f.metrics);
    group.frame.anchor = anchorPictureFrameRect(
      "move-and-size",
      { ...old.layout.rect, width: old.layout.rect.width * 1.3 },
      f.metrics,
    );
    const resized = resolvePictureGroup(group, f.metrics);
    const child = resized.members[0]!.layout!;
    expect(child.angleDeg).toBe(37);
    expect(child.rect.width).toBeCloseTo(216 * 1.3);
    expect(child.rect.height).toBeCloseTo(144);
    const [a, b, c] = child.corners;
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    expect(dot).toBeCloseTo(0, 8);
    const roots = ungroupPictureRoot([group], group.id, f.metrics);
    const first = roots[0]!;
    if (!isFramedPictureObject(first)) throw Error("Expected standalone frame");
    expect(first.frame.anchor.mode).toBe("move-and-size");
    const released = resolvePictureFrame(first.frame, f.metrics);
    released.corners.forEach((point, index) => {
      expect(point.x).toBeCloseTo(child.corners[index]!.x, 9);
      expect(point.y).toBeCloseTo(child.corners[index]!.y, 9);
    });
    const original = group.members[0]!;
    if (original.kind !== "grouped-picture-v1") throw Error("Expected leaf");
    expect(first.frame.source).toEqual(original.frame.source);
    expect(first.frame.flipHorizontal).toBe(true);
    expect(first.transform).toEqual(original.transform);
  });
  test("nested grouping and one-level ungroup preserve child identities and visibility", () => {
    const f = groupedFixture();
    f.group.hidden = true;
    const nested = groupPictureRoots(
      f.sheet.floatingImages,
      ["middle", "group"],
      { id: "outer", altText: "Outer" },
      f.metrics,
    );
    const outer = nested[0]!;
    if (!isPictureGroup(outer)) throw Error("Expected group");
    expect(traversePictureGroup(outer).map((visit) => visit.path.join("/"))).toEqual([
      "outer",
      "outer/middle",
      "outer/group",
      "outer/group/a",
      "outer/group/b",
    ]);
    const released = ungroupPictureRoot(nested, "outer", f.metrics);
    expect(released.map((root) => root.id)).toEqual(["middle", "group"]);
    expect(released[1]!.hidden).toBe(true);
    const inner = released[1]!;
    if (!isPictureGroup(inner)) throw Error("Expected nested group remains owned");
    const leaves = ungroupPictureRoot([inner], inner.id, f.metrics);
    expect(leaves.every((leaf) => leaf.hidden)).toBe(true);
  });
  test.each(["missing", "duplicate", "collision", "inside-id"] as const)(
    "invalid %s grouping is atomic",
    (kind) => {
      const f = groupedFixture();
      const before = structuredClone(f.sheet.floatingImages);
      const ids =
        kind === "duplicate"
          ? ["middle", "middle"]
          : kind === "missing"
            ? ["middle", "missing"]
            : kind === "inside-id"
              ? ["middle", "a"]
              : ["middle", "group"];
      expect(() =>
        groupPictureRoots(
          f.sheet.floatingImages,
          ids,
          { id: kind === "collision" ? "a" : "new", altText: "New" },
          f.metrics,
        ),
      ).toThrow();
      expect(f.sheet.floatingImages).toEqual(before);
    },
  );
});
