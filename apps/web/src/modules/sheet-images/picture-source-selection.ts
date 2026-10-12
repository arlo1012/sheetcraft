import {
  isPictureGroup,
  isGroupedPicture,
  findPictureGroupNode,
  traversePictureGroup,
  type GroupedPicture,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import { leasePictureGroupNode } from "@sheetcraft/core/picture-group-edit";
import {
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";

export type PictureAssetSource = LegacyFloatingImage | FramedFloatingImage | GroupedPicture;
export type PictureSourceEntry = {
  rootId: string;
  path: PictureGroupPath;
  node: PictureAssetSource;
};
export type PictureSourceSelection = {
  roots: FloatingImage[];
  rootIds: string[];
  path: PictureGroupPath | null;
  sources: PictureSourceEntry[];
  structure: string;
};
function structure(roots: readonly FloatingImage[]): string {
  return JSON.stringify(
    roots.map((root) =>
      isPictureGroup(root)
        ? traversePictureGroup(root).map(({ node, path }) => [node.kind, path])
        : ["kind" in root ? root.kind : "legacy", root.id],
    ),
  );
}
function rootIds(values: readonly string[], roots: readonly FloatingImage[]): string[] {
  // Validate an ordinary dense selection before calling any array method.
  if (
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype ||
    values.length > 10000
  )
    throw new TypeError("Invalid picture source selection.");
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= values.length ||
      !("value" in Object.getOwnPropertyDescriptor(values, key)!)
    )
      throw new TypeError("Picture source selections require indexed data.");
  }
  const ids: string[] = [];
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string")
      throw new TypeError("Picture source selections require dense IDs.");
    ids.push(descriptor.value);
  }
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !roots.some((root) => root.id === id))
  )
    throw new TypeError("Picture source selection is incomplete.");
  return ids;
}
/** Containers contribute their real leaves, never a fabricated asset or flattened owner. */
export function capturePictureSourceSelection(
  values: readonly FloatingImage[],
  idsValue: readonly string[],
  pathValue?: PictureGroupPath | null,
  all = false,
): PictureSourceSelection {
  const roots = normalizePictureObjectCollection(values);
  const ids = rootIds(all ? roots.map((root) => root.id) : idsValue, roots);
  let path: PictureGroupPath | null = null;
  if (!all && pathValue != null) {
    if (ids.length !== 1) throw new TypeError("An owned source requires one exact outer root.");
    const root = roots.find((root) => root.id === ids[0])!;
    if (!isPictureGroup(root)) throw new TypeError("An owned source requires its actual group.");
    path = leasePictureGroupNode(root, pathValue).path;
  }
  const sources: PictureSourceEntry[] = [];
  for (const root of roots) {
    if (!ids.includes(root.id)) continue;
    if (!isPictureGroup(root)) {
      sources.push({ rootId: root.id, path: [root.id], node: root });
      continue;
    }
    const selected = path ? findPictureGroupNode(root, path)?.node : root;
    if (!selected) throw new TypeError("The selected picture owner path is missing.");
    for (const visit of traversePictureGroup(root)) {
      if (
        !isGroupedPicture(visit.node) ||
        (path && !path.every((id, index) => visit.path[index] === id))
      )
        continue;
      sources.push({ rootId: root.id, path: visit.path, node: visit.node });
    }
  }
  if (!sources.length) throw new TypeError("The selection has no picture source.");
  return { roots, rootIds: ids, path, sources, structure: structure(roots) };
}
/** Source identity/ownership is fixed; current geometry and metadata remain editable. */
export function isPictureSourceSelectionCurrent(
  scope: PictureSourceSelection,
  values: readonly FloatingImage[],
): boolean {
  try {
    const current = capturePictureSourceSelection(values, scope.rootIds, scope.path);
    return (
      current.structure === scope.structure &&
      current.sources.length === scope.sources.length &&
      current.sources.every((entry, index) => {
        const old = scope.sources[index]!;
        return (
          entry.rootId === old.rootId &&
          JSON.stringify(entry.path) === JSON.stringify(old.path) &&
          entry.node.assetId === old.node.assetId
        );
      })
    );
  } catch {
    return false;
  }
}
/** Update selected actual sources only, retaining the latest frame, metadata and sibling values. */
export function mapPictureSourceAssets(
  scope: PictureSourceSelection,
  values: readonly FloatingImage[],
  assets: ReadonlyMap<string, string>,
): FloatingImage[] {
  if (!isPictureSourceSelectionCurrent(scope, values))
    throw new TypeError("Picture source ownership changed.");
  const roots = normalizePictureObjectCollection(values),
    ids = new Set(scope.sources.map((source) => source.node.id));
  for (const root of roots) {
    if (isPictureGroup(root)) {
      for (const { node } of traversePictureGroup(root))
        if (isGroupedPicture(node) && ids.has(node.id))
          node.assetId = assets.get(node.assetId) ?? node.assetId;
    } else if (ids.has(root.id)) root.assetId = assets.get(root.assetId) ?? root.assetId;
  }
  return normalizePictureObjectCollection(roots);
}
