import { describe, expect, test } from "vitest";
import {
  arePictureGroupsEqual,
  clonePictureGroup,
  clonePictureGroupChild,
  normalizePictureGroup,
  normalizePictureGroupChild,
  normalizePictureGroupLocalRect,
  type GroupedGroup,
  type GroupedPicture,
  type PictureGroup,
} from "../../picture-group.js";
import { group, leaf } from "./fixtures.js";

describe("durable owned picture group normalization", () => {
  test("clones source, local geometry, annotations and appearance without adding active anchors", () => {
    const picture = leaf();
    picture.frame.source = {
      widthRatio: 0.5,
      heightRatio: 2,
      offsetXRatio: -1,
      offsetYRatio: 0.25,
    };
    picture.frame.flipHorizontal = true;
    picture.frame.flipVertical = false;
    picture.hidden = false;
    picture.lockAspectRatio = true;
    picture.transform = {
      appearance: { opacity: 0.8, border: { color: "#AABBCC", width: 2 } },
      annotations: [{ kind: "pen", points: [{ x: 0.1, y: 0.2 }], color: "#123456", width: 0.01 }],
    };
    const subgroup: GroupedGroup = {
      kind: "grouped-group-v1",
      id: "inner",
      altText: "Inside",
      hidden: false,
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: -0.2, yRatio: 1.5, widthRatio: 2, heightRatio: 0.8 },
        angleDeg: -37,
      },
      members: [picture],
    };
    const original = { ...group(), members: [subgroup] };
    const copied = clonePictureGroup(original);
    expect(arePictureGroupsEqual(original, copied)).toBe(true);
    const nested = copied.members[0] as GroupedGroup;
    const child = nested.members[0] as GroupedPicture;
    expect(nested.frame.angleDeg).toBe(323);
    expect(child.frame.flipVertical).toBe(false);
    expect(child.hidden).toBe(false);
    expect(child.lockAspectRatio).toBe(true);
    expect(child).not.toHaveProperty("anchor");
    expect(copied).not.toHaveProperty("assetId");
    expect(copied.frame).not.toHaveProperty("source");
    child.frame.rect.xRatio = 0.7;
    child.frame.source.offsetXRatio = 3;
    child.transform!.annotations![0]!.points[0]!.x = 0.9;
    child.transform!.appearance!.border!.width = 3;
    nested.members.push(leaf("new"));
    if (copied.frame.anchor.mode === "fixed") copied.frame.anchor.size.width = 800;
    expect(picture.frame.rect.xRatio).toBe(0);
    expect(picture.frame.source.offsetXRatio).toBe(-1);
    expect(picture.transform.annotations![0]!.points[0]!.x).toBe(0.1);
    expect(picture.transform.appearance!.border!.width).toBe(2);
    expect(subgroup.members).toHaveLength(1);
    expect(arePictureGroupsEqual(original, copied)).toBe(false);
  });
  test("normalizes relative angles while retaining out-of-frame ratios and optional false values", () => {
    const value = leaf();
    value.frame.rect = { xRatio: -3, yRatio: 2, widthRatio: 4, heightRatio: 0.25 };
    value.frame.angleDeg = 757.5;
    value.frame.flipHorizontal = false;
    value.hidden = false;
    value.lockAspectRatio = false;
    const normalized = clonePictureGroupChild(value);
    expect(normalized.frame.angleDeg).toBe(37.5);
    expect(normalized.frame.rect).toEqual(value.frame.rect);
    expect(normalized.frame.flipHorizontal).toBe(false);
    expect(normalized.hidden).toBe(false);
    expect(normalized.lockAspectRatio).toBe(false);
    expect(arePictureGroupsEqual(group(), { ...group(), hidden: false })).toBe(false);
  });
  test.each([
    "root-asset",
    "root-source",
    "root-flip",
    "root-group-id",
    "root-world-cache",
    "leaf-anchor",
    "leaf-group-id",
    "leaf-members",
    "leaf-legacy-width",
    "frame-anchor",
    "frame-kind",
    "rect-unknown",
    "crop-transform",
    "rotation-transform",
    "unknown-transform",
    "empty-id",
    "empty-asset",
    "bad-alt",
    "bad-hidden",
    "bad-aspect",
    "bad-flip",
    "bad-source",
    "unknown-child-kind",
  ])("rejects incompatible %s fields", (scenario) => {
    const root = group() as unknown as Record<string, unknown>;
    const picture = (root.members as Record<string, unknown>[])[0]!;
    const frame = picture.frame as Record<string, unknown>;
    const rootChanges: Record<string, unknown> = {
      "root-asset": { assetId: "fake" },
      "root-source": { source: {} },
      "root-flip": { flipHorizontal: true },
      "root-group-id": { groupId: "old" },
      "root-world-cache": { worldRect: {} },
    };
    if (rootChanges[scenario]) Object.assign(root, rootChanges[scenario]);
    if (scenario === "leaf-anchor") picture.anchor = {};
    if (scenario === "leaf-group-id") picture.groupId = "old";
    if (scenario === "leaf-members") picture.members = [];
    if (scenario === "leaf-legacy-width") picture.width = 100;
    if (scenario === "frame-anchor") frame.anchor = {};
    if (scenario === "frame-kind") frame.kind = "object-frame-v1";
    if (scenario === "rect-unknown") (frame.rect as Record<string, unknown>).ignored = true;
    if (scenario === "crop-transform")
      picture.transform = { crop: { x: 0, y: 0, width: 1, height: 1 } };
    if (scenario === "rotation-transform") picture.transform = { rotation: 90 };
    if (scenario === "unknown-transform") picture.transform = { unknown: true };
    if (scenario === "empty-id") picture.id = " ";
    if (scenario === "empty-asset") picture.assetId = "";
    if (scenario === "bad-alt") picture.altText = 12;
    if (scenario === "bad-hidden") picture.hidden = 1;
    if (scenario === "bad-aspect") picture.lockAspectRatio = "yes";
    if (scenario === "bad-flip") frame.flipHorizontal = "yes";
    if (scenario === "bad-source")
      frame.source = { widthRatio: 0, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 };
    if (scenario === "unknown-child-kind") picture.kind = "picture-group-v1";
    expect(() => normalizePictureGroup(root as unknown as PictureGroup)).toThrow();
  });
  test.each([0, -1, NaN, Infinity, -Infinity])(
    "rejects nonpositive/nonfinite local dimension %s",
    (widthRatio) => {
      expect(() =>
        normalizePictureGroupLocalRect({ xRatio: 0, yRatio: 0, widthRatio, heightRatio: 1 }),
      ).toThrow();
    },
  );
  test("rejects source-bearing nested containers and unknown/symbol variant fields", () => {
    const subgroup = {
      kind: "grouped-group-v1",
      id: "inner",
      altText: "inner",
      frame: { kind: "group-local-frame-v1", rect: leaf().frame.rect, angleDeg: 0, source: {} },
      members: [leaf()],
    };
    expect(() => normalizePictureGroupChild(subgroup as unknown as GroupedGroup)).toThrow();
    const value = group();
    Object.defineProperty(value, Symbol("unknown"), { value: true });
    expect(() => normalizePictureGroup(value)).toThrow();
  });
});
