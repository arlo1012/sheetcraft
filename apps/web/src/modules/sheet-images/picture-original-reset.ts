import {
  anchorPictureFrameRect,
  resolvePictureFrame,
  resolvePictureLayout,
  type PictureFrameRect,
} from "@sheetcraft/core/picture-frame";
import {
  isPictureGroup,
  MAX_PICTURE_GROUP_DEPTH,
  type PictureGroupPath,
} from "@sheetcraft/core/picture-group";
import {
  applyPictureGroupChildWorldEdit,
  leasePictureGroupNode,
} from "@sheetcraft/core/picture-group-edit";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import {
  MAX_FLOATING_IMAGE_SIZE,
  MIN_FLOATING_IMAGE_SIZE,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { restoreFloatingImage } from "@sheetcraft/sheet-engine/floating-image-transform";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resolveOwnedPictureNode } from "./picture-group-interaction";

type OriginalPictureSource = { assetId: string; width: number; height: number };

function readPath(value: PictureGroupPath): string[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    !value.length ||
    value.length > MAX_PICTURE_GROUP_DEPTH + 1
  )
    throw new TypeError("Restore Original requires an exact bounded picture path.");
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length ||
      !("value" in Object.getOwnPropertyDescriptor(value, key)!)
    )
      throw new TypeError("Restore Original paths require indexed data only.");
  }
  const path: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      !descriptor.value.trim()
    )
      throw new TypeError("Restore Original paths require dense own picture IDs.");
    path.push(descriptor.value);
  }
  return path;
}

function readOriginal(value: OriginalPictureSource): OriginalPictureSource {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Restore Original requires the actual image source.");
  const fields = ["assetId", "width", "height"].map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor))
      throw new TypeError("Restore Original source fields must be own data.");
    return descriptor.value as unknown;
  });
  const [assetId, width, height] = fields;
  if (typeof assetId !== "string" || !assetId.trim())
    throw new TypeError("Restore Original requires the actual source asset ID.");
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new RangeError("Original image dimensions must be finite and positive.");
  return { assetId, width, height };
}

/** Same scale-and-clamp contract as sheet-engine floating-image-transform's fitImageSize. */
function fitOriginalSize(width: number, height: number): { width: number; height: number } {
  let scale = Math.min(1, MAX_FLOATING_IMAGE_SIZE / Math.max(width, height));
  if (Math.min(width * scale, height * scale) < MIN_FLOATING_IMAGE_SIZE)
    scale = Math.max(scale, MIN_FLOATING_IMAGE_SIZE / Math.min(width, height));
  if (Math.max(width * scale, height * scale) > MAX_FLOATING_IMAGE_SIZE)
    scale = MAX_FLOATING_IMAGE_SIZE / Math.max(width, height);
  return {
    width: Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(MIN_FLOATING_IMAGE_SIZE, width * scale)),
    height: Math.min(MAX_FLOATING_IMAGE_SIZE, Math.max(MIN_FLOATING_IMAGE_SIZE, height * scale)),
  };
}

function originalRect(rect: PictureFrameRect, original: OriginalPictureSource): PictureFrameRect {
  const size = fitOriginalSize(original.width, original.height);
  return {
    x: rect.x + (rect.width - size.width) / 2,
    y: rect.y + (rect.height - size.height) / 2,
    ...size,
  };
}

/**
 * Sheetcraft's combined Restore Original policy: restore actual source size,
 * full crop and zero world 2D angle/flips while retaining appearance and the
 * current unrotated frame center. This is not a measured WPS reset contract.
 * Return the complete detached forest, including unrelated hidden ownership.
 */
export function planPictureOriginalReset(
  values: readonly FloatingImage[],
  pathValue: PictureGroupPath,
  originalValue: OriginalPictureSource,
  context: PictureFrameLayoutContext,
): FloatingImage[] {
  const path = readPath(pathValue),
    original = readOriginal(originalValue),
    roots = normalizePictureObjectCollection(values),
    root = roots.find((entry) => entry.id === path[0]);
  if (!root) throw new TypeError("Restore Original picture is missing.");
  if (!context?.layout || !context.metrics)
    throw new TypeError("Restore Original requires current worksheet geometry.");

  let next: FloatingImage;
  if (path.length > 1) {
    if (!isPictureGroup(root))
      throw new TypeError("Restore Original requires the exact picture owner.");
    const lease = leasePictureGroupNode(root, path),
      target = resolveOwnedPictureNode(roots, path, context);
    if (!target || target.node.kind !== "grouped-picture-v1")
      throw new TypeError("Picture containers have no original image source.");
    if (!target.visible || !target.layout || target.layout.collapsed)
      throw new RangeError("Expand the picture before restoring its original source.");
    if (target.node.assetId !== original.assetId)
      throw new TypeError("Restore Original source asset changed.");
    const {
      flipHorizontal: _horizontal,
      flipVertical: _vertical,
      cropShape: _shape,
      ...frame
    } = target.node.frame;
    next = applyPictureGroupChildWorldEdit(
      root,
      lease,
      resolvePictureLayout(originalRect(target.layout.rect, original), 0),
      context.metrics,
      {
        replacement: {
          ...target.node,
          frame: {
            ...frame,
            source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          },
        },
      },
    );
  } else {
    if (isPictureGroup(root))
      throw new TypeError("Picture containers have no original image source.");
    if (root.hidden) throw new TypeError("A hidden picture cannot restore its original source.");
    if (root.assetId !== original.assetId)
      throw new TypeError("Restore Original source asset changed.");
    if (!isFramedPictureObject(root)) {
      const restored = restoreFloatingImage(root, context.layout, original);
      if (!restored)
        throw new RangeError("Expand the picture before restoring its original source.");
      next = restored;
    } else {
      const layout = resolvePictureFrame(root.frame, context.metrics);
      if (layout.collapsed)
        throw new RangeError("Expand the picture before restoring its original source.");
      const rect = originalRect(layout.rect, original);
      const unchangedRect =
        rect.x === layout.rect.x &&
        rect.y === layout.rect.y &&
        rect.width === layout.rect.width &&
        rect.height === layout.rect.height;
      next = {
        ...root,
        frame: {
          kind: "object-frame-v1",
          anchor: unchangedRect
            ? root.frame.anchor
            : anchorPictureFrameRect(
                root.frame.anchor.mode,
                rect,
                context.metrics,
                root.frame.anchor,
              ),
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
        },
      };
      resolvePictureFrame(next.frame, context.metrics);
    }
  }
  return normalizePictureObjectCollection(
    roots.map((entry) => (entry.id === root.id ? next : entry)),
  );
}
