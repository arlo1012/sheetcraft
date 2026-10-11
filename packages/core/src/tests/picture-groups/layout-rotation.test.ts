import { describe, expect, test } from "vitest";
import {
  anchorPictureFrameRect,
  pictureFrameLocalToWorld,
  resolvePictureLayout,
} from "../../picture-frame.js";
import {
  resolvePictureGroup,
  resolvePictureGroupChildLayout,
  unionPictureGroupLayoutRects,
} from "../../picture-group-layout.js";
import type { GroupedGroup } from "../../picture-group.js";
import { group, leaf, measuredGroup, metrics, resolvedLeaf } from "./fixtures.js";

describe("orthogonal group layout projection", () => {
  test("initial frame is the unrotated layout union, with no source bounds or handle padding", () => {
    const value = measuredGroup();
    const resolved = resolvePictureGroup(value, metrics());
    expect(resolved.layout.rect).toEqual({ x: 100, y: 100, width: 516, height: 224 });
    expect(value.frame.anchor.mode).toBe("move-and-size");
    expect(value.lockAspectRatio).toBe(false);
    const a = resolvedLeaf(resolved, 0).layout!;
    expect(a.angleDeg).toBe(37);
    expect(a.bounds.x).toBeLessThan(resolved.layout.rect.x);
    expect(a.bounds.y).toBeLessThan(resolved.layout.rect.y);
    expect(a.rect.width).toBeCloseTo(216, 10);
    expect(a.rect.height).toBeCloseTo(144, 10);
  });
  test("F-like horizontal parent stretch preserves each relative angle and right angles", () => {
    const value = measuredGroup();
    value.frame.anchor = anchorPictureFrameRect(
      "move-and-size",
      { x: 100, y: 100, width: 670.8, height: 224 },
      metrics(),
    );
    const resolved = resolvePictureGroup(value, metrics());
    const a = resolvedLeaf(resolved, 0).layout!;
    const b = resolvedLeaf(resolved, 1).layout!;
    expect(resolved.layout.rect.width).toBeCloseTo(670.8, 10);
    expect(a.rect.x).toBeCloseTo(100, 10);
    expect(a.rect.y).toBeCloseTo(100, 10);
    expect(a.rect.width).toBeCloseTo(280.8, 10);
    expect(a.rect.height).toBeCloseTo(144, 10);
    expect(b.rect.x).toBeCloseTo(490, 10);
    expect(b.rect.y).toBeCloseTo(180, 10);
    expect(b.rect.width).toBeCloseTo(280.8, 10);
    expect(a.angleDeg).toBe(37);
    expect(b.angleDeg).toBe(0);
    const [p, q, r] = a.corners;
    const dot = (q.x - p.x) * (r.x - q.x) + (q.y - p.y) * (r.y - q.y);
    expect(dot).toBeCloseTo(0, 8);
    expect(value.members[0]!.frame.angleDeg).toBe(37);
  });
  test("parent rotation orbits child centers and composes angles without swapping dimensions", () => {
    const value = measuredGroup();
    value.frame.anchor = anchorPictureFrameRect(
      "move-and-size",
      { x: 100, y: 100, width: 670.8, height: 224 },
      metrics(),
    );
    value.frame.angleDeg = 37;
    const resolved = resolvePictureGroup(value, metrics());
    const a = resolvedLeaf(resolved, 0).layout!;
    const b = resolvedLeaf(resolved, 1).layout!;
    const center = pictureFrameLocalToWorld(resolved.layout.rect, 37, { x: 140.4, y: 72 });
    expect(a.rect.x + a.rect.width / 2).toBeCloseTo(center.x, 10);
    expect(a.rect.y + a.rect.height / 2).toBeCloseTo(center.y, 10);
    expect(a.angleDeg).toBe(74);
    expect(b.angleDeg).toBe(37);
    expect(a.rect.width).toBeCloseTo(280.8, 10);
    expect(a.rect.height).toBeCloseTo(144, 10);
    expect(resolved.layout.rect.width).toBeCloseTo(670.8, 10);
    expect(resolved.layout.rect.height).toBeCloseTo(224, 10);
  });
  test("nested relative rotations compose per owner and preserve out-of-frame children", () => {
    const child = leaf();
    child.frame.rect = { xRatio: -1, yRatio: 2, widthRatio: 0.5, heightRatio: 0.25 };
    child.frame.angleDeg = 13;
    const nested: GroupedGroup = {
      kind: "grouped-group-v1",
      id: "inner",
      altText: "inner",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0.2, yRatio: 0.3, widthRatio: 0.5, heightRatio: 0.5 },
        angleDeg: 323,
      },
      members: [child],
    };
    const value = { ...group(), members: [nested] };
    value.frame.angleDeg = 37;
    const resolved = resolvePictureGroup(value, metrics());
    const subgroup = resolved.members[0]!;
    if (!("members" in subgroup)) throw new Error("Expected nested group.");
    expect(subgroup.layout!.angleDeg).toBe(0);
    expect(subgroup.layout!.rect.width).toBe(100);
    const picture = subgroup.members[0]!;
    if ("members" in picture) throw new Error("Expected nested picture.");
    expect(picture.path).toEqual(["group", "inner", "leaf"]);
    expect(picture.layout!.angleDeg).toBe(13);
    expect(picture.layout!.rect.width).toBe(50);
    expect(picture.layout!.rect.height).toBe(12.5);
    expect(picture.layout!.rect.x).toBeCloseTo(subgroup.layout!.rect.x - 100, 10);
    expect(picture.layout!.rect.y).toBeCloseTo(subgroup.layout!.rect.y + 100, 10);
  });
  test("source ratios and flips stay leaf-only and do not reframe a group", () => {
    const value = group();
    const child = value.members[0]!;
    if (child.kind !== "grouped-picture-v1") throw new Error("Expected fixture leaf.");
    child.frame.source = {
      widthRatio: 2,
      heightRatio: 0.5,
      offsetXRatio: -0.25,
      offsetYRatio: 0.5,
    };
    child.frame.flipHorizontal = true;
    child.frame.flipVertical = false;
    const resolved = resolvePictureGroup(value, metrics());
    const picture = resolvedLeaf(resolved, 0);
    expect(resolved.layout.rect).toEqual({ x: 100, y: 100, width: 200, height: 100 });
    expect(picture.layout!.sourceRect).toEqual({ x: 25, y: 137.5, width: 200, height: 25 });
    expect(picture.node.frame.source).toEqual(child.frame.source);
    expect(picture.node.frame.flipHorizontal).toBe(true);
    expect(picture.node.frame.flipVertical).toBe(false);
    expect(resolved.node.frame).not.toHaveProperty("source");
  });
  test("union rejects collapsed input and unrepresentable combined endpoints", () => {
    expect(() => unionPictureGroupLayoutRects([])).toThrow();
    expect(() => unionPictureGroupLayoutRects([{ x: 0, y: 0, width: 0, height: 1 }])).toThrow();
    expect(() =>
      unionPictureGroupLayoutRects([
        { x: -1e308, y: 0, width: 1e307, height: 1 },
        { x: 1e308, y: 0, width: 1e307, height: 1 },
      ]),
    ).toThrow();
  });
  test("child placement validates the source-free layout without manufacturing an anchor", () => {
    const result = resolvePictureGroupChildLayout(
      resolvePictureLayout({ x: 0, y: 0, width: 200, height: 100 }, 90),
      {
        rect: { xRatio: 0, yRatio: 0, widthRatio: 0.5, heightRatio: 0.5 },
        angleDeg: 270,
      },
    )!;
    expect(result.rect).toEqual({ x: 75, y: -25, width: 100, height: 50 });
    expect(result.angleDeg).toBe(0);
    expect(result).not.toHaveProperty("sourceRect");
    expect(result).not.toHaveProperty("anchor");
  });
});
