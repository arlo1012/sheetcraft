import {
  findPictureGroupNode,
  isGroupedGroup,
  isGroupedPicture,
  isPictureGroup,
  normalizePictureGroup,
  traversePictureGroup,
  type GroupedPicture,
  type PictureGroup,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { leasePictureGroupNode } from "@sheetcraft/core/picture-group-edit";
import {
  getDetailedPictureStyleAssetIds,
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "@sheetcraft/core/picture-detailed-style";
import { normalizeImageTransform, type ImageAppearance } from "@sheetcraft/core/workbook";
import {
  editPictureDetailedCategory,
  getPictureOwnDetailedStyle,
  type PictureDetailedCategoryEdit,
} from "./picture-detailed-style-edit";

export type PictureGroupPaintCategory = "fill" | "line";
export type PictureGroupPaintEdit = Extract<
  PictureDetailedCategoryEdit,
  { category: PictureGroupPaintCategory }
>;

function selectedLeaves(root: PictureGroup, path: PictureGroupPath): GroupedPicture[] {
  const target = findPictureGroupNode(root, leasePictureGroupNode(root, path).path)?.node;
  if (!target || (!isPictureGroup(target) && !isGroupedGroup(target)))
    throw new TypeError("Member paint requires an actual selected group.");
  const leaves = traversePictureGroup(root).flatMap(({ node, path: memberPath }) =>
    isGroupedPicture(node) && path.every((id, index) => id === memberPath[index]) ? [node] : [],
  );
  if (!leaves.length) throw new TypeError("The selected group has no source-bearing members.");
  return leaves;
}

/** A mixed member setting never masquerades as an inherited container setting. */
export function capturePictureGroupPaint(root: PictureGroup, path: PictureGroupPath) {
  const leaves = selectedLeaves(normalizePictureGroup(root), path),
    styles = leaves.map((leaf) => getPictureOwnDetailedStyle(leaf.transform?.appearance)),
    common: PictureDetailedStyle = {},
    mixed: PictureGroupPaintCategory[] = [];
  for (const category of ["fill", "line"] as const) {
    const first = styles[0]?.[category];
    if (styles.every((style) => JSON.stringify(style?.[category]) === JSON.stringify(first))) {
      if (first !== undefined) Object.assign(common, { [category]: first });
    } else mixed.push(category);
  }
  const detailedStyle = normalizeDetailedPictureStyle(common);
  const appearance: ImageAppearance | undefined = detailedStyle ? { detailedStyle } : undefined;
  return { appearance, mixed, leafCount: leaves.length };
}

/** Change one category on the selected group's real leaves; never give a container an asset. */
export function editPictureGroupPaint(
  root: PictureGroup,
  path: PictureGroupPath,
  edit: PictureGroupPaintEdit,
  isAssetAvailable?: (id: string) => boolean,
): PictureGroup {
  if (edit.category !== "fill" && edit.category !== "line")
    throw new TypeError("Only group member fill and outline are supported here.");
  const copy = normalizePictureGroup(root);
  for (const leaf of selectedLeaves(copy, path)) {
    const appearance = editPictureDetailedCategory(leaf.transform?.appearance, edit),
      previousAssets = new Set([
        leaf.assetId,
        ...getDetailedPictureStyleAssetIds(leaf.transform?.appearance?.detailedStyle),
      ]);
    for (const id of getDetailedPictureStyleAssetIds(appearance?.detailedStyle))
      if (!previousAssets.has(id) && isAssetAvailable?.(id) !== true)
        throw new TypeError("Picture paint asset is not available to this workbook.");
    const transform = normalizeImageTransform({
      annotations: leaf.transform?.annotations,
      appearance,
    });
    leaf.transform = transform
      ? { annotations: transform.annotations, appearance: transform.appearance }
      : undefined;
  }
  return normalizePictureGroup(copy);
}
