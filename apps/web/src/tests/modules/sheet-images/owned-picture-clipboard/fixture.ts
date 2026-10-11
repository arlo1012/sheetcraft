import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  anchorPictureFrameRect,
  pictureFrameFromLegacy,
  resolvePictureFrame,
} from "@sheetcraft/core/picture-frame";
import { isPictureGroup, type PictureGroup } from "@sheetcraft/core/picture-group";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { isFramedPictureObject, type PictureObject } from "@sheetcraft/core/picture-object";
import { createSheet, type LegacyFloatingImage } from "@sheetcraft/core/workbook";
import {
  createOwnedPictureClipboardSession,
  type OwnedPictureClipboardPlacement,
} from "../../../../modules/sheet-images/owned-picture-clipboard";
import { pictureGroup } from "../picture-group-fixture";
import { framedPicture } from "../framed-picture-fixture";

export function nestedGroup(): PictureGroup {
  const root = pictureGroup();
  const leaf = root.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected source leaf.");
  root.members = [
    { ...structuredClone(leaf), id: "first-leaf" },
    {
      kind: "grouped-group-v1",
      id: "nested-group",
      altText: "Nested group",
      lockAspectRatio: false,
      frame: {
        kind: "group-local-frame-v1",
        rect: { xRatio: -0.1, yRatio: 0.2, widthRatio: 0.5, heightRatio: 0.4 },
        angleDeg: 18,
      },
      members: [
        {
          ...structuredClone(leaf),
          id: "nested-leaf",
          hidden: true,
          lockAspectRatio: true,
          frame: {
            ...leaf.frame,
            kind: "group-member-frame-v1",
            source: { widthRatio: 1.5, heightRatio: 2, offsetXRatio: -0.1, offsetYRatio: 0.2 },
            flipHorizontal: true,
            flipVertical: true,
          },
          transform: { appearance: { opacity: 0.65 } },
        },
      ],
    },
  ];
  return root;
}
export function legacyPicture(): LegacyFloatingImage {
  return {
    id: "legacy",
    assetId: "synthetic-asset",
    altText: "Legacy",
    anchor: { row: 2, column: 3 },
    offsetX: 10,
    offsetY: 12,
    width: 70,
    height: 50,
    groupId: "flat-group",
  };
}
export function fixture() {
  const sheet = createSheet("Source", "source-sheet");
  sheet.floatingImages = [framedPicture(), nestedGroup(), legacyPicture()];
  // Effective AutoFit state can differ from the durable row-height map.
  const metrics = createPictureSheetMetrics({
    ...sheet,
    rowHeights: new Map([
      [0, 51],
      [1, 39],
    ]),
  });
  let nextId = 0;
  let nextToken = 0;
  const clipboard = createOwnedPictureClipboardSession({
    createId: () => `fresh-${++nextId}`,
    createToken: () => `local-${++nextToken}`,
  });
  const capture = (mode: "copy" | "cut", selectedIds = ["owned-group"]) =>
    clipboard.capture({
      sheet,
      revision: 7,
      ownerGeneration: 3,
      sourceMetrics: metrics,
      mode,
      selectedIds,
    });
  const paste = () => {
    const current = clipboard.getCurrent()!;
    return clipboard.planPaste({
      sheet,
      revision: 7,
      ownerGeneration: 3,
      sourceMetrics: metrics,
      destinationMetrics: metrics,
      token: current.token,
      generation: current.generation,
      placeRoots: translateRoots,
    });
  };
  return { sheet, metrics, clipboard, capture, paste };
}
/** Real root placement using captured source geometry and the explicit destination metrics. */
export function translateRoots(input: OwnedPictureClipboardPlacement): PictureObject[] {
  return input.roots.map((root) => {
    if (!isPictureGroup(root) && !isFramedPictureObject(root))
      return { ...root, offsetX: root.offsetX + 12, offsetY: root.offsetY + 18 };
    const geometry = isPictureGroup(root)
      ? resolvePictureGroup(root, input.sourceMetrics).layout
      : resolvePictureFrame(root.frame, input.sourceMetrics);
    const anchor = anchorPictureFrameRect(
      root.frame.anchor.mode,
      { ...geometry.rect, x: geometry.rect.x + 12, y: geometry.rect.y + 18 },
      input.destinationMetrics,
    );
    return { ...root, frame: { ...root.frame, anchor } } as PictureObject;
  });
}
export function rootLayout(root: PictureObject, input: OwnedPictureClipboardPlacement) {
  return isPictureGroup(root)
    ? resolvePictureGroup(root, input.destinationMetrics).layout
    : resolvePictureFrame(
        isFramedPictureObject(root)
          ? root.frame
          : pictureFrameFromLegacy(root, input.destinationMetrics),
        input.destinationMetrics,
      );
}
