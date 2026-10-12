import { normalizePictureObjectCollection } from "@sheetcraft/core/picture-object";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { getPictureToolGeometry, resizePictureTo } from "./picture-tool-geometry";
import { getPictureViewRect, movePictureViewBy } from "./picture-view-operations";

export type EqualPictureDimensionsAction = "equal-height" | "equal-width" | "equal-size";

function selectedRootIds(values: readonly string[]): string[] {
  if (
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype ||
    values.length < 2 ||
    values.length > 10000
  )
    throw new TypeError("Equal picture dimensions require distinct selected roots.");
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= values.length ||
      !("value" in Object.getOwnPropertyDescriptor(values, key)!)
    )
      throw new TypeError("Equal picture dimension selections require indexed data.");
  }
  const ids: string[] = [];
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "string" ||
      !descriptor.value.trim()
    )
      throw new TypeError("Equal picture dimension selections require dense root IDs.");
    ids.push(descriptor.value);
  }
  if (new Set(ids).size !== ids.length)
    throw new TypeError("Equal picture dimensions require distinct selected roots.");
  return ids;
}

function dimension(value: number): void {
  if (!Number.isFinite(value) || value < MIN_FLOATING_IMAGE_SIZE || value > MAX_FLOATING_IMAGE_SIZE)
    throw new RangeError("Equal picture dimensions exceed the numeric size budget.");
}

/**
 * Equal dimensions always use the last-selected actual root, independently of
 * the alignment reference mode. Height/width respect each object's stored lock;
 * equal size sets both axes while preserving that lock's original value.
 *
 * WPS measurements establish unchanged layout top-left at 0 degrees. For rotated
 * Sheetcraft roots the deterministic policy also fixes the unrotated layout
 * top-left, rather than the rotated corner fixed by the numeric size helper.
 */
export function planEqualPictureDimensions(
  values: readonly FloatingImage[],
  idsValue: readonly string[],
  activeId: string | undefined,
  action: EqualPictureDimensionsAction,
  layout: SheetViewportLayout,
  context?: PictureFrameLayoutContext,
): FloatingImage[] {
  if (!["equal-height", "equal-width", "equal-size"].includes(action))
    throw new TypeError("Invalid equal picture dimensions action.");
  const ids = selectedRootIds(idsValue);
  if (typeof activeId !== "string" || !ids.includes(activeId))
    throw new TypeError("Equal picture dimensions require the last-selected root.");
  if (context && context.layout !== layout)
    throw new Error("Equal picture dimensions require current worksheet geometry.");

  // Canonical detached roots validate complete ownership/identity and retain
  // hidden descendants and unselected siblings. Only selected roots need current
  // resolved geometry; unrelated collapsed roots remain unchanged.
  const roots = normalizePictureObjectCollection(values);
  const selected = new Set(ids);
  const entries = roots
    .filter((image) => selected.has(image.id))
    .map((image) => {
      const geometry = getPictureToolGeometry(image, context);
      const rect = getPictureViewRect(image, layout, context);
      if (!geometry || !rect)
        throw new RangeError("Expand the picture before matching its dimensions.");
      resolvePictureLayout(rect, 0);
      if (rect.width <= 0 || rect.height <= 0)
        throw new RangeError("Equal picture dimensions require positive layout dimensions.");
      return { image, geometry, rect };
    });
  const entriesById = new Map(entries.map((entry) => [entry.image.id, entry]));
  if (ids.some((id) => !entriesById.has(id)))
    throw new TypeError("An equal picture dimensions target is missing.");
  const reference = entriesById.get(activeId)!;
  if (action !== "equal-height") dimension(reference.geometry.width);
  if (action !== "equal-width") dimension(reference.geometry.height);

  const next = roots.map((image) => {
    const entry = entriesById.get(image.id);
    if (!entry) return image;
    const { geometry, rect } = entry;
    const width = reference.geometry.width,
      height = reference.geometry.height;
    if (
      (action === "equal-height" && geometry.height === height) ||
      (action === "equal-width" && geometry.width === width) ||
      (action === "equal-size" && geometry.width === width && geometry.height === height)
    )
      return image;

    let resized: FloatingImage | null;
    if (action === "equal-size") {
      const horizontal = resizePictureTo(
        { ...image, lockAspectRatio: false },
        { axis: "width", value: width },
        context,
      );
      resized = horizontal
        ? resizePictureTo(horizontal, { axis: "height", value: height }, context)
        : null;
      if (resized) {
        // Preserve absence too: a group's absent lock defaults differently from
        // a standalone picture's, and equal size must never rewrite that policy.
        if (image.lockAspectRatio === undefined) delete resized.lockAspectRatio;
        else resized = { ...resized, lockAspectRatio: image.lockAspectRatio };
      }
    } else {
      resized = resizePictureTo(
        image,
        action === "equal-width"
          ? { axis: "width", value: width }
          : { axis: "height", value: height },
        context,
      );
    }
    if (!resized) throw new RangeError("Collapsed equal picture dimensions target.");
    const resizedRect = getPictureViewRect(resized, layout, context);
    if (!resizedRect) throw new RangeError("Collapsed equal picture dimensions target.");
    // Avoid gratuitous reanchoring of legacy free offsets and no-op frame edits.
    const delta = { x: rect.x - resizedRect.x, y: rect.y - resizedRect.y };
    if (delta.x !== 0 || delta.y !== 0) {
      resized = movePictureViewBy(resized, delta, layout, context);
      if (!resized) throw new RangeError("Unrepresentable equal picture dimensions position.");
    }
    const result = getPictureToolGeometry(resized, context);
    if (!result) throw new RangeError("Collapsed equal picture dimensions target.");
    dimension(result.width);
    dimension(result.height);
    return resized;
  });
  // A final detached forest preflight retains ownership and rejects derived
  // hidden subtree/source overflow within every selected root before commit.
  const canonical = normalizePictureObjectCollection(next);
  for (const image of canonical) {
    if (!selected.has(image.id)) continue;
    const rect = getPictureViewRect(image, layout, context);
    if (!rect) throw new RangeError("Collapsed equal picture dimensions forest.");
    resolvePictureLayout(rect, 0);
  }
  return canonical;
}
