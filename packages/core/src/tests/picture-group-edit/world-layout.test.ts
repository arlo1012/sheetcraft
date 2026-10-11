import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "../../picture-frame.js";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "../../picture-group-edit.js";
import { placePictureGroupChild } from "../../picture-group-layout.js";
import { normalizePictureGroup } from "../../picture-group.js";
import { childNodes, fixture, resolvedNodes } from "./fixture.js";

describe("owned child world edits use the exact immediate owner", () => {
  test("inverse placement through nested rotated anisotropic hidden owners retains all leaf content", () => {
    const f = fixture();
    const before = structuredClone(f.root);
    const lease = leasePictureGroupNode(f.root, f.path);
    const original = resolvedNodes(f.root, f.metrics);
    const world = resolvePictureLayout({ x: 400, y: -100, width: 216, height: 144 }, 74);
    const expected = placePictureGroupChild(original.inner.layout!, world);
    const next = applyPictureGroupChildWorldEdit(f.root, lease, world, f.metrics);
    const picture = childNodes(next).picture;
    expect(expected.status).toBe("placed");
    if (expected.status !== "placed") throw new Error("Expected placement.");
    expect(picture.frame.rect).toEqual(expected.frame.rect);
    expect(picture.frame.angleDeg).toBe(expected.frame.angleDeg);
    expect({
      ...picture,
      frame: { ...picture.frame, rect: f.picture.frame.rect, angleDeg: 27 },
    }).toEqual(f.picture);
    expect(next.members.map((member) => member.id)).toEqual(["inner", "root-sibling"]);
    expect(childNodes(next).inner.members.map((member) => member.id)).toEqual([
      "picture",
      "inner-sibling",
    ]);
    const restored = resolvedNodes(next, f.metrics).picture;
    expect(restored.visible).toBe(false);
    for (let index = 0; index < world.corners.length; index++) {
      expect(restored.layout!.corners[index]!.x).toBeCloseTo(world.corners[index]!.x, 9);
      expect(restored.layout!.corners[index]!.y).toBeCloseTo(world.corners[index]!.y, 9);
    }
    expect(f.root).toEqual(before);
    expect(next).not.toBe(f.root);
    expect(picture.frame.source).not.toBe(f.picture.frame.source);
    expect(picture.transform!.annotations![0]!.points).not.toBe(
      f.picture.transform!.annotations![0]!.points,
    );
  });
  test("repeated exact world no-ops preserve every stored local number and optional false flag", () => {
    const f = fixture();
    const before = JSON.stringify(normalizePictureGroup(f.root));
    let next = f.root;
    for (let count = 0; count < 30; count++) {
      const world = resolvedNodes(next, f.metrics).picture.layout!;
      const lease = leasePictureGroupNode(next, f.path);
      next = applyPictureGroupChildWorldEdit(next, lease, world, f.metrics);
    }
    expect(JSON.stringify(next)).toBe(before);
    expect(next).toEqual(f.root);
    expect(childNodes(next).picture.frame.flipVertical).toBe(false);
    expect(childNodes(next).picture.lockAspectRatio).toBe(false);
  });
  test("metadata-only intent through the current world preserves geometry and all source/style data", () => {
    const f = fixture();
    const world = resolvedNodes(f.root, f.metrics).picture.layout!;
    const next = applyPictureGroupChildWorldEdit(
      f.root,
      leasePictureGroupNode(f.root, f.path),
      world,
      f.metrics,
      { metadata: { altText: "Updated", hidden: false, lockAspectRatio: true } },
    );
    expect(childNodes(next).picture).toEqual({
      ...f.picture,
      altText: "Updated",
      hidden: false,
      lockAspectRatio: true,
    });
    expect(f.picture.hidden).toBe(true);
  });
  test("moving/resizing a container keeps descendants local and orthogonal without affine shear", () => {
    const f = fixture();
    const world = resolvePictureLayout({ x: -200, y: 400, width: 800, height: 180 }, 323);
    const next = applyPictureGroupChildWorldEdit(
      f.root,
      leasePictureGroupNode(f.root, ["root", "inner"]),
      world,
      f.metrics,
    );
    const nodes = resolvedNodes(next, f.metrics);
    expect(childNodes(next).inner.members).toEqual(f.inner.members);
    expect(nodes.inner.layout!.angleDeg).toBe(323);
    expect(nodes.picture.layout!.angleDeg).toBe(350);
    expect(nodes.picture.layout!.rect.width).toBe(800 * f.picture.frame.rect.widthRatio);
    expect(nodes.picture.layout!.rect.height).toBe(180 * f.picture.frame.rect.heightRatio);
    const [a, b, c] = nodes.picture.layout!.corners;
    expect((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)).toBeCloseTo(0, 8);
    expect(next.members[1]).toEqual(f.root.members[1]);
    expect(f.inner.frame.angleDeg).toBe(13);
  });
});
