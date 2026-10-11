import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "@sheetcraft/core/picture-object";
import {
  isPictureGroup,
  traversePictureGroup,
  type GroupedPicture,
} from "@sheetcraft/core/picture-group";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  pictureFrameLocalToWorld,
  resolvePictureFrame,
  type ResolvedPictureFrame,
} from "@sheetcraft/core/picture-frame";
import {
  resolvePictureGroup,
  type ResolvedPictureGroupChild,
} from "@sheetcraft/core/picture-group-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import { resolvePictureThemeEffects, type DrawingThemeEffects } from "./drawing-theme-effects";

/** A known appearance/layout mismatch that live actions can report explicitly. */
export class UnsupportedPicturePaintError extends Error {
  readonly code = "unsupported-picture-reflection";
  constructor() {
    super("Framed picture reflection is not supported by this prepared painter.");
    this.name = "UnsupportedPicturePaintError";
  }
}

/** Reject unsupported content before commands, save, cache access or source preparation. */
export function assertPicturePaintSupport(
  images: readonly FloatingImage[],
  effects?: DrawingThemeEffects,
  metrics?: PictureSheetMetrics,
): void {
  assertDrawingThemeEffects(effects);
  const canonical = normalizePictureObjectCollection(images);
  for (const image of canonical) {
    if (isFramedPictureObject(image)) {
      assertSourceBearingPicturePaintSupport(image, effects);
      if (resolvePictureThemeEffects(image.transform?.appearance, effects)?.reflection && metrics)
        assertPictureReflectionGeometry(resolvePictureFrame(image.frame, metrics));
    } else if (isPictureGroup(image)) {
      // Hidden roots and descendants still belong to the persisted paint contract.
      for (const { node } of traversePictureGroup(image))
        if (node.kind === "grouped-picture-v1")
          assertSourceBearingPicturePaintSupport(node, effects);
      if (effects?.reflection && metrics) {
        const visit = (children: readonly ResolvedPictureGroupChild[]): void => {
          for (const child of children) {
            if ("members" in child) visit(child.members);
            else if (
              child.layout &&
              resolvePictureThemeEffects(child.node.transform?.appearance, effects)?.reflection
            )
              assertPictureReflectionGeometry(child.layout);
          }
        };
        visit(resolvePictureGroup(image, metrics).members);
      }
    }
  }
}

/** The picture has already passed its strict standalone/owned normalizer. */
export function assertSourceBearingPicturePaintSupport(
  picture: FramedFloatingImage | GroupedPicture,
  effects?: DrawingThemeEffects,
): void {
  if (
    picture.transform?.appearance?.reflection &&
    picture.transform.appearance.detailedStyle?.reflection === undefined
  )
    throw new UnsupportedPicturePaintError();
  assertDrawingThemeEffects(effects);
}

/** Validate inherited data before a per-picture override can suppress its values. */
function assertDrawingThemeEffects(effects: DrawingThemeEffects | undefined): void {
  if (!effects) return;
  const descriptors = Object.getOwnPropertyDescriptors(effects);
  const allowed = new Set([
    "id",
    "name",
    "shadow",
    "reflection",
    "bevel",
    "outlineWidth",
    "gradient",
  ]);
  for (const key of Reflect.ownKeys(descriptors))
    if (typeof key !== "string" || !allowed.has(key) || !("value" in descriptors[key]!))
      throw new TypeError("Inherited drawing theme effects require supported data fields.");
  const shadow = descriptors.shadow?.value;
  if (typeof shadow !== "string" || !["none", "soft", "hard"].includes(shadow))
    throw new TypeError("Inherited drawing theme shadow must be none, soft, or hard.");
  for (const key of ["reflection", "bevel", "gradient"] as const)
    if (typeof descriptors[key]?.value !== "boolean")
      throw new TypeError(`Inherited drawing theme ${key} must be boolean.`);
  const width = descriptors.outlineWidth?.value;
  if (typeof width !== "number" || !Number.isFinite(width) || width < 0)
    throw new TypeError("Inherited drawing theme outline width must be non-negative and finite.");
}

/** Validate the mirrored local frame, including hidden owned-leaf geometry. */
export function assertPictureReflectionGeometry(geometry: ResolvedPictureFrame): void {
  const bottom = 2 * geometry.rect.height;
  if (!Number.isFinite(bottom))
    throw new RangeError("Picture reflection translation must be finite.");
  for (const x of [0, geometry.rect.width])
    for (const y of [geometry.rect.height, bottom])
      pictureFrameLocalToWorld(geometry.rect, geometry.angleDeg, { x, y });
}

export function applyDrawingThemeShadow(
  context: CanvasRenderingContext2D,
  effects: DrawingThemeEffects | undefined,
): void {
  if (effects?.shadow === "soft") {
    context.shadowColor = "rgb(0 0 0 / 28%)";
    context.shadowBlur = 8;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 3;
  } else if (effects?.shadow === "hard") {
    context.shadowColor = "rgb(0 0 0 / 42%)";
    context.shadowBlur = 1;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
  }
}

export function paintDrawingThemeOutline(
  context: CanvasRenderingContext2D,
  rect: Rect,
  effects: DrawingThemeEffects,
): void {
  const outlineWidth = Math.max(0, effects.outlineWidth);
  if (outlineWidth > 0) {
    context.save();
    try {
      context.lineWidth = outlineWidth;
      context.strokeStyle = "rgb(54 78 110 / 72%)";
      const inset = outlineWidth / 2;
      context.strokeRect(
        rect.x + inset,
        rect.y + inset,
        Math.max(0, rect.width - outlineWidth),
        Math.max(0, rect.height - outlineWidth),
      );
    } finally {
      context.restore();
    }
  }
  if (effects.bevel) {
    context.save();
    try {
      context.lineWidth = 1;
      context.strokeStyle = "rgb(255 255 255 / 76%)";
      context.beginPath();
      context.moveTo(rect.x + 0.5, rect.y + rect.height - 0.5);
      context.lineTo(rect.x + 0.5, rect.y + 0.5);
      context.lineTo(rect.x + rect.width - 0.5, rect.y + 0.5);
      context.stroke();
      context.strokeStyle = "rgb(0 0 0 / 40%)";
      context.beginPath();
      context.moveTo(rect.x + rect.width - 0.5, rect.y + 0.5);
      context.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height - 0.5);
      context.lineTo(rect.x + 0.5, rect.y + rect.height - 0.5);
      context.stroke();
    } finally {
      context.restore();
    }
  }
}
