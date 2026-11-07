import type { PieGalleryFormat } from "@sheetcraft/core/chart-presentation";
import { color } from "echarts/core";

export function pieOutsideLabels(format?: PieGalleryFormat) {
  return format?.pieLabelPlacement === "outside" || format?.pieLabelPlacement === "boxedOutside";
}

/** Native sectors, projected tops and the secondary stack share the same paints. */
export function pieSectorPaint(base: string, format?: PieGalleryFormat) {
  const fill = format?.pieFill;
  const gradient = fill === "gradient" || fill === "hatchGradient";
  const texture =
    fill === "hatch" || fill === "checker" || fill === "dots" || fill === "hatchGradient";
  const border =
    format?.pieStroke === "dark"
      ? "#273243"
      : format?.pieStroke === "light"
        ? "#ffffff"
        : fill === "outline"
          ? base
          : undefined;
  return {
    color: gradient
      ? {
          type: "linear" as const,
          x: 0,
          y: 0,
          x2: 1,
          y2: 1,
          colorStops: [
            { offset: 0, color: color.lerp(0.47, [base, "#ffffff"])! },
            { offset: 0.5, color: base },
            { offset: 1, color: color.lerp(0.22, [base, "#000000"])! },
          ],
        }
      : fill === "outline"
        ? color.lerp(0.93, [base, "#ffffff"])!
        : base,
    ...(border ? { borderColor: border, borderWidth: fill === "outline" ? 1.6 : 1 } : {}),
    ...(texture
      ? {
          decal: {
            symbol: fill === "dots" ? "circle" : "rect",
            color: "rgba(255,255,255,.52)",
            dashArrayX: fill === "checker" ? [3, 3] : fill === "dots" ? [2, 4] : 1,
            dashArrayY: fill === "checker" ? [3, 3] : fill === "dots" ? [2, 4] : [2, 3],
            rotation: fill === "checker" || fill === "dots" ? 0 : -Math.PI / 4,
          },
        }
      : {}),
  };
}

export function piePathPaint(base: string, format?: PieGalleryFormat) {
  const {
    color: fill,
    borderColor: stroke,
    borderWidth: lineWidth,
    decal,
  } = pieSectorPaint(base, format);
  return { fill, stroke, lineWidth, decal };
}

export function pieLabelPaint(base: string, format?: PieGalleryFormat) {
  const boxed =
    format?.pieLabelPlacement === "boxedInside" || format?.pieLabelPlacement === "boxedOutside";
  if (boxed)
    return {
      color: "#273243",
      backgroundColor: "#ffffff",
      borderColor: base,
      borderWidth: 1,
      borderRadius: 2,
      padding: [2, 3] as [number, number],
    };
  if (pieOutsideLabels(format) || format?.pieFill === "outline") return { color: "#273243" };
  const rgb = color.parse(base);
  return {
    color: rgb && rgb[0]! * 0.299 + rgb[1]! * 0.587 + rgb[2]! * 0.114 > 155 ? "#242833" : "#ffffff",
  };
}
