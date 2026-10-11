import { isPictureGroup } from "@sheetcraft/core/picture-group";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { MAX_FLOATING_IMAGE_SIZE, type FloatingImage } from "@sheetcraft/core/workbook";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { resizePictureLayoutBy } from "@sheetcraft/sheet-engine/picture-layout-edit";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getPictureViewRect,
  movePictureViewBy,
  replacePictureViewLayout,
} from "./picture-view-operations";

function targets(
  values: readonly FloatingImage[],
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
) {
  const roots = normalizePictureObjectCollection(values);
  const entries = roots.map((image) => ({
    image,
    rect: getPictureViewRect(image, layout, context),
    angleDeg: isPictureGroup(image) || isFramedPictureObject(image) ? image.frame.angleDeg : 0,
  }));
  if (entries.some((entry) => !entry.rect)) return null;
  return entries.map((entry) => ({ ...entry, rect: entry.rect! }));
}

/** One common delta, never an independent partial command or a persisted temporary group. */
export function movePictureRootSelectionBy(
  values: readonly FloatingImage[],
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage[] | null {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y))
    throw new RangeError("Picture selection movement must be finite.");
  const entries = targets(values, layout, context);
  if (!entries?.length) return null;
  const legacy = entries.filter(
    ({ image }) => !isPictureGroup(image) && !isFramedPictureObject(image),
  );
  const shared = {
    x: Math.max(
      delta.x,
      legacy.length ? -Math.min(...legacy.map(({ rect }) => rect.x)) : -Infinity,
    ),
    y: Math.max(
      delta.y,
      legacy.length ? -Math.min(...legacy.map(({ rect }) => rect.y)) : -Infinity,
    ),
  };
  if (shared.x === 0 && shared.y === 0) return entries.map(({ image }) => image);
  const next = entries.map(({ image }) => movePictureViewBy(image, shared, layout, context));
  return next.every((image) => image !== null) ? normalizePictureObjectCollection(next) : null;
}

/** Common local-axis factors applied around each member's own opposite edge/corner. */
export function resizePictureRootSelectionBy(
  values: readonly FloatingImage[],
  activeId: string,
  direction: FloatingImageResizeDirection,
  delta: Point,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
  minActiveSize = 24,
): FloatingImage[] | null {
  if (!["n", "s", "e", "w", "nw", "ne", "sw", "se"].includes(direction))
    throw new TypeError("Invalid picture selection resize handle.");
  if (
    !Number.isFinite(delta.x) ||
    !Number.isFinite(delta.y) ||
    !Number.isFinite(minActiveSize) ||
    minActiveSize < 1 ||
    minActiveSize > MAX_FLOATING_IMAGE_SIZE
  )
    throw new RangeError("Invalid picture selection resize input.");
  const entries = targets(values, layout, context);
  const active = entries?.find(({ image }) => image.id === activeId);
  if (!entries?.length || !active) return null;
  // The pointer's request is geometry only. A shared limit may cap this to a
  // safe/no-op factor, so don't project the active's sources at the uncapped
  // request and reject a final plan that would have remained representable.
  const requestedLayout = resizePictureLayoutBy(
    { rect: active.rect, angleDeg: active.angleDeg },
    direction,
    delta,
    {
      minSize: minActiveSize,
      maxSize: MAX_FLOATING_IMAGE_SIZE,
      preserveCornerRatio: active.image.lockAspectRatio ?? !isPictureGroup(active.image),
    },
  );
  const requested = requestedLayout?.rect;
  if (!requested) return null;
  // Pure perpendicular, zero and sub-ulp drags cannot expand an existing small
  // object merely to satisfy a UI minimum, or normalize its free anchor.
  if (requested.width === active.rect.width && requested.height === active.rect.height)
    return entries.map(({ image }) => image);
  const changesX = direction.length === 2 || direction === "e" || direction === "w";
  const changesY = direction.length === 2 || direction === "n" || direction === "s";
  const locked =
    direction.length === 2 && (active.image.lockAspectRatio ?? !isPictureGroup(active.image));
  const range = (axis: "width" | "height") => {
    const lower = Math.max(
      ...entries.map(({ image, rect }) => (image.id === activeId ? minActiveSize : 1) / rect[axis]),
    );
    const upper = Math.min(
      ...entries.map(({ image, rect }) =>
        Math.min(
          Math.max(MAX_FLOATING_IMAGE_SIZE, rect[axis]) / rect[axis],
          !isPictureGroup(image) &&
            !isFramedPictureObject(image) &&
            ((axis === "width" && direction.includes("w")) ||
              (axis === "height" && direction.includes("n")))
            ? (rect[axis === "width" ? "x" : "y"] + rect[axis]) / rect[axis]
            : Infinity,
        ),
      ),
    );
    return { lower: Math.min(lower, upper), upper };
  };
  const rx = range("width"),
    ry = range("height");
  const clamp = (v: number, low: number, high: number) => Math.min(Math.max(v, low), high);
  let scaleX = requested.width / active.rect.width,
    scaleY = requested.height / active.rect.height;
  if (locked) {
    const upper = Math.min(rx.upper, ry.upper);
    scaleX = scaleY = clamp(scaleX, Math.min(Math.max(rx.lower, ry.lower), upper), upper);
  } else {
    scaleX = changesX ? clamp(scaleX, rx.lower, rx.upper) : 1;
    scaleY = changesY ? clamp(scaleY, ry.lower, ry.upper) : 1;
  }
  const next = entries.map(({ image, rect, angleDeg }) => {
    if (scaleX === 1 && scaleY === 1) return image;
    const local = {
      x: (direction.includes("w") ? -1 : 1) * rect.width * (scaleX - 1),
      y: (direction.includes("n") ? -1 : 1) * rect.height * (scaleY - 1),
    };
    const angle = (angleDeg * Math.PI) / 180;
    const worldDelta = {
      x: Math.cos(angle) * local.x - Math.sin(angle) * local.y,
      y: Math.sin(angle) * local.x + Math.cos(angle) * local.y,
    };
    const world = resizePictureLayoutBy({ rect, angleDeg }, direction, worldDelta, {
      minSize: 1,
      maxSize: MAX_FLOATING_IMAGE_SIZE,
      preserveCornerRatio: false,
    });
    return world ? replacePictureViewLayout(image, world, layout, context) : null;
  });
  if (!next.every((image): image is FloatingImage => image !== null)) return null;
  const canonical = normalizePictureObjectCollection(next);
  // Derived geometry of every hidden member must remain representable after a
  // common factor. Never clamp one member independently after this point.
  for (const image of canonical) {
    if (isPictureGroup(image)) resolvePictureGroup(image, context!.metrics);
    else if (isFramedPictureObject(image)) resolvePictureFrame(image.frame, context!.metrics);
  }
  return canonical;
}
