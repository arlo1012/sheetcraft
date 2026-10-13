import type { PictureFormat3d } from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { PictureShapeSourceProfile } from "./picture-shape-mask";
import type { ShapePresetGeometry } from "@sheetcraft/core/shape-presets";
import {
  createPictureRgbaSurface,
  PICTURE_RASTER_LIMITS,
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
import {
  createPictureShapeExtrusion,
  PICTURE_SHAPE_EXTRUSION_LIMITS,
  type PictureShapeExtrusion,
  type PictureShapeProjectedEdge,
} from "./picture-shape-extrusion";

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
function projectedPaintBounds(
  geometry: PictureProjectiveGeometry,
  sourceBounds: PictureProjectiveBounds,
  contourWidthPx: number,
  solidBounds: PictureProjectiveBounds,
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
    left: Math.floor(Math.min(projected.left, solidBounds.left) - margin),
    top: Math.floor(Math.min(projected.top, solidBounds.top) - margin),
    right: Math.ceil(Math.max(projected.right, solidBounds.right) + margin),
    bottom: Math.ceil(Math.max(projected.bottom, solidBounds.bottom) + margin),
  };
  checkBounds(result);
  return result;
}

/** Pure shape calls also validate final-density curves, topology, pixel/edge
 * work and typed-buffer sizes BEFORE any asset decoding or Canvas callbacks. */
export function getPictureProjectivePaintBounds(
  geometry: PictureProjectiveGeometry,
  sourceBounds: PictureProjectiveBounds,
  contourWidthPx = 0,
  shapeGeometry?: ShapePresetGeometry,
  density = 1,
  shapeSource?: PictureShapeSourceProfile,
): PictureProjectiveBounds {
  return shapeGeometry
    ? preflightPictureShapeProjectiveRaster(
        geometry,
        sourceBounds,
        contourWidthPx,
        shapeGeometry,
        density,
        shapeSource,
      ).bounds
    : projectedPaintBounds(geometry, sourceBounds, contourWidthPx, geometry.visualBounds);
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
  scene = false,
  depthTest?: Readonly<{
    visible: (x: number, y: number, index: number) => boolean;
    opaque: (x: number, y: number, index: number) => void;
  }>,
): void {
  const source = input.surface,
    pixels = source.data;
  for (let y = 0; y < output.height; y++)
    for (let x = 0; x < output.width; x++) {
      const px = x + origin.x + 0.5,
        py = y + origin.y + 0.5;
      const w = inverse[6] * px + inverse[7] * py + inverse[8];
      if (!Number.isFinite(w) || (scene ? w <= 0 : Math.abs(w) < 1e-12)) continue;
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
      const sourceX = sx + input.left + 0.5,
        sourceY = sy + input.top + 0.5;
      const destination = y * output.width + x;
      if (depthTest && !depthTest.visible(sourceX, sourceY, destination)) continue;
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
      if (depthTest && alpha * lighting.alphaScale >= 1 - 1e-10)
        depthTest.opaque(sourceX, sourceY, destination);
    }
}

export type PictureProjectiveRasterOptions = Readonly<{
  geometry: PictureProjectiveGeometry;
  input: PictureRasterLayer;
  theme: WorkbookTheme;
  format?: PictureFormat3d;
  /** Output pixels per CSS pixel, for canonical point lengths. */
  density: number;
  /** Evaluated logical-pixel geometry. Never a preset name/XML or a layout bbox. */
  shapeGeometry?: ShapePresetGeometry;
  shapeSource?: PictureShapeSourceProfile;
}>;

function coordinates(
  inverse: PictureProjectiveHomography,
  x: number,
  y: number,
  scene = false,
): PictureProjectivePoint | undefined {
  const w = inverse[6] * x + inverse[7] * y + inverse[8];
  if (!Number.isFinite(w) || (scene ? w <= 0 : Math.abs(w) < 1e-12)) return undefined;
  const px = (inverse[0] * x + inverse[1] * y + inverse[2]) / w;
  const py = (inverse[3] * x + inverse[4] * y + inverse[5]) / w;
  return Number.isFinite(px) && Number.isFinite(py) ? { x: px, y: py } : undefined;
}
function edgeBox(edge: PictureShapeProjectedEdge, margin: number): PictureProjectiveBounds {
  return {
    left: Math.min(edge.a.x, edge.b.x) - margin,
    top: Math.min(edge.a.y, edge.b.y) - margin,
    right: Math.max(edge.a.x, edge.b.x) + margin,
    bottom: Math.max(edge.a.y, edge.b.y) + margin,
  };
}
function clippedArea(box: PictureProjectiveBounds, bounds: PictureProjectiveBounds): number {
  return (
    Math.max(
      0,
      Math.min(bounds.right, Math.ceil(box.right)) - Math.max(bounds.left, Math.floor(box.left)),
    ) *
    Math.max(
      0,
      Math.min(bounds.bottom, Math.ceil(box.bottom)) - Math.max(bounds.top, Math.floor(box.top)),
    )
  );
}
function shapeRasterWork(
  shape: PictureShapeExtrusion,
  bounds: PictureProjectiveBounds,
  width: number,
): void {
  let work = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
  for (const side of shape.sides) work += 4 * clippedArea(side.bounds, bounds);
  for (const edge of [...shape.frontStroke, ...shape.backStroke, ...shape.connectors])
    work += clippedArea(edgeBox(edge, width / 2 + 1), bounds);
  work +=
    shape.backFill.reduce(
      (sum, path) => sum + path.reduce((total, contour) => total + contour.points.length, 0),
      0,
    ) *
    (bounds.bottom - bounds.top);
  if (!Number.isSafeInteger(work) || work > PICTURE_SHAPE_EXTRUSION_LIMITS.rasterWork)
    throw new RangeError("Picture shape projection exceeds its bounded pixel/edge work budget.");
}
export type PictureShapeProjectiveRasterPreflight = Readonly<{
  bounds: PictureProjectiveBounds;
  shape: PictureShapeExtrusion;
}>;
/** The SAME numerical preflight is used by getBounds and the actual renderer.
 * Prepared extrusion is immutable and reused through its bounded geometry-only
 * cache; contour/source-window work is recalculated for every distinct request. */
export function preflightPictureShapeProjectiveRaster(
  geometry: PictureProjectiveGeometry,
  sourceBounds: PictureProjectiveBounds,
  contourWidthPx: number,
  shapeGeometry: ShapePresetGeometry,
  density = 1,
  shapeSource?: PictureShapeSourceProfile,
): PictureShapeProjectiveRasterPreflight {
  checkBounds(sourceBounds);
  if (!Number.isFinite(contourWidthPx) || contourWidthPx < 0 || contourWidthPx > 65536)
    throw new RangeError("Picture projected contour width is invalid.");
  const shape = createPictureShapeExtrusion(geometry, shapeGeometry, density, shapeSource);
  const bounds = projectedPaintBounds(geometry, sourceBounds, contourWidthPx, shape.bounds);
  const rasterWidth = bounds.right - bounds.left,
    rasterHeight = bounds.bottom - bounds.top;
  const sourceWidth = Math.ceil(sourceBounds.right - sourceBounds.left),
    sourceHeight = Math.ceil(sourceBounds.bottom - sourceBounds.top);
  if (
    rasterWidth > MAX_SIDE ||
    rasterHeight > MAX_SIDE ||
    rasterWidth * rasterHeight > MAX_PIXELS ||
    sourceWidth > MAX_SIDE ||
    sourceHeight > MAX_SIDE ||
    sourceWidth * sourceHeight > MAX_PIXELS
  )
    throw new RangeError("Picture projected raster exceeds the 4096-side/4MP rendering budget.");
  shapeRasterWork(shape, bounds, contourWidthPx);
  const bytes = sourceWidth * sourceHeight * 4 + rasterWidth * rasterHeight * 12;
  if (!Number.isSafeInteger(bytes) || bytes > PICTURE_RASTER_LIMITS.operationBytes)
    throw new RangeError("Picture shape projection exceeds its simultaneous memory budget.");
  return Object.freeze({ bounds: Object.freeze(bounds), shape });
}
function paintShapeRaster(
  options: PictureProjectiveRasterOptions,
  shape: PictureShapeExtrusion,
  bounds: PictureProjectiveBounds,
  width: number,
  material: Pick<PictureFormat3d, "material" | "lighting" | "lightingAngleDeg">,
  depthColor: PictureRgb,
  contourColor: PictureRgb,
): PictureRasterLayer {
  const { geometry, input } = options;
  const rasterWidth = bounds.right - bounds.left,
    rasterHeight = bounds.bottom - bounds.top;
  shapeRasterWork(shape, bounds, width);
  const bytes = input.surface.data.byteLength + rasterWidth * rasterHeight * 12;
  if (!Number.isSafeInteger(bytes) || bytes > PICTURE_RASTER_LIMITS.operationBytes)
    throw new RangeError("Picture shape projection exceeds its simultaneous memory budget.");
  const output = createPictureRgbaSurface(rasterWidth, rasterHeight);
  const depths = new Float64Array(rasterWidth * rasterHeight).fill(-Infinity);
  const wire = material.material === "wire-frame",
    model = geometry.sourceToWorldMatrix;
  const depthAt = (x: number, y: number, z: number) =>
    model[8] * x + model[9] * y + model[10] * z + model[11];
  const write = (x: number, y: number, depth: number, color: PictureRgb, alpha: number) => {
    const pixel = y * rasterWidth + x;
    if (alpha <= 0 || !Number.isFinite(depth) || depth < depths[pixel]! - 1e-8) return;
    depths[pixel] = depth;
    output.data[pixel * 4] = color[0];
    output.data[pixel * 4 + 1] = color[1];
    output.data[pixel * 4 + 2] = color[2];
    output.data[pixel * 4 + 3] = alpha * 255;
  };
  // A back cap is the independent nonzero-filled path union, never the frame quad.
  if (!wire && geometry.back?.facing === "front" && geometry.back.inverseHomography) {
    const lighting = resolvePictureMaterialLighting(material, geometry.back.normal);
    const color = shadePictureMaterialColor(depthColor, lighting),
      inverse = geometry.back.inverseHomography;
    for (const path of shape.backFill)
      for (let y = 0; y < rasterHeight; y++) {
        const py = bounds.top + y + 0.5,
          crossings: { x: number; delta: number }[] = [];
        for (const contour of path)
          for (let index = 0; index < contour.points.length; index++) {
            const a = contour.points[index]!,
              b = contour.points[(index + 1) % contour.points.length]!;
            if ((a.y <= py && b.y > py) || (b.y <= py && a.y > py))
              crossings.push({
                x: a.x + ((py - a.y) * (b.x - a.x)) / (b.y - a.y),
                delta: b.y > a.y ? 1 : -1,
              });
          }
        crossings.sort((a, b) => a.x - b.x);
        let winding = 0,
          previous = -Infinity;
        for (const crossing of crossings) {
          if (winding !== 0)
            for (
              let x = Math.max(0, Math.ceil(previous - bounds.left - 0.5));
              x < Math.min(rasterWidth, Math.ceil(crossing.x - bounds.left - 0.5));
              x++
            ) {
              const source = coordinates(
                inverse,
                bounds.left + x + 0.5,
                py,
                geometry.isSceneProjection,
              );
              if (source)
                write(
                  x,
                  y,
                  depthAt(source.x, source.y, -geometry.depthPx),
                  color,
                  lighting.alphaScale,
                );
            }
          winding += crossing.delta;
          previous = crossing.x;
        }
      }
  }
  if (!wire)
    for (const side of shape.sides) {
      const lighting = resolvePictureMaterialLighting(material, side.normal);
      const color = shadePictureMaterialColor(depthColor, lighting),
        box = side.bounds;
      for (
        let y = Math.max(0, Math.floor(box.top - bounds.top));
        y < Math.min(rasterHeight, Math.ceil(box.bottom - bounds.top));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(box.left - bounds.left));
          x < Math.min(rasterWidth, Math.ceil(box.right - bounds.left));
          x++
        ) {
          const px = bounds.left + x,
            py = bounds.top + y;
          let coverage = 0;
          for (let sx = 0; sx < 2; sx++)
            for (let sy = 0; sy < 2; sy++) {
              const uv = coordinates(
                side.inverse,
                px + 0.25 + sx * 0.5,
                py + 0.25 + sy * 0.5,
                geometry.isSceneProjection,
              );
              if (uv && uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1) coverage += 0.25;
            }
          const uv = coordinates(side.inverse, px + 0.5, py + 0.5, geometry.isSceneProjection);
          if (uv && coverage > 0)
            write(
              x,
              y,
              side.depthOrigin + uv.x * side.depthU + uv.y * side.depthV,
              color,
              coverage * lighting.alphaScale,
            );
        }
    }
  if (
    !wire &&
    geometry.front.inverseHomography &&
    (geometry.front.facing === "front" || geometry.depthPx === 0)
  ) {
    const normal =
      geometry.front.facing === "back"
        ? { x: -geometry.front.normal.x, y: -geometry.front.normal.y, z: -geometry.front.normal.z }
        : geometry.front.normal;
    paintTexture(
      output,
      { x: bounds.left, y: bounds.top },
      input,
      geometry.front.inverseHomography,
      resolvePictureMaterialLighting(material, normal),
      geometry.isSceneProjection,
      {
        visible: (x, y, index) => depthAt(x, y, 0) >= depths[index]! - 1e-8,
        opaque: (x, y, index) => {
          depths[index] = depthAt(x, y, 0);
        },
      },
    );
  }
  if (width > 0 && (geometry.depthPx > 0 || geometry.front.facing !== "edge-on")) {
    const edges = [...shape.frontStroke, ...shape.backStroke, ...shape.connectors],
      radius = width / 2;
    for (const edge of edges) {
      const box = edgeBox(edge, radius + 1),
        dx = edge.b.x - edge.a.x,
        dy = edge.b.y - edge.a.y,
        length = dx * dx + dy * dy;
      for (
        let y = Math.max(0, Math.floor(box.top - bounds.top));
        y < Math.min(rasterHeight, Math.ceil(box.bottom - bounds.top));
        y++
      )
        for (
          let x = Math.max(0, Math.floor(box.left - bounds.left));
          x < Math.min(rasterWidth, Math.ceil(box.right - bounds.left));
          x++
        ) {
          const px = x + bounds.left + 0.5,
            py = y + bounds.top + 0.5;
          const t =
            length > 0
              ? Math.max(0, Math.min(1, ((px - edge.a.x) * dx + (py - edge.a.y) * dy) / length))
              : 0;
          const coverage = Math.max(
            0,
            Math.min(1, radius + 0.5 - Math.hypot(px - edge.a.x - t * dx, py - edge.a.y - t * dy)),
          );
          const weight = (1 - t) / edge.a.w + t / edge.b.w;
          const depth =
            (((1 - t) * edge.a.depth) / edge.a.w + (t * edge.b.depth) / edge.b.w) / weight;
          if (wire || depth >= depths[y * rasterWidth + x]! - 1e-8)
            over(
              output.data,
              (y * rasterWidth + x) * 4,
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
  const shapePlan = options.shapeGeometry
    ? preflightPictureShapeProjectiveRaster(
        geometry,
        sourceBounds,
        width,
        options.shapeGeometry,
        density,
        options.shapeSource,
      )
    : undefined;
  const bounds =
    shapePlan?.bounds ?? getPictureProjectivePaintBounds(geometry, sourceBounds, width);
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
  if (shapePlan)
    return paintShapeRaster(
      options,
      shapePlan.shape,
      bounds,
      width,
      material,
      depthColor,
      contourColor,
    );
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
      paintTexture(
        output,
        origin,
        input,
        geometry.front.inverseHomography,
        lighting,
        geometry.isSceneProjection,
      );
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
