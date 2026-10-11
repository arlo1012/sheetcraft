import { describe, expect, test } from "vitest";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupNode,
} from "@sheetcraft/core/picture-group-layout";
import { flipPictureGroup } from "../../picture-group-geometry.js";
import { firstLeaf, group, metrics } from "./fixture.js";

function leaves(node: ResolvedPictureGroupNode): ResolvedPictureGroupNode[] {
  return "members" in node ? node.members.flatMap(leaves) : [node];
}

describe("orthogonal owned group reflection", () => {
  test.each(["horizontal", "vertical"] as const)(
    "%s reflection mirrors every actual leaf around the root world center",
    (axis) => {
      const original = group("fixed", 37);
      const leaf = firstLeaf(original);
      original.members = [
        {
          kind: "grouped-group-v1",
          id: "nested",
          altText: "Nested",
          frame: {
            kind: "group-local-frame-v1",
            rect: { xRatio: -0.2, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.8 },
            angleDeg: 21,
          },
          members: [leaf],
        },
        original.members[1]!,
      ];
      const untouched = structuredClone(original);
      const before = resolvePictureGroup(original, metrics);
      const next = flipPictureGroup(original, axis, metrics);
      const after = resolvePictureGroup(next, metrics);
      expect(after.layout.rect).toEqual(before.layout.rect);
      const center = {
        x: before.layout.rect.x + before.layout.rect.width / 2,
        y: before.layout.rect.y + before.layout.rect.height / 2,
      };
      const oldLeaves = leaves(before),
        newLeaves = leaves(after);
      expect(newLeaves.map((entry) => entry.node.id)).toEqual(
        oldLeaves.map((entry) => entry.node.id),
      );
      for (let index = 0; index < oldLeaves.length; index++) {
        const a = oldLeaves[index]!.layout!,
          b = newLeaves[index]!.layout!;
        expect(b.rect.width).toBeCloseTo(a.rect.width, 10);
        expect(b.rect.height).toBeCloseTo(a.rect.height, 10);
        expect(b.rect.x + b.rect.width / 2).toBeCloseTo(
          axis === "horizontal"
            ? 2 * center.x - (a.rect.x + a.rect.width / 2)
            : a.rect.x + a.rect.width / 2,
          10,
        );
        expect(b.rect.y + b.rect.height / 2).toBeCloseTo(
          axis === "vertical"
            ? 2 * center.y - (a.rect.y + a.rect.height / 2)
            : a.rect.y + a.rect.height / 2,
          10,
        );
        expect(b.angleDeg).toBe((360 - a.angleDeg) % 360);
      }
      const newLeaf = leaves(after)[0]!.node;
      if (newLeaf.kind !== "grouped-picture-v1") throw new Error("Expected a real leaf.");
      expect(newLeaf.assetId).toBe(leaf.assetId);
      expect(newLeaf.transform).toEqual(leaf.transform);
      expect(newLeaf.frame.source[axis === "horizontal" ? "offsetXRatio" : "offsetYRatio"]).toBe(
        -leaf.frame.source[axis === "horizontal" ? "offsetXRatio" : "offsetYRatio"],
      );
      expect(original).toEqual(untouched);
      const restored = resolvePictureGroup(flipPictureGroup(next, axis, metrics), metrics);
      for (let index = 0; index < oldLeaves.length; index++) {
        const a = oldLeaves[index]!.layout!,
          b = leaves(restored)[index]!.layout!;
        expect(b.rect.x).toBeCloseTo(a.rect.x, 10);
        expect(b.rect.y).toBeCloseTo(a.rect.y, 10);
        expect(b.angleDeg).toBe(a.angleDeg);
      }
    },
  );

  test("invalid hidden source and invalid axis refuse without mutating the source", () => {
    const original = group();
    original.hidden = true;
    firstLeaf(original).frame.source.widthRatio = Number.MAX_VALUE;
    const before = structuredClone(original);
    expect(() => flipPictureGroup(original, "horizontal", metrics)).toThrow();
    expect(original).toEqual(before);
    expect(() => flipPictureGroup(group(), "diagonal" as "horizontal", metrics)).toThrow(/axis/);
  });
});
