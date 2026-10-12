import {
  normalizeDetailedPictureStyle,
  type PictureDetailedStyle,
} from "@sheetcraft/core/picture-detailed-style";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import { resolvePictureThemeEffects, type DrawingThemeEffects } from "./picture-inherited-effects";

const PT_PER_PX = 0.75;

/** Enter the raster path only for a real typed category; old pictures keep their fast painter. */
export function resolvePictureDetailedPaintStyle(
  appearance: ImageAppearance | undefined,
  inherited: DrawingThemeEffects | undefined,
  forceRaster = false,
): { style: PictureDetailedStyle; remainingTheme: DrawingThemeEffects | undefined } | undefined {
  const own = normalizeDetailedPictureStyle(appearance?.detailedStyle);
  if (!own && !forceRaster) return;
  const theme = resolvePictureThemeEffects(appearance, inherited);
  const style: PictureDetailedStyle = { ...own };
  if (style.line === undefined && appearance?.border)
    style.line = {
      kind: "value",
      value: {
        paint: { kind: "solid", color: { kind: "rgb", rgb: appearance.border.color }, opacity: 1 },
        widthPt: appearance.border.width * PT_PER_PX,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    };
  if (forceRaster && style.line === undefined && theme && theme.outlineWidth > 0) {
    style.line = {
      kind: "value",
      value: {
        paint: { kind: "solid", color: { kind: "rgb", rgb: "#364E6E" }, opacity: 0.72 },
        widthPt: theme.outlineWidth * PT_PER_PX,
        compound: "single",
        dash: "solid",
        cap: "butt",
        join: "miter",
        miterLimit: 4,
      },
    };
  }
  if (style.shadow === undefined) {
    const shadow = appearance?.shadow ?? (theme?.shadow === "none" ? undefined : theme?.shadow);
    if (shadow) {
      const ownShadow = appearance?.shadow !== undefined;
      const x = ownShadow || shadow === "hard" ? 3 : 2,
        y = 3;
      style.shadow = {
        kind: "value",
        value: {
          kind: "outer",
          color: { kind: "rgb", rgb: "#000000" },
          opacity: ownShadow ? 0.35 : shadow === "hard" ? 0.42 : 0.28,
          scale: 1,
          blurPt: (shadow === "soft" ? 8 : 1) * PT_PER_PX,
          distancePt: Math.hypot(x, y) * PT_PER_PX,
          angleDeg: (Math.atan2(y, x) * 180) / Math.PI,
          anchor: "center",
        },
      };
    }
  }
  if (style.reflection === undefined && (appearance?.reflection || theme?.reflection))
    style.reflection = {
      kind: "value",
      value: { size: appearance?.reflection ? 0.25 : 1, opacity: 0.22, blurPt: 0, distancePt: 0 },
    };
  return {
    style: normalizeDetailedPictureStyle(style) ?? {},
    remainingTheme: theme
      ? {
          ...theme,
          shadow: "none",
          reflection: false,
          outlineWidth: forceRaster ? 0 : theme.outlineWidth,
          bevel: own?.format3d !== undefined ? false : theme.bevel,
        }
      : undefined,
  };
}
