import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  isPictureGroup,
  MAX_PICTURE_GROUP_DEPTH,
  type GroupedPicture,
  type PictureGroupNode,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
  type PictureGroupNodeLease,
} from "@sheetcraft/core/picture-group-edit";
import {
  normalizePictureSourceFrame,
  resolvePictureFrame,
  type PictureSourceFrame,
} from "@sheetcraft/core/picture-frame";
import type { FloatingImage, LegacyFloatingImage } from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { getPictureViewportFragments } from "./picture-viewport-fragments";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
import type { ImageAsset } from "../image-assets/imageAssetStore";

export type PictureReplacementSource = {
  kind: "legacy" | "framed" | "owned";
  rootId: string;
  path: PictureGroupPath;
  assetId: string;
};
type SourceNode = LegacyFloatingImage | FramedFloatingImage | GroupedPicture;
export type PictureSourceReplacementSnapshot = {
  source: PictureReplacementSource;
  structure: string;
  sourceKey: string;
  metrics?: PictureFrameLayoutContext["metrics"];
  metricFunctions?: readonly unknown[];
  lease?: PictureGroupNodeLease;
};

function pathFor(imageId: string, path?: PictureGroupPath | null): string[] {
  const result: string[] = [];
  if (path == null) result.push(imageId);
  else {
    if (
      !Array.isArray(path) ||
      Object.getPrototypeOf(path) !== Array.prototype ||
      path.length > MAX_PICTURE_GROUP_DEPTH + 1
    )
      throw new TypeError("Picture replacement requires a bounded ordinary member path.");
    for (const key of Reflect.ownKeys(path)) {
      if (key === "length") continue;
      if (
        typeof key !== "string" ||
        !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= path.length ||
        !("value" in Object.getOwnPropertyDescriptor(path, key)!)
      )
        throw new TypeError("Picture replacement member paths require indexed data only.");
    }
    for (let index = 0; index < path.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(path, String(index));
      if (!descriptor || !("value" in descriptor))
        throw new TypeError("Picture replacement member paths must be dense own data.");
      result.push(descriptor.value as string);
    }
  }
  if (
    !result.length ||
    result.some((id) => typeof id !== "string" || !id.trim()) ||
    (imageId !== result[0] && imageId !== result.at(-1))
  )
    throw new TypeError("Picture replacement requires its exact root/member path.");
  return result;
}
function structureKey(roots: readonly FloatingImage[]): string {
  function nodeKey(node: FloatingImage | PictureGroupNode): unknown {
    return "members" in node
      ? [node.kind, node.id, node.members.map(nodeKey)]
      : ["kind" in node ? node.kind : isFramedPictureObject(node) ? "framed" : "legacy", node.id];
  }
  return JSON.stringify(roots.map(nodeKey));
}
function sourceKey(node: SourceNode): string {
  return JSON.stringify({
    assetId: node.assetId,
    source: "frame" in node ? node.frame.source : (node.transform?.crop ?? null),
  });
}
function metricFunctions(context: PictureFrameLayoutContext): unknown[] {
  const { columns, rows } = context.metrics;
  return [
    columns,
    columns.count,
    columns.nominalSize,
    columns.visibleSize,
    columns.nominalPrefix,
    columns.visiblePrefix,
    rows,
    rows.count,
    rows.nominalSize,
    rows.visibleSize,
    rows.nominalPrefix,
    rows.visiblePrefix,
  ];
}
function validateMetrics(context: PictureFrameLayoutContext): void {
  for (const axis of [context.metrics.columns, context.metrics.rows]) {
    if (
      !Number.isSafeInteger(axis.count) ||
      axis.count <= 0 ||
      [axis.nominalSize, axis.visibleSize, axis.nominalPrefix, axis.visiblePrefix].some(
        (value) => typeof value !== "function",
      )
    )
      throw new TypeError("Picture replacement requires complete immutable axis metrics.");
    const nominal = axis.nominalSize(0),
      visible = axis.visibleSize(0);
    const nominalEnd = axis.nominalPrefix(axis.count),
      visibleEnd = axis.visiblePrefix(axis.count);
    if (
      ![nominal, visible, nominalEnd, visibleEnd].every(Number.isFinite) ||
      nominal <= 0 ||
      visible < 0 ||
      nominalEnd <= 0 ||
      visibleEnd < 0 ||
      axis.nominalPrefix(0) !== 0 ||
      axis.visiblePrefix(0) !== 0
    )
      throw new RangeError("Picture replacement axis metrics are invalid.");
  }
}
function resolveSource(
  rootsValue: readonly FloatingImage[],
  path: PictureGroupPath,
  context?: PictureFrameLayoutContext,
): { roots: FloatingImage[]; node: SourceNode; kind: PictureReplacementSource["kind"] } {
  const roots = normalizePictureObjectCollection(rootsValue);
  const root = roots.find((entry) => entry.id === path[0]);
  if (!root) throw new TypeError("Picture replacement source is missing.");
  if (context) {
    validateMetrics(context);
    getPictureViewportFragments(roots, context.layout, context);
  }
  if (path.length > 1) {
    if (!context || !isPictureGroup(root))
      throw new TypeError("Owned picture replacement requires its real owner and view metrics.");
    const target = resolveOwnedPictureNode(roots, path, context);
    if (
      !target ||
      target.node.kind !== "grouped-picture-v1" ||
      !target.visible ||
      !target.layout ||
      target.layout.collapsed
    )
      throw new TypeError("Only a visible source-bearing owned leaf can be replaced.");
    return { roots, node: target.node, kind: "owned" };
  }
  if (isPictureGroup(root)) throw new TypeError("Picture containers have no replacement source.");
  if (root.hidden) throw new TypeError("A hidden picture source cannot be replaced.");
  if (isFramedPictureObject(root)) {
    if (!context || resolvePictureFrame(root.frame, context.metrics).collapsed)
      throw new TypeError("Framed picture replacement requires valid current view metrics.");
    return { roots, node: root, kind: "framed" };
  }
  return { roots, node: root, kind: "legacy" };
}

/** Validate the whole forest before a picker, decoder, asset write or command can run. */
export function capturePictureSourceReplacement(
  roots: readonly FloatingImage[],
  imageId: string,
  pathValue?: PictureGroupPath | null,
  context?: PictureFrameLayoutContext,
): PictureSourceReplacementSnapshot {
  const path = pathFor(imageId, pathValue);
  const current = resolveSource(roots, path, context);
  const root = current.roots.find((entry) => entry.id === path[0])!;
  return {
    source: { kind: current.kind, rootId: path[0]!, path, assetId: current.node.assetId },
    structure: structureKey(current.roots),
    sourceKey: sourceKey(current.node),
    ...(context ? { metrics: context.metrics, metricFunctions: metricFunctions(context) } : {}),
    ...(isPictureGroup(root) ? { lease: leasePictureGroupNode(root, path) } : {}),
  };
}

/** Geometry and retained metadata may advance; ownership/order and source/crop may not. */
export function isPictureSourceReplacementCurrent(
  snapshot: PictureSourceReplacementSnapshot,
  roots: readonly FloatingImage[],
  context?: PictureFrameLayoutContext,
): boolean {
  try {
    if (snapshot.metrics) {
      if (
        !context ||
        context.metrics !== snapshot.metrics ||
        !snapshot.metricFunctions!.every(
          (value, index) => value === metricFunctions(context)[index],
        )
      )
        return false;
    } else if (snapshot.source.kind !== "legacy") return false;
    const current = resolveSource(roots, snapshot.source.path, context);
    return (
      current.kind === snapshot.source.kind &&
      structureKey(current.roots) === snapshot.structure &&
      sourceKey(current.node) === snapshot.sourceKey
    );
  } catch {
    return false;
  }
}

/** Replace only the actual leaf source, preserving the latest complete ownership forest. */
export function planPictureSourceReplacement(
  snapshot: PictureSourceReplacementSnapshot,
  roots: readonly FloatingImage[],
  context: PictureFrameLayoutContext | undefined,
  asset: Pick<ImageAsset, "id" | "width" | "height">,
): FloatingImage[] {
  if (!isPictureSourceReplacementCurrent(snapshot, roots, context))
    throw new TypeError("Picture replacement source, ownership or metrics changed.");
  const current = resolveSource(roots, snapshot.source.path, context);
  const root = current.roots.find((entry) => entry.id === snapshot.source.rootId)!;
  if (snapshot.source.kind === "owned") {
    if (
      !context ||
      !isPictureGroup(root) ||
      !("kind" in current.node) ||
      current.node.kind !== "grouped-picture-v1"
    )
      throw new TypeError("Picture replacement requires its exact real owner.");
    const target = resolveOwnedPictureNode(current.roots, snapshot.source.path, context)!;
    const source = coverSource(target.layout!.rect.width, target.layout!.rect.height, asset);
    const next = applyPictureGroupChildWorldEdit(
      root,
      snapshot.lease!,
      target.layout!,
      context.metrics,
      {
        replacement: {
          ...current.node,
          assetId: asset.id,
          frame: { ...current.node.frame, source },
        },
      },
    );
    return normalizePictureObjectCollection(
      current.roots.map((entry) => (entry.id === root.id ? next : entry)),
    );
  }
  let next: FloatingImage;
  if (isFramedPictureObject(root)) {
    const rect = resolvePictureFrame(root.frame, context!.metrics).rect;
    next = {
      ...root,
      assetId: asset.id,
      frame: { ...root.frame, source: coverSource(rect.width, rect.height, asset) },
    };
  } else if (!isPictureGroup(root)) {
    const rotated = root.transform?.rotation === 90 || root.transform?.rotation === 270;
    const source = coverSource(
      rotated ? root.height : root.width,
      rotated ? root.width : root.height,
      asset,
    );
    const width = Math.min(1, 1 / source.widthRatio);
    const height = Math.min(1, 1 / source.heightRatio);
    next = {
      ...root,
      assetId: asset.id,
      transform: {
        ...root.transform,
        crop: { x: (1 - width) / 2, y: (1 - height) / 2, width, height },
      },
    };
  } else throw new TypeError("Picture containers have no replacement source.");
  const result = normalizePictureObjectCollection(
    current.roots.map((entry) => (entry.id === root.id ? next : entry)),
  );
  if (context) getPictureViewportFragments(result, context.layout, context);
  return result;
}

/** Measured Replace behavior: retain the crop frame and center a new covering source. */
function coverSource(
  width: number,
  height: number,
  asset: Pick<ImageAsset, "width" | "height">,
): PictureSourceFrame {
  if (
    ![width, height, asset.width, asset.height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    throw new RangeError(
      "Picture replacement requires positive finite source and crop dimensions.",
    );
  const scale = Math.max(width / asset.width, height / asset.height);
  return normalizePictureSourceFrame({
    widthRatio: Math.max(1, (asset.width * scale) / width),
    heightRatio: Math.max(1, (asset.height * scale) / height),
    offsetXRatio: 0,
    offsetYRatio: 0,
  });
}
