import { afterEach, expect } from "vitest";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import {
  isPictureGroup,
  isGroupedPicture,
  isGroupedGroup,
  findPictureGroupNode,
  type GroupedPicture,
  type PictureGroup,
} from "@sheetcraft/core/picture-group";
import { pictureFrameFromLegacy, resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { resolveOwnedPictureNode } from "../../../../../modules/sheet-images/picture-group-interaction";
import { getPictureFormatCropState } from "../../../../../modules/sheet-images/picture-format-crop";
import type { PictureIntrinsicSize } from "../../../../../modules/sheet-images/usePictureIntrinsicSize";
import { cropOwnerFixture } from "../crop-owner-fixture";

export const ownerKinds = ["framed", "legacy", "nested-leaf"] as const;
export type SourceOwnerKind = (typeof ownerKinds)[number];
export const nestedPath = ["owned-group", "branch", "owned-leaf"];
export type SourceFixture = ReturnType<typeof cropOwnerFixture>;
const activeFixtures: SourceFixture[] = [];
afterEach(() => {
  for (const fixture of activeFixtures.splice(0)) fixture.scope.stop();
});

export function intrinsicSize(
  assetId: string,
  width: number,
  height: number,
  url = `blob:source-${assetId}`,
): PictureIntrinsicSize {
  return { assetId, url, width, height };
}

export function sourceOwnerFixture(kind: SourceOwnerKind = "framed", locked = true) {
  const id = kind === "nested-leaf" ? "owned-group" : kind;
  const intrinsic =
    kind === "framed"
      ? intrinsicSize("asset", 360, 320)
      : kind === "legacy"
        ? intrinsicSize("old", 480, 960)
        : intrinsicSize("synthetic-asset", 120, 240);
  const f = cropOwnerFixture(id, kind === "nested-leaf" ? nestedPath : null, intrinsic);
  activeFixtures.push(f);
  const forest = structuredClone(f.sheet.floatingImages);
  if (kind === "nested-leaf") {
    const root = forest[0]!;
    if (!isPictureGroup(root)) throw new TypeError("Expected group.");
    const leaf = root.members[0]!;
    if (!isGroupedPicture(leaf)) throw new TypeError("Expected source leaf.");
    root.members[0] = {
      kind: "grouped-group-v1",
      id: "branch",
      altText: "Keep branch description",
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: 0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.5 },
        angleDeg: 25,
      },
      members: [
        {
          ...leaf,
          lockAspectRatio: locked,
          transform: { appearance: { border: { color: "#123456", width: 2 }, opacity: 0.8 } },
          frame: {
            ...leaf.frame,
            rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.5, heightRatio: 0.5 },
            angleDeg: 13,
            flipHorizontal: true,
            flipVertical: true,
            source: {
              widthRatio: 2,
              heightRatio: 3,
              offsetXRatio: 0.25,
              offsetYRatio: -0.1,
            },
          },
        },
      ],
    };
  } else {
    const node = forest.find((root) => root.id === id)!;
    node.lockAspectRatio = locked;
  }
  f.sheet.floatingImages = normalizePictureObjectCollection(forest);
  // The workbook is plain data. Establish the newly seeded nested owner's watch baseline.
  f.generation.value++;
  return f;
}

export function selectedRoot(f: SourceFixture) {
  return f.sheet.floatingImages.find((root) => root.id === f.selectedIds.value[0])!;
}
export function selectedNode(f: SourceFixture) {
  const root = selectedRoot(f);
  const node = isPictureGroup(root)
    ? findPictureGroupNode(root, f.selectedPath.value!)!.node
    : root;
  if (isPictureGroup(node) || isGroupedGroup(node))
    throw new TypeError("Expected source-bearing owner.");
  return node;
}
export function sourceState(f: SourceFixture) {
  const node = selectedNode(f);
  if (isPictureGroup(node) || isGroupedGroup(node))
    throw new TypeError("Expected source-bearing owner.");
  const layout = isGroupedPicture(node)
    ? resolveOwnedPictureNode(f.sheet.floatingImages, f.selectedPath.value!, f.context.value)!
        .layout!
    : resolvePictureFrame(
        isFramedPictureObject(node)
          ? node.frame
          : pictureFrameFromLegacy(node, f.context.value.metrics),
        f.context.value.metrics,
      );
  return getPictureFormatCropState(node, layout, f.context.value.metrics)!;
}
export function nestedRoot(f: SourceFixture): PictureGroup {
  const root = selectedRoot(f);
  if (!isPictureGroup(root)) throw new TypeError("Expected owned group.");
  return root;
}
export function nestedLeaf(f: SourceFixture): GroupedPicture {
  const node = selectedNode(f);
  if (!isGroupedPicture(node)) throw new TypeError("Expected nested leaf.");
  return node;
}
export function expectPreservedNestedOwners(f: SourceFixture, before: PictureGroup) {
  const root = nestedRoot(f);
  expect(root.frame).toEqual(before.frame);
  expect(root.altText).toBe(before.altText);
  expect(root.members[1]).toEqual(before.members[1]);
  const branch = root.members[0]!,
    oldBranch = before.members[0]!;
  if (branch.kind !== "grouped-group-v1" || oldBranch.kind !== "grouped-group-v1")
    throw new TypeError("Expected nested branch.");
  expect(branch.frame).toEqual(oldBranch.frame);
  expect(branch.altText).toBe(oldBranch.altText);
  expect(root).not.toHaveProperty("assetId");
  expect(branch).not.toHaveProperty("assetId");
}
