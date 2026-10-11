import type {
  PictureColor,
  PictureDetailedStyle,
  PictureGradientPaint,
  PicturePaint,
  PictureLine,
} from "../../picture-detailed-style.js";

export function rgb(): PictureColor {
  return { kind: "rgb", rgb: "#ABCDEF" };
}
export function gradient(): Extract<PictureGradientPaint, { kind: "linear" }> {
  return {
    kind: "linear",
    opacity: 0.8,
    rotateWithShape: true,
    angleDeg: 30,
    stops: [
      { offset: 0, color: rgb(), opacity: 1, brightness: -0.2 },
      {
        offset: 0.5,
        color: { kind: "theme", reference: { slot: "accent2", tint: 0.3 } },
        opacity: 0.4,
        brightness: 0.2,
      },
      { offset: 0.5, color: { kind: "automatic" }, opacity: 0.6, brightness: 0 },
      { offset: 1, color: rgb(), opacity: 0, brightness: 1 },
    ],
  };
}
export function picturePaint(
  assetId = "texture-asset",
): Extract<PicturePaint, { kind: "picture" }> {
  return {
    kind: "picture",
    assetId,
    opacity: 0.7,
    rotateWithShape: true,
    layout: {
      kind: "tile",
      scaleX: 0.5,
      scaleY: 2,
      offsetXPt: -12,
      offsetYPt: 6,
      flip: "xy",
      anchor: "center",
    },
  };
}
export function line(paint: PicturePaint = gradient()): PictureLine {
  return {
    paint,
    widthPt: 24,
    compound: "triple",
    dash: "long-dash-dot-dot",
    cap: "square",
    join: "miter",
    miterLimit: 10,
  };
}
export function fullStyle(): PictureDetailedStyle {
  return {
    fill: { kind: "value", value: gradient() },
    line: { kind: "value", value: line() },
    shadow: {
      kind: "value",
      value: {
        kind: "perspective",
        color: rgb(),
        opacity: 0.6,
        scale: 1.2,
        blurPt: 7,
        distancePt: 11,
        angleDeg: 315,
        anchor: "bottom-left",
        scaleX: 1.1,
        scaleY: -0.5,
        skewXDeg: 30,
        originX: 0.5,
        originY: 1,
      },
    },
    reflection: { kind: "value", value: { size: 0.6, opacity: 0.35, blurPt: 3, distancePt: 8 } },
    glow: {
      kind: "value",
      value: { color: { kind: "theme", reference: { slot: "accent6" } }, opacity: 0.7, sizePt: 9 },
    },
    softEdges: { kind: "value", value: { sizePt: 2.5 } },
    format3d: {
      kind: "value",
      value: {
        depthPt: 12,
        depthColor: rgb(),
        contourPt: 2,
        contourColor: { kind: "automatic" },
        material: "wire-frame",
        lighting: "three-point",
        lightingAngleDeg: 45,
      },
    },
    rotation3d: {
      kind: "value",
      value: {
        projection: "perspective",
        xDeg: 340,
        yDeg: 20,
        zDeg: 10,
        perspectiveDeg: 45,
        distanceFromGroundPt: -3,
      },
    },
  };
}
