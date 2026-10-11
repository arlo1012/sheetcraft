import { computed, getCurrentScope, onScopeDispose, ref, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  editResolvedPictureCrop,
  resetResolvedPictureCrop,
} from "@sheetcraft/core/picture-crop-edit";
import {
  applyStandalonePictureCrop,
  getPictureFormatCropState,
  isPictureFormatCropField,
  pictureFormatCropEdit,
  pictureFormatCropValues,
} from "./picture-format-crop";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import {
  isGroupedPicture,
  isGroupedGroup,
  isPictureGroup,
  type PictureGroupNode,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "@sheetcraft/core/picture-group-edit";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import {
  anchorPictureFrameRect,
  normalizePictureAngle,
  pictureFrameFromLegacy,
  resolvePictureFrame,
  type PictureFrameAnchor,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import {
  areFloatingImageCollectionsEqual,
  MAX_FLOATING_IMAGE_SIZE,
  MIN_FLOATING_IMAGE_SIZE,
  type FloatingImage,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { resizePictureLayoutBy } from "@sheetcraft/sheet-engine/picture-layout-edit";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolveOwnedPictureNode } from "./picture-group-interaction";
import { getPictureToolGeometry, resizePictureTo } from "./picture-tool-geometry";
import {
  samePictureFormatOwner,
  type PictureFormatCapabilities,
  type PictureFormatField,
  type PictureFormatIntent,
  type PictureFormatReset,
  type PictureFormatSnapshot,
  type PictureFormatValues,
} from "./picture-format-pane-model";

const POINTS_PER_PIXEL = 0.75;
const fields: readonly PictureFormatField[] = [
  "sizeWidthPt",
  "sizeHeightPt",
  "rotationDeg",
  "scaleWidthPercent",
  "scaleHeightPercent",
  "lockAspectRatio",
  "relativeToOriginalSize",
  "anchor",
  "printObject",
  "locked",
  "altTitle",
  "altDescription",
  "sourceWidthPt",
  "sourceHeightPt",
  "sourceOffsetXPt",
  "sourceOffsetYPt",
  "cropWidthPt",
  "cropHeightPt",
  "cropLeftPt",
  "cropTopPt",
  "fillMode",
  "fillColor",
  "fillTransparencyPercent",
  "fillGradientPreset",
  "lineMode",
  "lineColor",
  "lineTransparencyPercent",
  "lineWidthPt",
  "lineGradientPreset",
  "lineCompound",
  "lineDash",
  "lineCap",
  "lineJoin",
  "shadowPreset",
  "shadowColor",
  "shadowTransparencyPercent",
  "shadowSizePercent",
  "shadowBlurPt",
  "shadowDistancePt",
  "shadowAngleDeg",
  "reflectionPreset",
  "reflectionSizePercent",
  "reflectionTransparencyPercent",
  "reflectionBlurPt",
  "reflectionDistancePt",
  "glowPreset",
  "glowColor",
  "glowSizePt",
  "glowTransparencyPercent",
  "softEdgePreset",
  "softEdgeSizePt",
  "depthColor",
  "depthSizePt",
  "contourColor",
  "contourSizePt",
  "material",
  "lighting",
  "lightingAngleDeg",
  "rotation3dPreset",
  "rotation3dXDeg",
  "rotation3dYDeg",
  "rotation3dZDeg",
  "perspectiveDeg",
  "distanceFromGroundPt",
];
const resets: readonly PictureFormatReset[] = [
  "reset-size",
  "reset-picture",
  "reset-crop",
  "reset-3d-format",
  "reset-3d-rotation",
];
let hostSequence = 0;

export interface OwnedPictureFormatPaneOptions {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  /** Must change for every accepted document edit, including an edit made by this pane. */
  getRevision: () => number;
  getContext: () => PictureFrameLayoutContext | undefined;
  getSelectedPath: () => PictureGroupPath | null | undefined;
  getSelectedIds: () => readonly string[];
  isBusy: () => boolean;
  /** A closed pane need not normalize a potentially large forest on ordinary cell edits. */
  isOpen?: () => boolean;
  /** Authoritative, synchronous complete-forest Core command acceptance. */
  execute: (nextForest: readonly FloatingImage[]) => boolean;
  getDisabledReason?: () => string;
  getUnsupportedCropReason?: () => string;
}
type Lease = {
  workbook: Workbook;
  sheet: Sheet;
  generation: number;
  revision: number;
  context: PictureFrameLayoutContext | undefined;
  metrics: PictureFrameLayoutContext["metrics"] | undefined;
  layout: PictureFrameLayoutContext["layout"] | undefined;
  selectedIds: string[];
  selectedPath: PictureGroupPath | null;
  path: PictureGroupPath;
  forestReference: readonly FloatingImage[];
  forest: FloatingImage[];
  root: FloatingImage;
  node: FloatingImage | PictureGroupNode;
  world: ResolvedPictureLayout | undefined;
};
function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
function anchorValue(mode: PictureFrameAnchor["mode"]): PictureFormatValues["anchor"] {
  return mode === "move-and-size" ? "move-size" : mode === "move-only" ? "move" : "fixed";
}
function anchorMode(value: unknown): PictureFrameAnchor["mode"] {
  if (value === "move-size") return "move-and-size";
  if (value === "move") return "move-only";
  if (value === "fixed") return "fixed";
  throw new TypeError("Unknown picture anchor choice.");
}

/** Actual selected owner only. Unsupported source/appearance/effect state is never invented. */
export function useOwnedPictureFormatPane(options: OwnedPictureFormatPaneOptions) {
  const prefix = `owned-picture-format-${++hostSequence}`;
  const epoch = ref(0);
  const acceptedIntentId = ref<string>();
  let disposed = false;
  let mutation: { boundaryChanged: boolean } | undefined;
  function clear(): void {
    if (mutation) mutation.boundaryChanged = true;
    epoch.value += 1;
    acceptedIntentId.value = undefined;
  }
  function forestSignature(): string {
    if (options.isOpen?.() === false) return "closed-picture-format-pane";
    try {
      return JSON.stringify(normalizePictureObjectCollection(options.getSheet().floatingImages));
    } catch {
      return "invalid-picture-forest";
    }
  }
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      () => JSON.stringify(options.getSelectedIds()),
      () => JSON.stringify(options.getSelectedPath() ?? null),
      options.getContext,
      () => options.getContext()?.metrics,
      () => options.getContext()?.layout,
      () => options.getSheet().floatingImages,
      options.getRevision,
      forestSignature,
      () => options.isOpen?.() ?? true,
    ],
    (next, previous) => {
      if (mutation) {
        if (next.slice(0, 8).some((value, index) => value !== previous[index]))
          mutation.boundaryChanged = true;
      } else clear();
    },
    { flush: "sync" },
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      clear();
    });

  function validateForest(forest: readonly FloatingImage[], context: Lease["context"]): void {
    for (const root of forest) {
      if (isPictureGroup(root)) {
        if (!context) throw new TypeError("Group geometry requires current worksheet metrics.");
        resolvePictureGroup(root, context.metrics);
      } else if (isFramedPictureObject(root)) {
        if (!context) throw new TypeError("Frame geometry requires current worksheet metrics.");
        resolvePictureFrame(root.frame, context.metrics);
      } else if (context)
        resolvePictureFrame(pictureFrameFromLegacy(root, context.metrics), context.metrics);
    }
  }
  function capture(): Lease | undefined {
    if (options.isOpen?.() === false) return undefined;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet();
    const generation = options.getGeneration(),
      revision = options.getRevision();
    const selectedIds = [...options.getSelectedIds()];
    const selectedPath = options.getSelectedPath();
    if (
      workbook.sheets.get(sheet.id) !== sheet ||
      selectedIds.length !== 1 ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      return undefined;
    const path = selectedPath ? [...selectedPath] : [...selectedIds];
    if (!path.length || path[0] !== selectedIds[0]) return undefined;
    const context = options.getContext();
    const forestReference = sheet.floatingImages;
    const forest = normalizePictureObjectCollection(forestReference);
    validateForest(forest, context);
    const root = forest.find((image) => image.id === path[0]);
    if (!root) return undefined;
    let node: Lease["node"] = root,
      world: Lease["world"];
    if (isPictureGroup(root)) {
      const target = resolveOwnedPictureNode(forest, path, context!);
      if (!target) return undefined;
      node = target.node;
      world = target.layout ?? undefined;
    } else {
      if (path.length !== 1) return undefined;
      if (context)
        world = resolvePictureFrame(
          isFramedPictureObject(root) ? root.frame : pictureFrameFromLegacy(root, context.metrics),
          context.metrics,
        );
    }
    return {
      workbook,
      sheet,
      generation,
      revision,
      context,
      metrics: context?.metrics,
      layout: context?.layout,
      selectedIds,
      selectedPath: selectedPath ? [...selectedPath] : null,
      path,
      forestReference,
      forest,
      root,
      node,
      world,
    };
  }
  function sameBoundary(lease: Lease): boolean {
    const context = options.getContext(),
      path = options.getSelectedPath() ?? null;
    return (
      !disposed &&
      options.isOpen?.() !== false &&
      options.getWorkbook() === lease.workbook &&
      options.getSheet() === lease.sheet &&
      lease.workbook.sheets.get(lease.sheet.id) === lease.sheet &&
      options.getGeneration() === lease.generation &&
      sameIds(options.getSelectedIds(), lease.selectedIds) &&
      (path === null
        ? lease.selectedPath === null
        : lease.selectedPath !== null && sameIds(path, lease.selectedPath)) &&
      context === lease.context &&
      context?.metrics === lease.metrics &&
      context?.layout === lease.layout
    );
  }
  function current(lease: Lease): boolean {
    return (
      sameBoundary(lease) &&
      options.getRevision() === lease.revision &&
      lease.sheet.floatingImages === lease.forestReference &&
      areFloatingImageCollectionsEqual(lease.sheet.floatingImages, lease.forest)
    );
  }
  function disabledCapabilities(): PictureFormatCapabilities {
    const reason =
      options.getDisabledReason?.() ?? "This setting is not available for this object.";
    return {
      fields: Object.fromEntries(fields.map((field) => [field, { enabled: false, reason }])),
      resets: Object.fromEntries(resets.map((reset) => [reset, { enabled: false, reason }])),
    };
  }
  const owned = computed(() => {
    const sessionId = `${prefix}:${epoch.value}`;
    const capabilities = disabledCapabilities();
    let lease: Lease | undefined;
    try {
      lease = capture();
    } catch {
      /* Malformed or unresolved forests have no editable owner. */
    }
    if (!lease) return { lease, snapshot: null, capabilities };
    const { node, root, path, world, context } = lease;
    const inner = path.length > 1;
    const sourceBearing = !isPictureGroup(node) && !isGroupedGroup(node);
    const geometry = inner
      ? world && !world.collapsed
        ? { width: world.rect.width, height: world.rect.height, angleDeg: world.angleDeg }
        : undefined
      : getPictureToolGeometry(root, context);
    const values: Partial<PictureFormatValues> = {};
    if (geometry) {
      values.sizeWidthPt = geometry.width * POINTS_PER_PIXEL;
      values.sizeHeightPt = geometry.height * POINTS_PER_PIXEL;
      values.rotationDeg = geometry.angleDeg;
      values.lockAspectRatio = node.lockAspectRatio ?? sourceBearing;
    }
    const cropState =
      !isPictureGroup(node) && !isGroupedGroup(node)
        ? getPictureFormatCropState(node, world, context?.metrics)
        : undefined;
    if (sourceBearing) values.altDescription = node.altText;
    if (cropState) Object.assign(values, pictureFormatCropValues(cropState));
    if (!inner && (isPictureGroup(root) || isFramedPictureObject(root)))
      values.anchor = anchorValue(root.frame.anchor.mode);
    else if (!inner) values.anchor = "move";
    if (!options.isBusy() && canUseSheetPermission(lease.sheet, "editObjects")) {
      if (geometry) {
        const size = {
          enabled: true,
          min: MIN_FLOATING_IMAGE_SIZE * POINTS_PER_PIXEL,
          max: MAX_FLOATING_IMAGE_SIZE * POINTS_PER_PIXEL,
        };
        capabilities.fields.sizeWidthPt = size;
        capabilities.fields.sizeHeightPt = size;
        capabilities.fields.lockAspectRatio = { enabled: true };
        if (inner || isPictureGroup(root) || isFramedPictureObject(root))
          capabilities.fields.rotationDeg = { enabled: true, min: -360, max: 360 };
        if (!inner && world && (isPictureGroup(root) || isFramedPictureObject(root)))
          capabilities.fields.anchor = { enabled: true };
      }
      if (sourceBearing && (!inner || (world && !world.collapsed)))
        capabilities.fields.altDescription = { enabled: true };
      if (
        cropState &&
        (isPictureGroup(node) ||
          isGroupedGroup(node) ||
          "frame" in node ||
          !node.transform?.appearance?.reflection)
      ) {
        const dimension = {
          enabled: true,
          min: MIN_FLOATING_IMAGE_SIZE * POINTS_PER_PIXEL,
          max: MAX_FLOATING_IMAGE_SIZE * POINTS_PER_PIXEL,
        };
        const offset = { enabled: true };
        capabilities.fields.sourceWidthPt = { enabled: true };
        capabilities.fields.sourceHeightPt = { enabled: true };
        capabilities.fields.sourceOffsetXPt = offset;
        capabilities.fields.sourceOffsetYPt = offset;
        capabilities.fields.cropWidthPt = dimension;
        capabilities.fields.cropHeightPt = dimension;
        capabilities.fields.cropLeftPt = { enabled: true };
        capabilities.fields.cropTopPt = { enabled: true };
        const sourceWidth = cropState.layout.rect.width * cropState.source.widthRatio;
        const sourceHeight = cropState.layout.rect.height * cropState.source.heightRatio;
        if (
          [sourceWidth, sourceHeight].every(
            (size) => size >= MIN_FLOATING_IMAGE_SIZE && size <= MAX_FLOATING_IMAGE_SIZE,
          )
        )
          capabilities.resets!["reset-crop"] = { enabled: true };
      }
    }
    if (
      cropState &&
      !isPictureGroup(node) &&
      !isGroupedGroup(node) &&
      !("frame" in node) &&
      node.transform?.appearance?.reflection
    ) {
      const reason =
        options.getUnsupportedCropReason?.() ??
        options.getDisabledReason?.() ??
        "Crop editing cannot preserve this picture's reflection yet.";
      for (const field of [
        "sourceWidthPt",
        "sourceHeightPt",
        "sourceOffsetXPt",
        "sourceOffsetYPt",
        "cropWidthPt",
        "cropHeightPt",
        "cropLeftPt",
        "cropTopPt",
      ] as const)
        capabilities.fields[field] = { enabled: false, reason };
      capabilities.resets!["reset-crop"] = { enabled: false, reason };
    }
    const snapshot: PictureFormatSnapshot = {
      owner: {
        workbookId: lease.workbook.id,
        sheetId: lease.sheet.id,
        pictureId: node.id,
        ...(sourceBearing ? { assetId: "assetId" in node ? node.assetId : undefined } : {}),
        sessionId,
        ...(isPictureGroup(root) ? { ownerPath: [...path] } : {}),
      },
      revision: lease.revision,
      values,
      name: node.altText,
      ...(acceptedIntentId.value ? { acceptedIntentId: acceptedIntentId.value } : {}),
    };
    return { lease, snapshot, capabilities };
  });

  function plan(
    lease: Lease,
    intent: Extract<PictureFormatIntent, { type: "set-field" }>,
  ): FloatingImage[] {
    const { root, node, path, context, world } = lease;
    const inner = path.length > 1;
    if (isPictureFormatCropField(intent.field)) return planCrop(lease, intent);
    let next: FloatingImage;
    if (inner) {
      if (!isPictureGroup(root) || !context || !world || world.collapsed)
        throw new TypeError("Missing exact child geometry.");
      let edit = world;
      const metadata: { lockAspectRatio?: boolean; altText?: string } = {};
      if (intent.field === "sizeWidthPt" || intent.field === "sizeHeightPt") {
        const axis = intent.field === "sizeWidthPt" ? "width" : "height";
        const value = intent.value / POINTS_PER_PIXEL;
        const locked = node.lockAspectRatio ?? isGroupedPicture(node);
        const width =
          axis === "width"
            ? value
            : locked
              ? (world.rect.width * value) / world.rect.height
              : world.rect.width;
        const height =
          axis === "height"
            ? value
            : locked
              ? (world.rect.height * value) / world.rect.width
              : world.rect.height;
        if (
          [width, height].some(
            (size) =>
              !Number.isFinite(size) ||
              size < MIN_FLOATING_IMAGE_SIZE ||
              size > MAX_FLOATING_IMAGE_SIZE,
          )
        )
          throw new RangeError("Invalid child size.");
        const angle = (world.angleDeg * Math.PI) / 180,
          dx = width - world.rect.width,
          dy = height - world.rect.height;
        const resized = resizePictureLayoutBy(
          world,
          "se",
          {
            x: Math.cos(angle) * dx - Math.sin(angle) * dy,
            y: Math.sin(angle) * dx + Math.cos(angle) * dy,
          },
          { preserveCornerRatio: false },
        );
        if (!resized) throw new TypeError("Collapsed child size.");
        edit = resized;
      } else if (intent.field === "rotationDeg")
        edit = { ...world, angleDeg: normalizePictureAngle(intent.value) };
      else if (intent.field === "lockAspectRatio") metadata.lockAspectRatio = intent.value;
      else if (intent.field === "altDescription") metadata.altText = intent.value;
      else throw new TypeError("Unsupported child field.");
      next = applyPictureGroupChildWorldEdit(
        root,
        leasePictureGroupNode(root, path),
        edit,
        context.metrics,
        { metadata },
      );
    } else if (intent.field === "sizeWidthPt" || intent.field === "sizeHeightPt") {
      const resized = resizePictureTo(
        root,
        {
          axis: intent.field === "sizeWidthPt" ? "width" : "height",
          value: intent.value / POINTS_PER_PIXEL,
        },
        context,
      );
      if (!resized) throw new TypeError("Collapsed root size.");
      next = resized;
    } else if (intent.field === "lockAspectRatio")
      next = { ...root, lockAspectRatio: intent.value };
    else if (intent.field === "altDescription" && !isPictureGroup(root))
      next = { ...root, altText: intent.value };
    else if (
      (intent.field === "rotationDeg" || intent.field === "anchor") &&
      (isPictureGroup(root) || isFramedPictureObject(root)) &&
      context &&
      world &&
      !world.collapsed
    ) {
      next = {
        ...root,
        frame: {
          ...root.frame,
          ...(intent.field === "rotationDeg"
            ? { angleDeg: normalizePictureAngle(intent.value) }
            : {
                anchor: anchorPictureFrameRect(
                  anchorMode(intent.value),
                  world.rect,
                  context.metrics,
                  root.frame.anchor,
                ),
              }),
        },
      } as FloatingImage;
    } else throw new TypeError("Unsupported root field.");
    const forest = normalizePictureObjectCollection(
      lease.forest.map((image) => (image.id === root.id ? next : image)),
    );
    validateForest(forest, context);
    return forest;
  }
  function planCrop(lease: Lease, intent: PictureFormatIntent): FloatingImage[] {
    const { root, node, path, context, world } = lease;
    if (!context || isPictureGroup(node) || isGroupedGroup(node))
      throw new TypeError("A real source-bearing picture and worksheet metrics are required.");
    const before = getPictureFormatCropState(node, world, context.metrics);
    if (!before) throw new TypeError("Expand the picture before crop editing.");
    // Compare in the displayed canonical units before reversing the point conversion.
    // Multiplying and dividing by 0.75 need not recover the exact original pixel value.
    if (
      intent.type === "set-field" &&
      isPictureFormatCropField(intent.field) &&
      pictureFormatCropValues(before)[intent.field] === intent.value
    )
      return lease.forest;
    const changed =
      intent.type === "reset-crop"
        ? resetResolvedPictureCrop(before.layout, before.source)
        : intent.type === "set-field" &&
            isPictureFormatCropField(intent.field) &&
            typeof intent.value === "number"
          ? editResolvedPictureCrop(
              before.layout,
              before.source,
              pictureFormatCropEdit(intent.field, intent.value),
            )
          : undefined;
    if (!changed) throw new TypeError("Unknown crop operation.");
    if (changed.layout === before.layout && changed.source === before.source) return lease.forest;
    let next: FloatingImage;
    if (path.length > 1) {
      if (!isPictureGroup(root) || !isGroupedPicture(node))
        throw new TypeError("Missing owned picture.");
      next = applyPictureGroupChildWorldEdit(
        root,
        leasePictureGroupNode(root, path),
        changed.layout,
        context.metrics,
        {
          replacement: { ...node, frame: { ...node.frame, source: changed.source } },
        },
      );
    } else {
      if (isPictureGroup(root)) throw new TypeError("A container has no image source.");
      next = applyStandalonePictureCrop(root, before, changed, context.metrics);
    }
    const forest = normalizePictureObjectCollection(
      lease.forest.map((image) => (image.id === root.id ? next : image)),
    );
    validateForest(forest, context);
    return forest;
  }
  function onIntent(intent: PictureFormatIntent): boolean {
    const view = owned.value,
      lease = view.lease,
      snapshot = view.snapshot;
    if (
      !lease ||
      !snapshot ||
      mutation ||
      (intent.type !== "set-field" && intent.type !== "reset-crop") ||
      !samePictureFormatOwner(intent.owner, snapshot.owner) ||
      intent.baseRevision !== snapshot.revision ||
      typeof intent.intentId !== "string" ||
      !intent.intentId ||
      (intent.type === "set-field"
        ? view.capabilities.fields[intent.field]?.enabled !== true
        : view.capabilities.resets?.[intent.type]?.enabled !== true) ||
      options.isBusy() ||
      !canUseSheetPermission(lease.sheet, "editObjects")
    )
      return false;
    try {
      if (!current(lease)) {
        clear();
        return false;
      }
      const capability =
        intent.type === "set-field" ? view.capabilities.fields[intent.field] : undefined;
      if (
        intent.type === "set-field" &&
        (isPictureFormatCropField(intent.field) ||
          intent.field === "sizeWidthPt" ||
          intent.field === "sizeHeightPt" ||
          intent.field === "rotationDeg") &&
        typeof intent.value !== "number"
      )
        return false;
      if (
        intent.type === "set-field" &&
        typeof intent.value === "number" &&
        (!Number.isFinite(intent.value) ||
          (capability?.min !== undefined && intent.value < capability.min) ||
          (capability?.max !== undefined && intent.value > capability.max))
      )
        return false;
      if (
        intent.type === "set-field" &&
        ((intent.field === "lockAspectRatio" && typeof intent.value !== "boolean") ||
          (intent.field === "altDescription" && typeof intent.value !== "string"))
      )
        return false;
      const next = intent.type === "set-field" ? plan(lease, intent) : planCrop(lease, intent);
      if (!current(lease)) {
        clear();
        return false;
      }
      if (areFloatingImageCollectionsEqual(next, lease.forest)) {
        acceptedIntentId.value = intent.intentId;
        return true;
      }
      const pending = { boundaryChanged: false };
      mutation = pending;
      let accepted = false;
      try {
        accepted = options.execute(next) === true;
      } finally {
        const exact =
          !pending.boundaryChanged &&
          sameBoundary(lease) &&
          areFloatingImageCollectionsEqual(
            lease.sheet.floatingImages,
            accepted ? next : lease.forest,
          );
        mutation = undefined;
        const revision = options.getRevision();
        if (!exact || (accepted ? revision === lease.revision : revision !== lease.revision))
          clear();
        if (accepted && exact && revision !== lease.revision)
          acceptedIntentId.value = intent.intentId;
      }
      return accepted;
    } catch {
      mutation = undefined;
      return false;
    }
  }
  return {
    snapshot: computed(() => owned.value.snapshot),
    capabilities: computed(() => owned.value.capabilities),
    onIntent,
    clear,
    close: clear,
  };
}
