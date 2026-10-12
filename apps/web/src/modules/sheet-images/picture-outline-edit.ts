import type { ImageAppearance } from "@sheetcraft/core/workbook";
import type { PictureColor } from "@sheetcraft/core/picture-detailed-style";
import { getPictureOwnDetailedStyle } from "./picture-detailed-style-edit";
import { createPictureLine } from "./picture-effect-edit";

/** Width changes preserve gradient/pattern paint, compound strokes and every unrelated effect. */
export function pictureOutlineWidthPatch(
  appearance: ImageAppearance | undefined,
  widthPx: number,
): Partial<ImageAppearance> {
  if (!Number.isFinite(widthPx) || widthPx < 0 || widthPx > 20)
    throw new RangeError("Picture ribbon outline width must be 0–20 pixels.");
  if (appearance?.detailedStyle?.line !== undefined) {
    const own = getPictureOwnDetailedStyle(appearance)?.line;
    const value = own?.kind === "value" ? own.value : createPictureLine();
    return {
      border: undefined,
      detailedStyle: {
        ...appearance.detailedStyle,
        line:
          widthPx === 0
            ? { kind: "none" }
            : { kind: "value", value: { ...value, widthPt: widthPx * 0.75 } },
      },
    };
  }
  return { border: { color: appearance?.border?.color ?? "#000000", width: widthPx } };
}
/** Selecting one palette color explicitly chooses a solid line, retaining its width and structure. */
export function pictureOutlineColorPatch(
  appearance: ImageAppearance | undefined,
  color: PictureColor,
): Partial<ImageAppearance> {
  const own = getPictureOwnDetailedStyle(appearance)?.line;
  if (appearance?.detailedStyle?.line !== undefined || color.kind !== "rgb") {
    const value = own?.kind === "value" ? own.value : createPictureLine();
    return {
      border: undefined,
      detailedStyle: {
        ...appearance?.detailedStyle,
        line: {
          kind: "value",
          value: { ...value, paint: { kind: "solid", color, opacity: value.paint.opacity } },
        },
      },
    };
  }
  return { border: { color: color.rgb, width: appearance?.border?.width ?? 1 } };
}
