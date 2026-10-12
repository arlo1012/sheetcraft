import type {
  PictureShadow,
  PictureReflection,
  PictureGlow,
  PictureSoftEdges,
  PictureFormat3d,
  PictureRotation3d,
  PictureLine,
} from "@sheetcraft/core/picture-detailed-style";
import { createPictureSolidPaint } from "./picture-paint-edit";
export function createPictureLine(): PictureLine {
  return {
    paint: { ...createPictureSolidPaint(), color: { kind: "automatic" } },
    widthPt: 1,
    compound: "single",
    dash: "solid",
    cap: "butt",
    join: "miter",
    miterLimit: 4,
  };
}
export function createPictureShadow(
  kind: PictureShadow["kind"] = "outer",
  current?: PictureShadow,
): PictureShadow {
  const value = current ?? {
    color: { kind: "rgb" as const, rgb: "#000000" },
    opacity: 0.3,
    scale: 1,
    blurPt: 6,
    distancePt: 3,
    angleDeg: 45,
    anchor: "center" as const,
  };
  const { color, opacity, scale, blurPt, distancePt, angleDeg, anchor } = value;
  return kind === "perspective"
    ? {
        kind,
        color,
        opacity,
        scale,
        blurPt,
        distancePt,
        angleDeg,
        anchor,
        scaleX: current?.kind === kind ? current.scaleX : 1,
        scaleY: current?.kind === kind ? current.scaleY : 0.5,
        skewXDeg: current?.kind === kind ? current.skewXDeg : -30,
        originX: current?.kind === kind ? current.originX : 0.5,
        originY: current?.kind === kind ? current.originY : 1,
      }
    : { kind, color, opacity, scale, blurPt, distancePt, angleDeg, anchor };
}
export function createPictureReflection(): PictureReflection {
  return { size: 0.5, opacity: 0.3, blurPt: 0, distancePt: 0 };
}
export function createPictureGlow(): PictureGlow {
  return { color: { kind: "theme", reference: { slot: "accent1" } }, opacity: 0.6, sizePt: 6 };
}
export function createPictureSoftEdges(): PictureSoftEdges {
  return { sizePt: 3 };
}
export function createPictureFormat3d(): PictureFormat3d {
  return {
    depthPt: 0,
    depthColor: { kind: "automatic" },
    contourPt: 0,
    contourColor: { kind: "automatic" },
    material: "matte",
    lighting: "balanced",
    lightingAngleDeg: 0,
  };
}
export function createPictureRotation3d(
  projection: PictureRotation3d["projection"] = "parallel",
  current?: PictureRotation3d,
): PictureRotation3d {
  const { xDeg, yDeg, zDeg, distanceFromGroundPt } = current ?? {
    xDeg: 0,
    yDeg: 0,
    zDeg: 0,
    distanceFromGroundPt: 0,
  };
  return projection === "parallel"
    ? { projection, xDeg, yDeg, zDeg, distanceFromGroundPt }
    : projection === "perspective"
      ? {
          projection,
          xDeg,
          yDeg,
          zDeg,
          distanceFromGroundPt,
          perspectiveDeg: current?.projection === projection ? current.perspectiveDeg : 45,
        }
      : {
          projection,
          xDeg,
          yDeg,
          zDeg,
          distanceFromGroundPt,
          shearX: current?.projection === projection ? current.shearX : 0.2,
          shearY: current?.projection === projection ? current.shearY : 0,
        };
}
