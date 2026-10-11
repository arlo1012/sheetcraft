import { describe, expect, test } from "vitest";
import { planDeletePictureGroupNodes } from "../../picture-group-delete.js";
import { pictureFrameWorldToLocal } from "../../picture-frame.js";
import { isPictureGroup, type GroupedGroup, type GroupedPicture } from "../../picture-group.js";
import { isFramedPictureObject } from "../../picture-object.js";
import { fixture, group, layouts, leaf } from "./fixture.js";

describe("Delete survivor world geometry and source retention", () => {
  test("37-degree parent contraction retains local-axis union and all composed child angles", () => {
    const root = group([leaf("a"), leaf("b", 0.5, 0.4), leaf("c", 0.7, 0.6)]);
    root.frame.angleDeg = 37;
    root.members[1]!.frame.angleDeg = 27;
    root.members[2]!.frame.angleDeg = 301;
    const f = fixture(root);
    const old = layouts(f.sheet.floatingImages, f.metrics);
    const parent = old.get("root")!;
    const expectedRects = ["b", "c"].map((id) => {
      const child = old.get(id)!;
      const center = pictureFrameWorldToLocal(parent.rect, parent.angleDeg, {
        x: child.rect.x + child.rect.width / 2,
        y: child.rect.y + child.rect.height / 2,
      });
      return {
        x: center.x - child.rect.width / 2,
        y: center.y - child.rect.height / 2,
        right: center.x + child.rect.width / 2,
        bottom: center.y + child.rect.height / 2,
      };
    });
    const next = planDeletePictureGroupNodes(f.sheet.floatingImages, [["root", "a"]], f.metrics);
    const after = layouts(next, f.metrics);
    const contracted = after.get("root")!;
    expect(contracted.angleDeg).toBe(37);
    expect(contracted.rect.width).toBeCloseTo(
      Math.max(...expectedRects.map((r) => r.right)) - Math.min(...expectedRects.map((r) => r.x)),
      9,
    );
    expect(contracted.rect.height).toBeCloseTo(
      Math.max(...expectedRects.map((r) => r.bottom)) - Math.min(...expectedRects.map((r) => r.y)),
      9,
    );
    for (const id of ["b", "c"]) {
      const before = old.get(id)!;
      const survivor = after.get(id)!;
      expect(survivor.angleDeg).toBeCloseTo(before.angleDeg, 10);
      for (const key of ["x", "y", "width", "height"] as const)
        expect(survivor.rect[key]).toBeCloseTo(before.rect[key], 9);
      survivor.corners.forEach((point, index) => {
        expect(point.x).toBeCloseTo(before.corners[index]!.x, 9);
        expect(point.y).toBeCloseTo(before.corners[index]!.y, 9);
      });
      const [a, b, c] = survivor.corners;
      expect((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)).toBeCloseTo(0, 8);
    }
  });
  test("nested rotations, hidden ownership, source crop/flips, annotations and shared assets survive promotion", () => {
    const f = fixture();
    f.root.frame.angleDeg = 37;
    const inner = f.root.members[0] as GroupedGroup;
    inner.frame.angleDeg = 13;
    inner.hidden = true;
    const b = inner.members[1] as GroupedPicture;
    b.frame.angleDeg = 27;
    b.frame.flipHorizontal = true;
    b.frame.flipVertical = true;
    b.hidden = false;
    b.lockAspectRatio = false;
    b.transform = {
      appearance: { opacity: 0.7, border: { color: "#AABBCC", width: 2 } },
      annotations: [{ kind: "pen", color: "#123456", width: 0.01, points: [{ x: 0.1, y: 0.2 }] }],
    };
    const before = structuredClone(f.sheet.floatingImages);
    const old = layouts(before, f.metrics);
    const next = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "inner", "a"]],
      f.metrics,
    );
    const outer = next[1]!;
    if (!isPictureGroup(outer)) throw Error("Expected outer");
    const promoted = outer.members[0] as GroupedPicture;
    expect(promoted.id).toBe("b");
    expect(promoted.hidden).toBe(true);
    expect(promoted.lockAspectRatio).toBe(false);
    expect(promoted.frame.source).toEqual(b.frame.source);
    expect(promoted.frame.flipHorizontal).toBe(true);
    expect(promoted.frame.flipVertical).toBe(true);
    expect(promoted.assetId).toBe(b.assetId);
    expect(promoted.transform).toEqual(b.transform);
    expect(promoted.transform).not.toBe(b.transform);
    expect(promoted.frame.source).not.toBe(b.frame.source);
    const after = layouts(next, f.metrics);
    for (const id of ["b", "c"])
      for (const key of ["x", "y", "width", "height"] as const)
        expect(after.get(id)!.rect[key]).toBeCloseTo(old.get(id)!.rect[key], 9);
    expect(after.get("b")!.angleDeg).toBeCloseTo(77, 9);
    const released = planDeletePictureGroupNodes(next, [["root", "c"]], f.metrics)[1]!;
    if (!isFramedPictureObject(released)) throw Error("Expected real standalone leaf");
    expect(released.id).toBe("b");
    expect(released.hidden).toBe(true);
    expect(released.frame.angleDeg).toBeCloseTo(77, 9);
    expect(released.frame.source).toEqual(b.frame.source);
    expect(released.transform).toEqual(b.transform);
    expect(f.sheet.floatingImages).toEqual(before);
  });
  test("a removed hidden root carries visibility to its standalone survivor", () => {
    const root = group();
    root.hidden = true;
    const f = fixture(root);
    const survivor = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "a"]],
      f.metrics,
    )[1]!;
    expect(survivor.id).toBe("b");
    expect(survivor.hidden).toBe(true);
  });
  test("retain moving root anchor mode, with move-size fallback for subpixel contraction", () => {
    const root = group([leaf("a"), leaf("b", 0.5, 0.4), leaf("c", 0.7, 0.6)]);
    root.frame.anchor = {
      mode: "move-only",
      origin: { column: { index: 1, offset: 2 }, row: { index: 2, offset: 3 } },
      size: { width: 400, height: 200 },
    };
    const f = fixture(root);
    const moving = planDeletePictureGroupNodes(
      f.sheet.floatingImages,
      [["root", "a"]],
      f.metrics,
    )[1]!;
    if (!isPictureGroup(moving)) throw Error("Expected root");
    expect(moving.frame.anchor.mode).toBe("move-only");
    const small = group([leaf("a"), leaf("b", 0.001, 0), leaf("c", 0.002, 0)]);
    for (const child of small.members)
      child.frame.rect = { ...child.frame.rect, widthRatio: 0.001, heightRatio: 0.001 };
    const tiny = fixture(small);
    const contracted = planDeletePictureGroupNodes(
      tiny.sheet.floatingImages,
      [["root", "a"]],
      tiny.metrics,
    )[1]!;
    if (!isPictureGroup(contracted)) throw Error("Expected subpixel root");
    expect(contracted.frame.anchor.mode).toBe("move-and-size");
    expect(layouts([contracted], tiny.metrics).get("root")!.rect.height).toBeCloseTo(0.2, 9);
  });
});
