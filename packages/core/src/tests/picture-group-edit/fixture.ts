import {
  resolvePictureGroup,
  type ResolvedGroupedGroup,
  type ResolvedGroupedPicture,
} from "../../picture-group-layout.js";
import type { GroupedGroup, GroupedPicture, PictureGroup } from "../../picture-group.js";
import { group, leaf, metrics } from "../picture-groups/fixtures.js";

export function fixture() {
  const picture = leaf("picture");
  picture.assetId = "shared-asset";
  picture.frame.rect = { xRatio: -0.15, yRatio: 0.25, widthRatio: 0.6, heightRatio: 0.7 };
  picture.frame.angleDeg = 27;
  picture.frame.source = {
    widthRatio: 1.5,
    heightRatio: 0.8,
    offsetXRatio: -0.2,
    offsetYRatio: 0.25,
  };
  picture.frame.flipHorizontal = true;
  picture.frame.flipVertical = false;
  picture.hidden = true;
  picture.lockAspectRatio = false;
  picture.transform = {
    appearance: { opacity: 0.8, border: { color: "#AABBCC", width: 2 } },
    annotations: [{ kind: "pen", points: [{ x: 0.1, y: 0.2 }], color: "#123456", width: 0.01 }],
  };
  const inner: GroupedGroup = {
    kind: "grouped-group-v1",
    id: "inner",
    altText: "Inner",
    hidden: true,
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: -0.2, yRatio: 0.15, widthRatio: 0.6, heightRatio: 1.2 },
      angleDeg: 13,
    },
    members: [picture, leaf("inner-sibling")],
  };
  const root: PictureGroup = {
    ...group("root"),
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 100, y: 100, size: { width: 516, height: 224 } },
      angleDeg: 37,
    },
    members: [inner, leaf("root-sibling")],
  };
  const sheetMetrics = metrics();
  return { root, inner, picture, metrics: sheetMetrics, path: ["root", "inner", "picture"] };
}
export function resolvedNodes(root: PictureGroup, sheetMetrics = metrics()) {
  const resolved = resolvePictureGroup(root, sheetMetrics);
  const inner = resolved.members[0] as ResolvedGroupedGroup;
  const picture = inner.members[0] as ResolvedGroupedPicture;
  return { root: resolved, inner, picture };
}
export function childNodes(root: PictureGroup) {
  const inner = root.members[0] as GroupedGroup;
  return { inner, picture: inner.members[0] as GroupedPicture };
}
