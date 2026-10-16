import { normalizePictureCropShape } from "@sheetcraft/core/shape-presets";
import { getPictureProperties, type PictureProperties } from "@sheetcraft/core/picture-properties";
import { computed, getCurrentScope, onScopeDispose, ref, watch } from "vue";
import { canEditPictureRoot, canChangePictureLock } from "@sheetcraft/core/picture-protection";
import {
  getDrawingThemeEffects,
  resolvePictureThemeEffects,
  type DrawingThemeEffects,
} from "./drawing-theme-effects";
import {
  editPictureOwnAppearance,
  resetPictureAppearance,
  type PictureOwnAppearanceEdit,
} from "./picture-appearance-edit";
import {
  editPictureDetailedCategory,
  PICTURE_DETAILED_CATEGORIES,
} from "./picture-detailed-style-edit";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import { assertPicturePaintSupport } from "./picture-paint-effects";
import { assertImagePixelBudget } from "../image-assets/imageAssetValidation";
import type { PictureIntrinsicSize } from "./usePictureIntrinsicSize";
import {
  scaleResolvedPictureCropBy,
  resetResolvedPictureToOriginalSize,
} from "@sheetcraft/sheet-engine/picture-original-size";
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
  normalizePictureGroup,
  findPictureGroupNode,
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
  resolvePictureLayout,
  type PictureFrameAnchor,
  type ResolvedPictureLayout,
} from "@sheetcraft/core/picture-frame";
import {
  areFloatingImageCollectionsEqual,
  normalizeImageTransform,
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
import { capturePictureGroupPaint, editPictureGroupPaint } from "./picture-group-paint";
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
  onCropShapeApplied?: (path: PictureGroupPath) => void;
  getDisabledReason?: () => string;
  getUnsupportedCropReason?: () => string;
  /** Stable, current selected-source dimensions from the preflighted display URL. */
  getIntrinsicSize?: (assetId: string) => PictureIntrinsicSize | undefined;
  getMissingIntrinsicReason?: () => string;
  getOriginalSizeLimitReason?: () => string;
  getInheritedLineReason?: () => string;
  getCompositeLineReason?: () => string;
  getInheritedPropertiesReason?: () => string;
  getProtectedReason?: () => string;
  getLockPermissionReason?: () => string;
  /** Current, validated resource registry; callers never gain access by supplying an arbitrary ID. */
  isImageAssetAvailable?: (assetId: string) => boolean;
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
  themeEffects: DrawingThemeEffects | undefined;
  themeSignature: string;
  intrinsic: PictureIntrinsicSize | undefined;
  intrinsicDimensions: Readonly<{ width: number; height: number; url: string }> | undefined;
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
  const relativeToOriginalSize = ref(true);
  let disposed = false;
  let mutation: { boundaryChanged: boolean } | undefined;
  function clear(): void {
    if (mutation) mutation.boundaryChanged = true;
    epoch.value += 1;
    acceptedIntentId.value = undefined;
  }
  function intrinsicFor(node: Lease["node"]): PictureIntrinsicSize | undefined {
    if (!("assetId" in node)) return;
    try {
      const size = options.getIntrinsicSize?.(node.assetId);
      if (!size || size.assetId !== node.assetId || !size.url.startsWith("blob:")) return;
      assertImagePixelBudget(size.width, size.height);
      return size;
    } catch {
      return;
    }
  }
  function selectedIntrinsic(): PictureIntrinsicSize | undefined {
    try {
      return capture()?.intrinsic;
    } catch {
      return;
    }
  }
  function currentThemeEffects() {
    return getDrawingThemeEffects(options.getWorkbook().theme);
  }
  function themeSignature(): string {
    return JSON.stringify(currentThemeEffects()) ?? "no-theme-effects";
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
      selectedIntrinsic,
      currentThemeEffects,
      themeSignature,
    ],
    (next, previous) => {
      if (mutation) {
        if (
          next.slice(0, 8).some((value, index) => value !== previous[index]) ||
          next[11] !== previous[11] ||
          next[12] !== previous[12] ||
          next[13] !== previous[13] ||
          next[14] !== previous[14]
        )
          mutation.boundaryChanged = true;
      } else clear();
    },
    { flush: "sync" },
  );
  watch(
    [
      options.getWorkbook,
      options.getSheet,
      options.getGeneration,
      () => JSON.stringify(options.getSelectedIds()),
      () => JSON.stringify(options.getSelectedPath() ?? null),
      () => options.isOpen?.() ?? true,
    ],
    () => {
      relativeToOriginalSize.value = true;
    },
    { flush: "sync" },
  );
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      clear();
    });

  function validateForest(
    forest: readonly FloatingImage[],
    context: Lease["context"],
    admit = true,
  ): void {
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
    if (admit) assertPicturePaintSupport(forest, currentThemeEffects(), context?.metrics);
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
    validateForest(forest, context, false);
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
    const intrinsic = intrinsicFor(node);
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
      themeEffects: currentThemeEffects(),
      themeSignature: themeSignature(),
      intrinsic,
      intrinsicDimensions: intrinsic
        ? { width: intrinsic.width, height: intrinsic.height, url: intrinsic.url }
        : undefined,
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
      context?.layout === lease.layout &&
      currentThemeEffects() === lease.themeEffects &&
      themeSignature() === lease.themeSignature
    );
  }
  function sameIntrinsic(lease: Lease): boolean {
    const intrinsic = intrinsicFor(lease.node);
    return (
      intrinsic === lease.intrinsic &&
      intrinsic?.width === lease.intrinsicDimensions?.width &&
      intrinsic?.height === lease.intrinsicDimensions?.height &&
      intrinsic?.url === lease.intrinsicDimensions?.url
    );
  }
  function current(lease: Lease): boolean {
    return (
      sameIntrinsic(lease) &&
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
      detailed: Object.fromEntries(
        PICTURE_DETAILED_CATEGORIES.map((category) => [category, { enabled: false, reason }]),
      ),
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
    const behavior = getPictureProperties(root),
      ownProperties = getPictureProperties(node);
    const values: Partial<PictureFormatValues> = {
      altTitle: ownProperties.altTitle,
      altDescription: node.altText,
      locked: behavior.locked,
      printObject: behavior.printObject,
    };
    if (inner) {
      const reason =
        options.getInheritedPropertiesReason?.() ??
        "Positioning, locking and printing are controlled by the outer picture group.";
      for (const field of ["anchor", "locked", "printObject"] as const)
        capabilities.fields[field] = { enabled: false, reason };
    }
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
    const groupPaint =
      !sourceBearing && isPictureGroup(root) ? capturePictureGroupPaint(root, path) : undefined;
    const appearance = sourceBearing ? node.transform?.appearance : groupPaint?.appearance;
    const effectiveTheme = resolvePictureThemeEffects(appearance, lease.themeEffects);
    const ownLine = appearance?.border;
    const inheritedLine = (effectiveTheme?.outlineWidth ?? 0) > 0;
    if (sourceBearing) {
      values.altDescription = node.altText;
      values.lineMode = ownLine
        ? "solid"
        : appearance?.suppressThemeEffects?.outline
          ? "none"
          : "inherit";
      values.shadowPreset =
        appearance?.shadow ?? (appearance?.suppressThemeEffects?.shadow ? "none" : "inherit");
      if (ownLine) {
        values.lineColor = ownLine.color;
        values.lineWidthPt = ownLine.width * POINTS_PER_PIXEL;
        values.lineTransparencyPercent = 0;
      } else if (inheritedLine) {
        values.lineColor = "#364E6E";
        values.lineWidthPt = effectiveTheme!.outlineWidth * POINTS_PER_PIXEL;
        values.lineTransparencyPercent = 28;
      }
    }
    if (cropState) {
      Object.assign(values, pictureFormatCropValues(cropState));
      values.relativeToOriginalSize = relativeToOriginalSize.value;
      if (!relativeToOriginalSize.value) {
        values.scaleWidthPercent = 100;
        values.scaleHeightPercent = 100;
      } else if (lease.intrinsic) {
        values.scaleWidthPercent =
          ((cropState.layout.rect.width * cropState.source.widthRatio) / lease.intrinsic.width) *
          100;
        values.scaleHeightPercent =
          ((cropState.layout.rect.height * cropState.source.heightRatio) / lease.intrinsic.height) *
          100;
      }
    }
    if (!inner && (isPictureGroup(root) || isFramedPictureObject(root)))
      values.anchor = anchorValue(root.frame.anchor.mode);
    else if (!inner) values.anchor = "move";
    if (!options.isBusy() && canEditPictureRoot(lease.sheet, lease.root)) {
      if (sourceBearing) {
        capabilities.detailed = Object.fromEntries(
          PICTURE_DETAILED_CATEGORIES.map((category) => [category, { enabled: true }]),
        );
        capabilities.fields.lineMode = { enabled: true };
        capabilities.fields.shadowPreset = { enabled: true };
        capabilities.resets!["reset-picture"] = { enabled: true };
        const inheritedReason =
          options.getInheritedLineReason?.() ??
          "This line is inherited. Choose a local solid line to edit it independently.";
        const compositeReason =
          options.getCompositeLineReason?.() ??
          "These controls edit the local line; the separate theme outline remains visible.";
        capabilities.fields.lineColor = ownLine
          ? { enabled: true, ...(inheritedLine ? { reason: compositeReason } : {}) }
          : { enabled: false, reason: inheritedReason };
        capabilities.fields.lineWidthPt = ownLine
          ? {
              enabled: true,
              min: 0,
              max: 15,
              ...(inheritedLine ? { reason: compositeReason } : {}),
            }
          : { enabled: false, reason: inheritedReason };
      }
      if (groupPaint) {
        capabilities.detailed!.fill = { enabled: true };
        capabilities.detailed!.line = { enabled: true };
      }
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
      if (!inner || (world && !world.collapsed)) {
        capabilities.fields.altDescription = { enabled: true };
        capabilities.fields.altTitle = { enabled: true };
      }
      if (!inner) {
        capabilities.fields.locked = canChangePictureLock(lease.sheet)
          ? { enabled: true }
          : {
              enabled: false,
              reason:
                options.getLockPermissionReason?.() ??
                "Changing Locked requires Edit objects permission on this protected sheet.",
            };
        capabilities.fields.printObject = { enabled: true };
      }
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
        capabilities.fields.relativeToOriginalSize = { enabled: true };
        const originalReason =
          options.getMissingIntrinsicReason?.() ?? "Original image dimensions are not available.";
        const scaleCapability =
          !relativeToOriginalSize.value || lease.intrinsic
            ? { enabled: true }
            : { enabled: false, reason: originalReason };
        capabilities.fields.scaleWidthPercent = scaleCapability;
        capabilities.fields.scaleHeightPercent = scaleCapability;
        capabilities.resets!["reset-size"] = lease.intrinsic
          ? [lease.intrinsic.width, lease.intrinsic.height].every(
              (value) => value >= MIN_FLOATING_IMAGE_SIZE && value <= MAX_FLOATING_IMAGE_SIZE,
            )
            ? { enabled: true }
            : {
                enabled: false,
                reason:
                  options.getOriginalSizeLimitReason?.() ??
                  "Original size exceeds the picture frame's 1–10000 pixel range.",
              }
          : { enabled: false, reason: originalReason };
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
        "scaleWidthPercent",
        "scaleHeightPercent",
        "relativeToOriginalSize",
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
      capabilities.cropShape = { enabled: false, reason };
      capabilities.resets!["reset-crop"] = { enabled: false, reason };
      capabilities.resets!["reset-size"] = { enabled: false, reason };
    }
    if (sourceBearing && cropState && !capabilities.cropShape)
      capabilities.cropShape = {
        enabled: !options.isBusy() && !!context,
        ...(options.isBusy() ? { reason: options.getDisabledReason?.() } : {}),
      };
    if (!canEditPictureRoot(lease.sheet, lease.root)) {
      capabilities.cropShape = {
        enabled: false,
        reason: options.getProtectedReason?.() ?? options.getDisabledReason?.(),
      };
      const reason = options.getProtectedReason?.() ?? "This picture is protected from editing.";
      for (const field of fields) capabilities.fields[field] = { enabled: false, reason };
      for (const category of PICTURE_DETAILED_CATEGORIES)
        capabilities.detailed![category] = { enabled: false, reason };
      for (const reset of resets) capabilities.resets![reset] = { enabled: false, reason };
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
      ...(sourceBearing && (isGroupedPicture(node) || isFramedPictureObject(node))
        ? { cropShape: node.frame.cropShape }
        : {}),
      ...(sourceBearing || groupPaint ? { appearance } : {}),
      ...(groupPaint
        ? { paintScope: "group-leaves" as const, mixedDetailed: groupPaint.mixed }
        : {}),
      name: node.altText,
      ...(lease.intrinsic
        ? {
            originalSizePt: {
              width: lease.intrinsic.width * POINTS_PER_PIXEL,
              height: lease.intrinsic.height * POINTS_PER_PIXEL,
            },
          }
        : {}),
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
    if (["lineMode", "lineColor", "lineWidthPt", "shadowPreset"].includes(intent.field))
      return planAppearance(lease, intent);
    if (isPictureFormatCropField(intent.field)) return planCrop(lease, intent);
    if (intent.field === "scaleWidthPercent" || intent.field === "scaleHeightPercent")
      return planScale(lease, intent);
    let next: FloatingImage;
    if (inner) {
      if (!isPictureGroup(root) || !context || !world || world.collapsed)
        throw new TypeError("Missing exact child geometry.");
      let edit = world;
      const metadata: PictureProperties & { lockAspectRatio?: boolean; altText?: string } = {};
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
      else if (intent.field === "altTitle") metadata.altTitle = intent.value;
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
    else if (
      intent.field === "altTitle" ||
      intent.field === "locked" ||
      intent.field === "printObject"
    )
      next = { ...root, [intent.field]: intent.value };
    else if (intent.field === "altDescription") next = { ...root, altText: intent.value };
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
  function planAppearance(lease: Lease, intent: PictureFormatIntent): FloatingImage[] {
    const { node, root, path, context, world } = lease;
    if (
      (isPictureGroup(node) || isGroupedGroup(node)) &&
      isPictureGroup(root) &&
      intent.type === "set-detailed" &&
      (intent.category === "fill" || intent.category === "line")
    ) {
      const next = editPictureGroupPaint(root, path, intent, options.isImageAssetAvailable);
      const forest = normalizePictureObjectCollection(
        lease.forest.map((image) => (image.id === root.id ? next : image)),
      );
      validateForest(forest, context);
      return forest;
    }
    if (isPictureGroup(node) || isGroupedGroup(node))
      throw new TypeError("Appearance belongs to a source-bearing picture.");
    const appearance =
      intent.type === "reset-picture"
        ? resetPictureAppearance()
        : intent.type === "set-detailed"
          ? editPictureDetailedCategory(node.transform?.appearance, intent)
          : intent.type === "set-field"
            ? editPictureOwnAppearance(node.transform?.appearance, {
                field: intent.field,
                value: intent.value,
              } as PictureOwnAppearanceEdit)
            : undefined;
    if (intent.type === "set-detailed") {
      const previousIds = new Set([
        node.assetId,
        ...getDetailedPictureStyleAssetIds(node.transform?.appearance?.detailedStyle),
      ]);
      for (const id of getDetailedPictureStyleAssetIds(appearance?.detailedStyle))
        if (!previousIds.has(id) && options.isImageAssetAvailable?.(id) !== true)
          throw new TypeError("Picture paint asset is not available to this workbook.");
      if (
        world?.collapsed &&
        (intent.category === "format3d" || intent.category === "rotation3d") &&
        intent.value?.kind === "value"
      )
        throw new TypeError("Expand the picture before adjusting its projected geometry.");
    }
    let next: FloatingImage;
    if (path.length > 1) {
      if (!isPictureGroup(root)) throw new TypeError("Missing appearance owner tree.");
      const copy = normalizePictureGroup(root),
        target = findPictureGroupNode(copy, path)?.node;
      if (!target || !isGroupedPicture(target)) throw new TypeError("Missing appearance leaf.");
      const normalized = normalizeImageTransform({
        annotations: target.transform?.annotations,
        appearance,
      });
      target.transform = normalized
        ? { appearance: normalized.appearance, annotations: normalized.annotations }
        : undefined;
      if (intent.type === "reset-picture") delete target.frame.cropShape;
      next = copy;
    } else {
      if (isPictureGroup(root)) throw new TypeError("A group has no own image appearance.");
      const normalized = normalizeImageTransform({ ...root.transform, appearance });
      next = isFramedPictureObject(root)
        ? {
            ...root,
            ...(intent.type === "reset-picture"
              ? { frame: { ...root.frame, cropShape: undefined } }
              : {}),
            transform: normalized
              ? { appearance: normalized.appearance, annotations: normalized.annotations }
              : undefined,
          }
        : { ...root, transform: normalized };
    }
    const forest = normalizePictureObjectCollection(
      lease.forest.map((image) => (image.id === root.id ? next : image)),
    );
    validateForest(forest, context);
    return forest;
  }
  function planScale(
    lease: Lease,
    intent: Extract<PictureFormatIntent, { type: "set-field" }>,
  ): FloatingImage[] {
    const { node, world, context, intrinsic } = lease;
    if (
      !context ||
      isPictureGroup(node) ||
      isGroupedGroup(node) ||
      (intent.field !== "scaleWidthPercent" && intent.field !== "scaleHeightPercent") ||
      typeof intent.value !== "number" ||
      !Number.isFinite(intent.value) ||
      intent.value <= 0
    )
      throw new TypeError("Invalid source scale edit.");
    const before = getPictureFormatCropState(node, world, context.metrics);
    if (!before) throw new TypeError("Missing actual source geometry.");
    const axis = intent.field === "scaleWidthPercent" ? "width" : "height";
    const sourceExtent =
      before.layout.rect[axis] * before.source[axis === "width" ? "widthRatio" : "heightRatio"];
    const currentPercent =
      relativeToOriginalSize.value && intrinsic ? (sourceExtent / intrinsic[axis]) * 100 : 100;
    if (intent.value === currentPercent) return lease.forest;
    if (relativeToOriginalSize.value && !intrinsic)
      throw new TypeError("Original image dimensions are unavailable.");
    const factor = relativeToOriginalSize.value
      ? (intrinsic![axis] * (intent.value / 100)) / sourceExtent
      : intent.value / 100;
    const locked = node.lockAspectRatio ?? true;
    const changed = scaleResolvedPictureCropBy(
      {
        layout: resolvePictureLayout(before.layout.rect, before.layout.angleDeg),
        source: before.source,
      },
      {
        widthFactor: axis === "width" || locked ? factor : 1,
        heightFactor: axis === "height" || locked ? factor : 1,
      },
    );
    return projectSourceGeometry(lease, before, changed);
  }
  function planCrop(lease: Lease, intent: PictureFormatIntent): FloatingImage[] {
    const { node, context, world } = lease;
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
      intent.type === "reset-size" && lease.intrinsic
        ? resetResolvedPictureToOriginalSize(
            {
              layout: resolvePictureLayout(before.layout.rect, before.layout.angleDeg),
              source: before.source,
            },
            { width: lease.intrinsic.width, height: lease.intrinsic.height },
          )
        : intent.type === "reset-crop"
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
    return projectSourceGeometry(lease, before, changed, intent.type === "reset-crop");
  }
  function projectSourceGeometry(
    lease: Lease,
    before: NonNullable<ReturnType<typeof getPictureFormatCropState>>,
    changed: NonNullable<ReturnType<typeof getPictureFormatCropState>>,
    clearShape = false,
  ): FloatingImage[] {
    const { root, node, path, context } = lease;
    if (!context || isPictureGroup(node) || isGroupedGroup(node))
      throw new TypeError("A real source and metrics are required.");
    if (
      (!clearShape ||
        !((isGroupedPicture(node) || isFramedPictureObject(node)) && node.frame.cropShape)) &&
      changed.layout.angleDeg === before.layout.angleDeg &&
      (["x", "y", "width", "height"] as const).every(
        (key) => changed.layout.rect[key] === before.layout.rect[key],
      ) &&
      (["widthRatio", "heightRatio", "offsetXRatio", "offsetYRatio"] as const).every(
        (key) => changed.source[key] === before.source[key],
      )
    )
      return lease.forest;
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
          replacement: {
            ...node,
            frame: {
              ...node.frame,
              source: changed.source,
              ...(clearShape ? { cropShape: undefined } : {}),
            },
          },
        },
      );
    } else {
      if (isPictureGroup(root)) throw new TypeError("A container has no image source.");
      next = applyStandalonePictureCrop(
        root,
        before,
        changed,
        context.metrics,
        clearShape ? { cropShape: undefined } : undefined,
      );
    }
    const forest = normalizePictureObjectCollection(
      lease.forest.map((image) => (image.id === root.id ? next : image)),
    );
    validateForest(forest, context);
    return forest;
  }
  function planShape(
    lease: Lease,
    intent: Extract<PictureFormatIntent, { type: "set-crop-shape" }>,
  ): FloatingImage[] {
    const { root, node, context, world, path } = lease;
    if (!context || isPictureGroup(node) || isGroupedGroup(node))
      throw new TypeError("A source-bearing picture is required.");
    const cropShape = normalizePictureCropShape(intent.value);
    let replacement: FloatingImage;
    if (isPictureGroup(root)) {
      if (!isGroupedPicture(node)) throw new TypeError("An exact picture leaf is required.");
      replacement = applyPictureGroupChildWorldEdit(
        root,
        leasePictureGroupNode(root, path),
        world!,
        context.metrics,
        {
          replacement: { ...node, frame: { ...node.frame, cropShape } },
        },
      );
    } else {
      const crop = getPictureFormatCropState(root, undefined, context.metrics);
      if (!crop) throw new TypeError("Picture crop geometry is unavailable.");
      replacement = applyStandalonePictureCrop(root, crop, crop, context.metrics, { cropShape });
    }
    const forest = normalizePictureObjectCollection(
      lease.forest.map((entry) => (entry.id === root.id ? replacement : entry)),
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
      (intent.type !== "set-field" &&
        intent.type !== "set-crop-shape" &&
        intent.type !== "set-detailed" &&
        intent.type !== "reset-crop" &&
        intent.type !== "reset-size" &&
        intent.type !== "reset-picture") ||
      !samePictureFormatOwner(intent.owner, snapshot.owner) ||
      intent.baseRevision !== snapshot.revision ||
      typeof intent.intentId !== "string" ||
      !intent.intentId ||
      (intent.type === "set-field"
        ? view.capabilities.fields[intent.field]?.enabled !== true
        : intent.type === "set-crop-shape"
          ? view.capabilities.cropShape?.enabled !== true
          : intent.type === "set-detailed"
            ? view.capabilities.detailed?.[intent.category]?.enabled !== true
            : view.capabilities.resets?.[intent.type]?.enabled !== true) ||
      options.isBusy() ||
      !canEditPictureRoot(lease.sheet, lease.root)
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
          intent.field === "rotationDeg" ||
          intent.field === "scaleWidthPercent" ||
          intent.field === "scaleHeightPercent") &&
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
        (((intent.field === "lockAspectRatio" ||
          intent.field === "relativeToOriginalSize" ||
          intent.field === "locked" ||
          intent.field === "printObject") &&
          typeof intent.value !== "boolean") ||
          ((intent.field === "altDescription" || intent.field === "altTitle") &&
            typeof intent.value !== "string"))
      )
        return false;
      if (intent.type === "set-field" && intent.field === "relativeToOriginalSize") {
        if (relativeToOriginalSize.value !== intent.value) {
          relativeToOriginalSize.value = intent.value;
          clear(); // A draft captured with the previous percentage basis cannot be reused.
        }
        acceptedIntentId.value = intent.intentId;
        return true;
      }
      const next =
        intent.type === "set-field"
          ? plan(lease, intent)
          : intent.type === "set-crop-shape"
            ? planShape(lease, intent)
            : intent.type === "reset-picture" || intent.type === "set-detailed"
              ? planAppearance(lease, intent)
              : planCrop(lease, intent);
      if (!current(lease)) {
        clear();
        return false;
      }
      if (areFloatingImageCollectionsEqual(next, lease.forest)) {
        if (intent.type === "set-crop-shape") {
          try {
            options.onCropShapeApplied?.([...lease.path]);
          } catch {
            /* View-only callback. */
          }
        }
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
          sameIntrinsic(lease) &&
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
      if (
        accepted &&
        intent.type === "set-crop-shape" &&
        sameBoundary(lease) &&
        areFloatingImageCollectionsEqual(lease.sheet.floatingImages, next)
      ) {
        try {
          options.onCropShapeApplied?.([...lease.path]);
        } catch {
          /* A view callback cannot revoke an accepted Core transaction. */
        }
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
