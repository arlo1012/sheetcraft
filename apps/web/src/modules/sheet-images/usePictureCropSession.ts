import { normalizePictureProperties } from "@sheetcraft/core/picture-properties";
import { computed, getCurrentScope, onScopeDispose, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  areFloatingImageCollectionsEqual,
  type FloatingImage,
  type Sheet,
} from "@sheetcraft/core/workbook";
import {
  isFramedPictureObject,
  normalizePictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  isGroupedPicture,
  isPictureGroup,
  type GroupedPicture,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "@sheetcraft/core/picture-group-edit";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  pictureFrameFromLegacy,
  resolvePictureFrame,
  resolvePictureLayout,
  resolvePictureSourceLayout,
} from "@sheetcraft/core/picture-frame";
import type { ResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import {
  moveResolvedPictureCropSourceBy,
  resizeResolvedPictureCropBy,
  fitResolvedPictureCropToRatio,
} from "@sheetcraft/sheet-engine/picture-crop-gesture";
import { resolveOwnedPictureNode, samePictureGroupPath } from "./picture-group-interaction";
import { applyStandalonePictureCrop, getPictureFormatCropState } from "./picture-format-crop";

export type PictureCropDirection = FloatingImageResizeDirection | "source";
type CropContext = PictureFrameLayoutContext;
type Lease = {
  id: number;
  sheet: Sheet;
  generation: number;
  revision: number;
  rootsReference: readonly FloatingImage[];
  roots: FloatingImage[];
  path: PictureGroupPath;
  selectedPath: PictureGroupPath | null;
  metrics: CropContext["metrics"];
  geometryFunctions: readonly unknown[];
  geometryKey: string;
  initial: ResolvedPictureCrop;
  node: Exclude<FloatingImage, { kind: "picture-group-v1" }> | GroupedPicture;
};
export type PictureCropGestureSnapshot = {
  sessionId: number;
  crop: ResolvedPictureCrop;
};
export interface PictureCropSessionOptions {
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getContext: () => CropContext | undefined;
  getSelectedIds: () => readonly string[];
  getSelectedPath: () => PictureGroupPath | null | undefined;
  isReadOnly: () => boolean;
  execute: (roots: readonly FloatingImage[]) => boolean;
  onFailure?: () => void;
}
let sessionSequence = 0;
function sameCrop(left: ResolvedPictureCrop, right: ResolvedPictureCrop): boolean {
  return (
    left.layout.angleDeg === right.layout.angleDeg &&
    (["x", "y", "width", "height"] as const).every(
      (key) => left.layout.rect[key] === right.layout.rect[key],
    ) &&
    (["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"] as const).every(
      (key) => left.source[key] === right.source[key],
    )
  );
}
function functions(metrics: CropContext["metrics"]): unknown[] {
  return [metrics.rows, metrics.columns].flatMap((axis) => [
    axis.count,
    axis.nominalSize,
    axis.visibleSize,
    axis.nominalPrefix,
    axis.visiblePrefix,
  ]);
}
/** Geometry identity excludes viewport scroll: a crop draft can scroll with its actual owner. */
function forestGeometryKey(
  roots: readonly FloatingImage[],
  metrics: CropContext["metrics"],
): string {
  return JSON.stringify(
    roots.map((root) =>
      isPictureGroup(root)
        ? resolvePictureGroup(root, metrics)
        : resolvePictureFrame(
            isFramedPictureObject(root) ? root.frame : pictureFrameFromLegacy(root, metrics),
            metrics,
          ),
    ),
  );
}

/** One real source owner, one complete-forest commit; pointer previews never edit the workbook. */
export function usePictureCropSession(options: PictureCropSessionOptions) {
  const active = shallowRef<{ lease: Lease; crop: ResolvedPictureCrop }>();
  let disposed = false;
  let executing = false;
  let undoDrafts: ResolvedPictureCrop[] = [];
  let redoDrafts: ResolvedPictureCrop[] = [];
  function capture(): Lease | undefined {
    if (disposed || options.isReadOnly()) return;
    const sheet = options.getSheet(),
      context = options.getContext();
    const ids = options.getSelectedIds(),
      selectedPath = options.getSelectedPath() ?? null;
    if (!context || !canUseSheetPermission(sheet, "editObjects") || ids.length !== 1) return;
    const revision = options.getRevision();
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    const path = selectedPath ? [...selectedPath] : [ids[0]!];
    if (path[0] !== ids[0]) return;
    const rootsReference = sheet.floatingImages;
    const roots = normalizePictureObjectCollection(rootsReference);
    const root = roots.find((entry) => entry.id === path[0]);
    if (!root || root.hidden) return;
    const resolved = isPictureGroup(root)
      ? resolveOwnedPictureNode(roots, path, context)
      : undefined;
    const node = isPictureGroup(root) ? resolved?.node : path.length === 1 ? root : undefined;
    if (!node || isPictureGroup(node) || "members" in node || node.hidden) return;
    if (isPictureGroup(root) && (!resolved?.visible || !isGroupedPicture(node))) return;
    // The frame renderer cannot preserve the legacy explicit-reflection geometry yet.
    if (!("frame" in node) && node.transform?.appearance?.reflection) return;
    const cropState = getPictureFormatCropState(
      node,
      resolved?.layout ?? undefined,
      context.metrics,
    );
    if (!cropState) return;
    const initial: ResolvedPictureCrop = {
      layout: resolvePictureLayout(cropState.layout.rect, cropState.layout.angleDeg),
      source: cropState.source,
    };
    return {
      id: ++sessionSequence,
      sheet,
      generation: options.getGeneration(),
      revision,
      rootsReference,
      roots,
      path,
      selectedPath: selectedPath ? [...selectedPath] : null,
      metrics: context.metrics,
      geometryFunctions: functions(context.metrics),
      geometryKey: forestGeometryKey(roots, context.metrics),
      initial,
      node,
    };
  }
  function current(lease: Lease): boolean {
    const context = options.getContext();
    if (
      disposed ||
      options.isReadOnly() ||
      !context ||
      options.getSheet() !== lease.sheet ||
      options.getGeneration() !== lease.generation ||
      options.getRevision() !== lease.revision ||
      lease.sheet.floatingImages !== lease.rootsReference ||
      context.metrics !== lease.metrics ||
      options.getSelectedIds().length !== 1 ||
      options.getSelectedIds()[0] !== lease.path[0] ||
      !samePictureGroupPath(options.getSelectedPath(), lease.selectedPath) ||
      !canUseSheetPermission(lease.sheet, "editObjects") ||
      !lease.geometryFunctions.every((value, index) => value === functions(context.metrics)[index])
    )
      return false;
    try {
      return (
        areFloatingImageCollectionsEqual(lease.roots, lease.sheet.floatingImages) &&
        lease.geometryKey === forestGeometryKey(lease.roots, context.metrics)
      );
    } catch {
      return false;
    }
  }
  function cancel(): void {
    active.value = undefined;
    undoDrafts = [];
    redoDrafts = [];
  }
  function start(): boolean {
    if (active.value) return current(active.value.lease);
    try {
      const lease = capture();
      if (!lease) return false;
      active.value = { lease, crop: lease.initial };
      return true;
    } catch {
      return false;
    }
  }
  const canStart = computed(() => {
    try {
      return Boolean(capture());
    } catch {
      return false;
    }
  });
  function plan(lease: Lease, crop: ResolvedPictureCrop): FloatingImage[] {
    if (sameCrop(crop, lease.initial)) return lease.roots;
    const root = lease.roots.find((entry) => entry.id === lease.path[0])!;
    const replacement =
      isPictureGroup(root) && isGroupedPicture(lease.node)
        ? applyPictureGroupChildWorldEdit(
            root,
            leasePictureGroupNode(root, lease.path),
            crop.layout,
            lease.metrics,
            { replacement: { ...lease.node, frame: { ...lease.node.frame, source: crop.source } } },
          )
        : !isPictureGroup(root)
          ? applyStandalonePictureCrop(root, lease.initial, crop, lease.metrics)
          : undefined;
    if (!replacement) throw new TypeError("Crop editing requires its exact source-bearing owner.");
    const roots = normalizePictureObjectCollection(
      lease.roots.map((entry) => (entry.id === root.id ? replacement : entry)),
    );
    forestGeometryKey(roots, lease.metrics);
    return roots;
  }
  const previewRoots = computed(() => {
    const state = active.value;
    if (!state) return undefined;
    try {
      return plan(state.lease, state.crop);
    } catch {
      return undefined;
    }
  });
  const view = computed(() => {
    const state = active.value;
    if (!state) return undefined;
    const { lease, crop } = state;
    let picture: FramedFloatingImage | GroupedPicture;
    if (isGroupedPicture(lease.node)) {
      picture = { ...lease.node, frame: { ...lease.node.frame, source: crop.source } };
    } else {
      const node = lease.node;
      const frame = isFramedPictureObject(node)
        ? node.frame
        : pictureFrameFromLegacy(node, lease.metrics);
      // This real asset-backed leaf is only a painting view; durable promotion occurs on commit.
      picture = normalizePictureObject({
        id: node.id,
        assetId: node.assetId,
        altText: node.altText,
        ...normalizePictureProperties(node),
        frame: { ...frame, source: crop.source },
        ...(node.transform?.appearance || node.transform?.annotations
          ? {
              transform: {
                ...(node.transform.appearance ? { appearance: node.transform.appearance } : {}),
                ...(node.transform.annotations ? { annotations: node.transform.annotations } : {}),
              },
            }
          : {}),
      }) as FramedFloatingImage;
    }
    return {
      id: lease.id,
      picture,
      geometry: resolvePictureSourceLayout(crop.layout.rect, crop.layout.angleDeg, crop.source),
    };
  });
  function captureGesture(): PictureCropGestureSnapshot | undefined {
    const state = active.value;
    if (!state || !current(state.lease)) return;
    return { sessionId: state.lease.id, crop: state.crop };
  }
  function previewGesture(
    snapshot: PictureCropGestureSnapshot,
    direction: PictureCropDirection,
    delta: Point,
  ): boolean {
    const state = active.value;
    if (!state || snapshot.sessionId !== state.lease.id || !current(state.lease)) return false;
    try {
      const crop =
        direction === "source"
          ? moveResolvedPictureCropSourceBy(snapshot.crop, delta)
          : resizeResolvedPictureCropBy(snapshot.crop, direction, delta);
      plan(state.lease, crop);
      active.value = { lease: state.lease, crop };
      return true;
    } catch {
      return false;
    }
  }
  function cancelGesture(snapshot: PictureCropGestureSnapshot): void {
    const state = active.value;
    if (state && state.lease.id === snapshot.sessionId && current(state.lease))
      active.value = { lease: state.lease, crop: snapshot.crop };
  }
  function finishGesture(snapshot: PictureCropGestureSnapshot): void {
    const state = active.value;
    if (!state || snapshot.sessionId !== state.lease.id || !current(state.lease)) return;
    if (!sameCrop(state.crop, snapshot.crop)) {
      undoDrafts.push(snapshot.crop);
      redoDrafts = [];
    }
  }
  function changeDraftHistory(redo: boolean): boolean {
    const state = active.value,
      from = redo ? redoDrafts : undoDrafts;
    if (!state || !current(state.lease) || !from.length) return false;
    const crop = from.pop()!;
    (redo ? undoDrafts : redoDrafts).push(state.crop);
    active.value = { lease: state.lease, crop };
    return true;
  }
  function setRatio(ratio: number): boolean {
    const state = active.value;
    if (!state || !current(state.lease)) return false;
    try {
      const crop = fitResolvedPictureCropToRatio(state.crop, ratio);
      plan(state.lease, crop);
      if (!sameCrop(crop, state.crop)) {
        undoDrafts.push(state.crop);
        redoDrafts = [];
        active.value = { lease: state.lease, crop };
      }
      return true;
    } catch {
      options.onFailure?.();
      if (!current(state.lease)) cancel();
      return false;
    }
  }
  function apply(): boolean {
    const state = active.value;
    if (!state || executing) return false;
    if (!current(state.lease)) {
      cancel();
      return false;
    }
    try {
      const roots = plan(state.lease, state.crop);
      if (areFloatingImageCollectionsEqual(roots, state.lease.roots)) {
        cancel();
        return true;
      }
      executing = true;
      const accepted = options.execute(roots) === true;
      if (accepted) cancel();
      else {
        options.onFailure?.();
        if (!current(state.lease)) cancel();
      }
      return accepted;
    } catch {
      options.onFailure?.();
      if (!current(state.lease)) cancel();
      return false;
    } finally {
      executing = false;
    }
  }
  function forestSignature(): string {
    if (!active.value) return "";
    try {
      return JSON.stringify(normalizePictureObjectCollection(options.getSheet().floatingImages));
    } catch {
      return "invalid-picture-forest";
    }
  }
  watch(
    [
      options.getSheet,
      options.getGeneration,
      options.getRevision,
      options.isReadOnly,
      () => options.getSheet().floatingImages,
      () => JSON.stringify(options.getSelectedIds()),
      () => JSON.stringify(options.getSelectedPath() ?? null),
      () => options.getContext()?.metrics,
      forestSignature,
    ],
    () => {
      if (!executing && active.value && !current(active.value.lease)) cancel();
    },
    { flush: "sync" },
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      cancel();
    });
  return {
    active: computed(() => !!active.value),
    canStart,
    previewRoots,
    view,
    start,
    cancel,
    apply,
    captureGesture,
    previewGesture,
    cancelGesture,
    finishGesture,
    setRatio,
    undoDraft: () => changeDraftHistory(false),
    redoDraft: () => changeDraftHistory(true),
  };
}
