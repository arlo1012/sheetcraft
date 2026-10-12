import { expect, test } from "vitest";
import {
  isGroupedPicture,
  normalizePictureGroup,
  traversePictureGroup,
} from "@sheetcraft/core/picture-group";
import {
  capturePictureGroupPaint,
  editPictureGroupPaint,
} from "../../../modules/sheet-images/picture-group-paint";
import { createPictureLine } from "../../../modules/sheet-images/picture-effect-edit";
import { pictureGroup } from "./picture-group-fixture";
const fill = {
  kind: "value" as const,
  value: { kind: "solid" as const, color: { kind: "rgb" as const, rgb: "#FF0000" }, opacity: 0.4 },
};
function fixture() {
  const root = pictureGroup(),
    first = root.members[0]!;
  if (!isGroupedPicture(first)) throw new Error("Expected source-bearing leaf.");
  first.hidden = true;
  first.transform = {
    appearance: { opacity: 0.6, border: { color: "#123456", width: 2 } },
    annotations: [{ kind: "pen", color: "#FF0000", width: 0.02, points: [{ x: 0.2, y: 0.3 }] }],
  };
  root.members.push({
    kind: "grouped-group-v1",
    id: "branch",
    altText: "Keep branch",
    frame: {
      kind: "group-local-frame-v1",
      angleDeg: 15,
      rect: { xRatio: 1.1, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.5 },
    },
    members: [
      {
        ...first,
        id: "second",
        hidden: false,
        transform: { appearance: { detailedStyle: { fill } } },
      },
    ],
  });
  return normalizePictureGroup(root);
}
function leaves(root: ReturnType<typeof fixture>) {
  return traversePictureGroup(root).flatMap(({ node }) => (isGroupedPicture(node) ? [node] : []));
}
test("common fill/outline states report mixed members instead of an invented container appearance", () => {
  const root = fixture(),
    state = capturePictureGroupPaint(root, [root.id]);
  expect(state.mixed).toEqual(["fill", "line"]);
  expect(state.leafCount).toBe(2);
  expect(state.appearance?.detailedStyle?.fill).toBeUndefined();
  const next = editPictureGroupPaint(root, [root.id], { category: "fill", value: fill });
  expect(capturePictureGroupPaint(next, [root.id])).toMatchObject({
    mixed: ["line"],
    appearance: { detailedStyle: { fill } },
  });
  expect(root).not.toHaveProperty("assetId");
  expect(next).not.toHaveProperty("transform");
});
test("root fill updates hidden and nested actual leaves, preserving geometry, annotations and unrelated appearance", () => {
  const root = fixture(),
    before = structuredClone(root),
    next = editPictureGroupPaint(root, [root.id], { category: "fill", value: fill });
  expect(root).toEqual(before);
  expect(next.frame).toEqual(before.frame);
  for (const [index, leaf] of leaves(next).entries()) {
    const old = leaves(before)[index]!;
    expect(leaf.frame).toEqual(old.frame);
    expect(leaf.assetId).toBe(old.assetId);
    expect(leaf.altText).toBe(old.altText);
    expect(leaf.hidden).toBe(old.hidden);
    expect(leaf.transform?.annotations).toEqual(old.transform?.annotations);
    expect(leaf.transform?.appearance?.detailedStyle?.fill).toEqual(fill);
    expect(leaf.transform?.appearance?.opacity).toBe(old.transform?.appearance?.opacity);
  }
});
test("a nested group outline changes only its descendants and preserves outside siblings", () => {
  const root = fixture(),
    line = { kind: "value" as const, value: { ...createPictureLine(), widthPt: 3 } };
  const next = editPictureGroupPaint(root, [root.id, "branch"], { category: "line", value: line });
  expect(next.members[0]).toEqual(root.members[0]);
  expect(leaves(next)[1]?.transform?.appearance?.detailedStyle?.line).toEqual(line);
  expect(leaves(next)[1]?.transform?.appearance?.detailedStyle?.fill).toEqual(fill);
});
test("None suppresses inherited outlines, while Inherit clears local outline without changing other categories", () => {
  const root = fixture(),
    none = editPictureGroupPaint(root, [root.id], { category: "line", value: { kind: "none" } });
  for (const leaf of leaves(none)) {
    expect(leaf.transform?.appearance?.detailedStyle?.line).toEqual({ kind: "none" });
    expect(leaf.transform?.appearance?.border).toBeUndefined();
    expect(leaf.transform?.appearance?.suppressThemeEffects?.outline).toBe(true);
  }
  const inherited = editPictureGroupPaint(none, [root.id], { category: "line", value: undefined });
  for (const leaf of leaves(inherited)) {
    expect(leaf.transform?.appearance?.detailedStyle?.line).toBeUndefined();
    expect(leaf.transform?.appearance?.suppressThemeEffects?.outline).toBeUndefined();
  }
  expect(leaves(inherited)[1]?.transform?.appearance?.detailedStyle?.fill).toEqual(fill);
});
test("unknown fill assets reject the detached whole operation without changing original leaves", () => {
  const root = fixture(),
    before = structuredClone(root);
  const picture = {
    kind: "value" as const,
    value: {
      kind: "picture" as const,
      assetId: "unavailable",
      opacity: 1,
      rotateWithShape: true,
      layout: {
        kind: "stretch" as const,
        offsetXRatio: 0,
        offsetYRatio: 0,
        widthRatio: 1,
        heightRatio: 1,
      },
    },
  };
  expect(() =>
    editPictureGroupPaint(root, [root.id], { category: "fill", value: picture }),
  ).toThrow("not available");
  expect(root).toEqual(before);
  const next = editPictureGroupPaint(
    root,
    [root.id],
    { category: "fill", value: picture },
    (id) => id === "unavailable",
  );
  expect(
    leaves(next).every((leaf) => leaf.transform?.appearance?.detailedStyle?.fill?.kind === "value"),
  ).toBe(true);
});
test("a leaf path cannot pretend to be a group-scope paint operation", () => {
  const root = fixture();
  expect(() =>
    editPictureGroupPaint(root, [root.id, "owned-leaf"], { category: "fill", value: fill }),
  ).toThrow("actual selected group");
  expect(() => capturePictureGroupPaint(root, [root.id, "missing"])).toThrow();
});
