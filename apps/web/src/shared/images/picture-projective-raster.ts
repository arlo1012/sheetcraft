import type { PictureFormat3d } from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  createPictureRgbaSurface,
  type PictureRasterLayer,
  type PictureRgbaSurface,
} from "./picture-effect-raster";
import { resolvePictureColor, type PictureRgb } from "./picture-paint-color";
import {
  resolvePictureMaterialLighting,
  shadePictureMaterialColor,
  type ResolvedPictureMaterialLighting,
} from "./picture-material-lighting";
import {
  mapPictureProjectivePoint,
  type PictureProjectiveBounds,
  type PictureProjectiveFace,
  type PictureProjectiveGeometry,
  type PictureProjectiveHomography,
  type PictureProjectivePoint,
} from "./picture-projective-geometry";

const MAX_SIDE = 4096,
  MAX_PIXELS = 4_000_000;
function boundsOf(points: readonly PictureProjectivePoint[]): PictureProjectiveBounds {
  const x = points.map((point) => point.x),
    y = points.map((point) => point.y);
  return {
    left: Math.min(...x),
    top: Math.min(...y),
    right: Math.max(...x),
    bottom: Math.max(...y),
  };
}
function checkBounds(bounds: PictureProjectiveBounds): void {
  if (
    ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) ||
    bounds.right <= bounds.left ||
    bounds.bottom <= bounds.top
  )
    throw new RangeError("Picture projected paint bounds must be positive and finite.");
}

/** Maps the entire alpha/outline raster footprint, not just the durable selection frame. */
export function getPictureProjectivePaintBounds(
  geometry: PictureProjectiveGeometry,
  sourceBounds: PictureProjectiveBounds,
  contourWidthPx = 0,
): PictureProjectiveBounds {
  checkBounds(sourceBounds);
  if (!Number.isFinite(contourWidthPx) || contourWidthPx < 0 || contourWidthPx > 65536)
    throw new RangeError("Picture projected contour width is invalid.");
  const projected = boundsOf([
    mapPictureProjectivePoint(geometry, { x: sourceBounds.left, y: sourceBounds.top }),
    mapPictureProjectivePoint(geometry, { x: sourceBounds.right, y: sourceBounds.top }),
    mapPictureProjectivePoint(geometry, { x: sourceBounds.right, y: sourceBounds.bottom }),
    mapPictureProjectivePoint(geometry, { x: sourceBounds.left, y: sourceBounds.bottom }),
  ]);
  const margin = contourWidthPx / 2 + 1;
  const result = {
    left: Math.floor(Math.min(projected.left, geometry.visualBounds.left) - margin),
    top: Math.floor(Math.min(projected.top, geometry.visualBounds.top) - margin),
    right: Math.ceil(Math.max(projected.right, geometry.visualBounds.right) + margin),
    bottom: Math.ceil(Math.max(projected.bottom, geometry.visualBounds.bottom) + margin),
  };
  checkBounds(result);
  return result;
}

function insideQuad(face: PictureProjectiveFace, x: number, y: number): boolean {
  let direction = 0;
  for (let index = 0; index < 4; index++) {
    const a = face.corners[index]!,
      b = face.corners[(index + 1) % 4]!;
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (Math.abs(cross) < 1e-10) continue;
    const next = cross > 0 ? 1 : -1;
    if (direction && next !== direction) return false;
    direction = next;
  }
  return direction !== 0;
}
function edgeDistance(face: PictureProjectiveFace, x: number, y: number): number {
  let distance = Infinity;
  for (let index = 0; index < 4; index++) {
    const a = face.corners[index]!,
      b = face.corners[(index + 1) % 4]!;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      square = dx * dx + dy * dy;
    const t = square > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / square)) : 0;
    distance = Math.min(distance, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return distance;
}
function over(
  data: Uint8ClampedArray,
  index: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  const oldAlpha = data[index + 3]! / 255,
    next = alpha + oldAlpha * (1 - alpha);
  data[index] = (r * alpha + data[index]! * oldAlpha * (1 - alpha)) / next;
  data[index + 1] = (g * alpha + data[index + 1]! * oldAlpha * (1 - alpha)) / next;
  data[index + 2] = (b * alpha + data[index + 2]! * oldAlpha * (1 - alpha)) / next;
  data[index + 3] = next * 255;
}
function paintTexture(
  output: PictureRgbaSurface,
  origin: PictureProjectivePoint,
  input: PictureRasterLayer,
  inverse: PictureProjectiveHomography,
  lighting: ResolvedPictureMaterialLighting,
): void {
  const source = input.surface,
    pixels = source.data;
  for (let y = 0; y < output.height; y++)
    for (let x = 0; x < output.width; x++) {
      const px = x + origin.x + 0.5,
        py = y + origin.y + 0.5;
      const w = inverse[6] * px + inverse[7] * py + inverse[8];
      if (!Number.isFinite(w) || Math.abs(w) < 1e-12) continue;
      const sx = (inverse[0] * px + inverse[1] * py + inverse[2]) / w - input.left - 0.5;
      const sy = (inverse[3] * px + inverse[4] * py + inverse[5]) / w - input.top - 0.5;
      if (
        !Number.isFinite(sx) ||
        !Number.isFinite(sy) ||
        sx < -1 ||
        sy < -1 ||
        sx > source.width ||
        sy > source.height
      )
        continue;
      const ix = Math.floor(sx),
        iy = Math.floor(sy),
        tx = sx - ix,
        ty = sy - iy;
      let alpha = 0,
        r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const xx = ix + dx,
            yy = iy + dy;
          if (xx < 0 || yy < 0 || xx >= source.width || yy >= source.height) continue;
          const i = (yy * source.width + xx) * 4;
          const weight = ((dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * pixels[i + 3]!) / 255;
          alpha += weight;
          r += weight * pixels[i]!;
          g += weight * pixels[i + 1]!;
          b += weight * pixels[i + 2]!;
        }
      if (alpha <= 0) continue;
      over(
        output.data,
        (y * output.width + x) * 4,
        Math.min(255, (r / alpha) * lighting.multiply[0] + lighting.add[0]),
        Math.min(255, (g / alpha) * lighting.multiply[1] + lighting.add[1]),
        Math.min(255, (b / alpha) * lighting.multiply[2] + lighting.add[2]),
        alpha * lighting.alphaScale,
      );
    }
}

export type PictureProjectiveRasterOptions = Readonly<{
  geometry: PictureProjectiveGeometry;
  input: PictureRasterLayer;
  theme: WorkbookTheme;
  format?: PictureFormat3d;
  /** Output pixels per CSS pixel, for canonical point lengths. */
  density: number;
}>;

/** Genuine inverse-projective texture reconstruction and lit convex side faces.
 * A zero-depth picture is double-sided (mirrored from behind); an extruded back
 * uses the configured depth paint. These are deliberate product semantics.
 * Bounds remain paint-only; alpha surfaces and source bytes are never modified. */
export function createPictureProjectiveRaster(
  options: PictureProjectiveRasterOptions,
): PictureRasterLayer {
  const { geometry, input, theme, format, density } = options;
  if (!Number.isFinite(density) || density <= 0 || density > 64)
    throw new RangeError("Picture projective density is invalid.");
  if (
    !Number.isFinite(input.left) ||
    !Number.isFinite(input.top) ||
    !Number.isInteger(input.surface.width) ||
    !Number.isInteger(input.surface.height) ||
    input.surface.width < 1 ||
    input.surface.height < 1 ||
    input.surface.width > MAX_SIDE ||
    input.surface.height > MAX_SIDE ||
    input.surface.width * input.surface.height > MAX_PIXELS ||
    !(input.surface.data instanceof Uint8ClampedArray) ||
    input.surface.data.length !== input.surface.width * input.surface.height * 4
  )
    throw new TypeError("Picture projected source must have exact RGBA data.");
  const sourceBounds = {
    left: input.left,
    top: input.top,
    right: input.left + input.surface.width,
    bottom: input.top + input.surface.height,
  };
  const material: Pick<PictureFormat3d, "material" | "lighting" | "lightingAngleDeg"> = format ?? {
    material: "flat",
    lighting: "flat",
    lightingAngleDeg: 0,
  };
  const wireframe = material.material === "wire-frame";
  const contourWidth = format ? ((format.contourPt * 4) / 3) * density : 0;
  const width = Math.max(contourWidth, wireframe ? density : 0);
  const bounds = getPictureProjectivePaintBounds(geometry, sourceBounds, width);
  const rasterWidth = bounds.right - bounds.left,
    rasterHeight = bounds.bottom - bounds.top;
  if (rasterWidth > MAX_SIDE || rasterHeight > MAX_SIDE || rasterWidth * rasterHeight > MAX_PIXELS)
    throw new RangeError("Picture projected raster exceeds the 4096-side/4MP rendering budget.");
  const depthColor = format
    ? resolvePictureColor(format.depthColor, theme)
    : ([0, 0, 0] as PictureRgb);
  const contourColor = format
    ? resolvePictureColor(format.contourColor, theme)
    : ([0, 0, 0] as PictureRgb);
  const faces = [...geometry.visibleFaces];
  if (geometry.depthPx === 0 && geometry.front.facing === "back") faces.push(geometry.front);
  const prepared = faces.map((face) => {
    const normal =
      face.facing === "back"
        ? { x: -face.normal.x, y: -face.normal.y, z: -face.normal.z }
        : face.normal;
    const lighting = resolvePictureMaterialLighting(material, normal);
    return { face, lighting, color: shadePictureMaterialColor(depthColor, lighting) };
  });
  const output = createPictureRgbaSurface(rasterWidth, rasterHeight),
    origin = { x: bounds.left, y: bounds.top };
  for (const { face, lighting, color } of prepared) {
    if (face.kind === "front" && geometry.front.inverseHomography && !wireframe)
      paintTexture(output, origin, input, geometry.front.inverseHomography, lighting);
    else if (!wireframe) {
      const box = boundsOf(face.corners);
      for (
        let y = Math.max(0, Math.floor(box.top - bounds.top));
        y < Math.min(output.height, Math.ceil(box.bottom - bounds.top));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(box.left - bounds.left));
          x < Math.min(output.width, Math.ceil(box.right - bounds.left));
          x++
        ) {
          const px = x + bounds.left,
            py = y + bounds.top;
          let coverage = 0;
          for (let dx = 0; dx < 2; dx++)
            for (let dy = 0; dy < 2; dy++)
              if (insideQuad(face, px + 0.25 + dx * 0.5, py + 0.25 + dy * 0.5)) coverage += 0.25;
          over(
            output.data,
            (y * output.width + x) * 4,
            color[0],
            color[1],
            color[2],
            coverage * lighting.alphaScale,
          );
        }
    }
    if (width > 0) {
      const box = boundsOf(face.corners),
        radius = width / 2;
      for (
        let y = Math.max(0, Math.floor(box.top - radius - 1 - bounds.top));
        y < Math.min(output.height, Math.ceil(box.bottom + radius + 1 - bounds.top));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(box.left - radius - 1 - bounds.left));
          x < Math.min(output.width, Math.ceil(box.right + radius + 1 - bounds.left));
          x++
        ) {
          const coverage = Math.max(
            0,
            Math.min(
              1,
              radius + 0.5 - edgeDistance(face, x + bounds.left + 0.5, y + bounds.top + 0.5),
            ),
          );
          over(
            output.data,
            (y * output.width + x) * 4,
            contourColor[0],
            contourColor[1],
            contourColor[2],
            coverage,
          );
        }
    }
  }
  return { surface: output, left: bounds.left, top: bounds.top };
}
