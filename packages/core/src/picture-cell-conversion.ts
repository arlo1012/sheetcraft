import { normalizeCellImage } from "./cell-picture-frame.js";
import { createPictureSheetMetrics, locatePictureAxisPoint } from "./picture-axis-metrics.js";
import {
  pictureFrameFromLegacy,
  resolvePictureFrame,
  type ResolvedPictureFrame,
} from "./picture-frame.js";
import { planDeletePictureGroupNodes } from "./picture-group-delete.js";
import { leasePictureGroupNode } from "./picture-group-edit.js";
import { resolvePictureGroup, type ResolvedPictureGroupChild } from "./picture-group-layout.js";
import {
  isPictureGroup,
  findPictureGroupNode,
  type GroupedPicture,
  type PictureGroupPath,
} from "./picture-group.js";
import { isFramedPictureObject, normalizePictureObjectCollection } from "./picture-object.js";
import { getPictureObjectOriginCell } from "./picture-object-sheet.js";
import { getPictureOwnerBehavior, normalizePictureProperties } from "./picture-properties.js";
import { getMergedCellAnchor } from "./merged-cells.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import type { CellImage } from "./formula/types.js";
import type { CellAddress, FloatingImage, Sheet } from "./workbook.js";

export type PictureToCellPlan = {
  address: CellAddress;
  image: CellImage;
  roots: FloatingImage[];
  sourceRoot: FloatingImage;
  path: PictureGroupPath;
};

/** A local content transfer, not a rasterization or a worksheet-size edit. */
export function planFloatingPictureToCell(
  sheet: Sheet,
  id: string,
  pathValue?: PictureGroupPath,
): PictureToCellPlan | null {
  const roots = normalizePictureObjectCollection(sheet.floatingImages);
  const root = roots.find((entry) => entry.id === id);
  if (!root) return null;
  if (root.hidden) throw new RangeError("Show the picture before converting it to a cell.");
  const metrics = createPictureSheetMetrics(sheet);
  const path = pathValue ?? [id];
  let source: FloatingImage | GroupedPicture = root;
  let geometry: ResolvedPictureFrame | undefined;
  if (isPictureGroup(root)) {
    const lease = leasePictureGroupNode(root, path);
    if (lease.kind !== "grouped-picture-v1")
      throw new TypeError("Select an actual picture inside the group before converting to a cell.");
    const resolved = resolvePictureGroup(root, metrics);
    const find = (children: readonly ResolvedPictureGroupChild[]): ResolvedPictureFrame | null => {
      for (const child of children) {
        if (
          child.path.length === lease.path.length &&
          child.path.every((part, index) => part === lease.path[index])
        )
          if (!child.visible)
            throw new RangeError("Show the picture before converting it to a cell.");
          else return child.layout && "sourceRect" in child.layout ? child.layout : null;
        if ("members" in child) {
          const found = find(child.members);
          if (found) return found;
        }
      }
      return null;
    };
    geometry = find(resolved.members) ?? undefined;
    const node = findPictureGroupNode(root, lease.path)?.node;
    if (!node || node.kind !== "grouped-picture-v1")
      throw new TypeError("The picture owner changed.");
    source = node;
  } else {
    if (path.length !== 1 || path[0] !== id)
      throw new TypeError("The selected picture owner path changed.");
    if (isFramedPictureObject(root)) geometry = resolvePictureFrame(root.frame, metrics);
  }
  let address: CellAddress;
  let image: CellImage;
  if (geometry) {
    if (geometry.collapsed)
      throw new RangeError("Expand the picture before converting it to a cell.");
    if (!("frame" in source) || isPictureGroup(source))
      throw new TypeError("Picture source has no frame.");
    address =
      source === root
        ? getPictureObjectOriginCell(root, sheet)
        : {
            row: Math.min(
              MAX_SHEET_ROWS - 1,
              locatePictureAxisPoint(geometry.rect.y, metrics.rows).index,
            ),
            column: Math.min(
              MAX_SHEET_COLUMNS - 1,
              locatePictureAxisPoint(geometry.rect.x, metrics.columns).index,
            ),
          };
    image = normalizeCellImage({
      assetId: source.assetId,
      altText: source.altText,
      ...normalizePictureProperties(source),
      ...getPictureOwnerBehavior(root),
      frame: {
        kind: "cell-picture-frame-v1",
        size: { width: geometry.rect.width, height: geometry.rect.height },
        source: source.frame.source,
        angleDeg: geometry.angleDeg,
        ...(source.frame.flipHorizontal ? { flipHorizontal: true } : {}),
        ...(source.frame.flipVertical ? { flipVertical: true } : {}),
        ...(source.frame.cropShape ? { cropShape: source.frame.cropShape } : {}),
      },
      ...(source.transform ? { transform: source.transform } : {}),
      ...(source.lockAspectRatio === undefined ? {} : { lockAspectRatio: source.lockAspectRatio }),
    });
  } else {
    if (isPictureGroup(root) || isFramedPictureObject(root))
      throw new RangeError("The selected picture has no available source geometry.");
    address = getPictureObjectOriginCell(root, sheet);
    if (root.lockAspectRatio !== undefined) {
      const frame = pictureFrameFromLegacy(root, metrics);
      const resolved = resolvePictureFrame(frame, metrics);
      if (resolved.collapsed)
        throw new RangeError("Expand the picture before converting it to a cell.");
      image = normalizeCellImage({
        assetId: root.assetId,
        altText: root.altText,
        ...normalizePictureProperties(root),
        lockAspectRatio: root.lockAspectRatio,
        frame: {
          kind: "cell-picture-frame-v1",
          size: { width: resolved.rect.width, height: resolved.rect.height },
          source: frame.source,
          angleDeg: frame.angleDeg,
          ...(frame.flipHorizontal ? { flipHorizontal: true } : {}),
          ...(frame.flipVertical ? { flipVertical: true } : {}),
        },
        ...(root.transform?.appearance || root.transform?.annotations
          ? {
              transform: {
                ...(root.transform.appearance ? { appearance: root.transform.appearance } : {}),
                ...(root.transform.annotations ? { annotations: root.transform.annotations } : {}),
              },
            }
          : {}),
      });
    } else {
      image = normalizeCellImage({
        assetId: root.assetId,
        altText: root.altText,
        ...normalizePictureProperties(root),
        ...(root.transform ? { transform: root.transform } : {}),
      });
    }
  }
  address = getMergedCellAnchor(sheet.mergedCells, address) ?? address;
  const nextRoots = isPictureGroup(root)
    ? planDeletePictureGroupNodes(roots, [path], metrics)
    : roots.filter((entry) => entry.id !== id);
  return { address: { ...address }, image, roots: nextRoots, sourceRoot: root, path: [...path] };
}
