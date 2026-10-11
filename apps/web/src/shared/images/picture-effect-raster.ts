import {
  assertPictureEffectAffine,
  assertPictureEffectNumber,
  createPictureShadowAffine,
  expandPictureEffectBounds,
  getPictureReflectionBounds,
  getPictureShadowBounds,
  integerPictureEffectBounds,
  invertPictureEffectAffine,
  pictureEffectBlurSupport,
  type PictureEffectAffine,
  type PictureEffectBounds,
  type PictureShadowGeometry,
} from "./picture-effect-geometry";

/** Straight RGBA8 at the public boundary; all filtering/interpolation uses
 * premultiplied colors. Inputs are never changed, even for zero-radius effects. */
export type PictureRgbaSurface = { width: number; height: number; data: Uint8ClampedArray };
export type PictureAlphaMask = { width: number; height: number; data: Float32Array };
export type PictureRasterLayer = { surface: PictureRgbaSurface; left: number; top: number };
export type PictureEffectColor = readonly [number, number, number];
export const PICTURE_RASTER_LIMITS = {
  side: 4096,
  pixels: 16_777_216,
  /** Inputs plus outputs plus simultaneous typed-array scratch, per operation.
   * Callers must additionally bound their aggregate cache/scene lifetime. */
  operationBytes: 268_435_456,
  glowOrSoftEdgeRadius: 2048,
} as const;

function pixelCount(width: number, height: number): number {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > PICTURE_RASTER_LIMITS.side ||
    height > PICTURE_RASTER_LIMITS.side ||
    width * height > PICTURE_RASTER_LIMITS.pixels
  )
    throw new RangeError(
      "Picture raster dimensions exceed the positive integer 4096-side/16MP budget.",
    );
  return width * height;
}
function budget(...bytes: number[]): void {
  const total = bytes.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || total > PICTURE_RASTER_LIMITS.operationBytes)
    throw new RangeError(
      "Picture raster simultaneous buffer budget exceeded; render at a lower density.",
    );
}
function surfaceCount(surface: PictureRgbaSurface): number {
  const count = pixelCount(surface.width, surface.height);
  if (!(surface.data instanceof Uint8ClampedArray) || surface.data.length !== count * 4)
    throw new TypeError("Picture surface requires an exact-length RGBA8 Uint8ClampedArray.");
  return count;
}
function maskCount(mask: PictureAlphaMask): number {
  const count = pixelCount(mask.width, mask.height);
  if (!(mask.data instanceof Float32Array) || mask.data.length !== count)
    throw new TypeError("Picture alpha mask requires an exact-length Float32Array.");
  return count;
}
function validateMaskValues(mask: PictureAlphaMask): void {
  for (let index = 0; index < mask.data.length; index++) {
    const value = mask.data[index]!;
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError("Picture alpha mask values must be finite fractions.");
  }
}
function colorCheck(color: PictureEffectColor): void {
  if (!Array.isArray(color) || color.length !== 3)
    throw new TypeError("Picture effect color requires RGB channels.");
  for (const channel of color) assertPictureEffectNumber(channel, "color channel", 0, 255);
}
function opacityCheck(opacity: number): void {
  assertPictureEffectNumber(opacity, "opacity", 0, 1);
}
function localBounds(width: number, height: number): PictureEffectBounds {
  return { left: 0, top: 0, right: width, bottom: height };
}
function boundsSize(bounds: PictureEffectBounds): {
  bounds: PictureEffectBounds;
  width: number;
  height: number;
  count: number;
} {
  const rounded = integerPictureEffectBounds(bounds);
  const width = rounded.right - rounded.left,
    height = rounded.bottom - rounded.top;
  return { bounds: rounded, width, height, count: pixelCount(width, height) };
}

export function createPictureRgbaSurface(width: number, height: number): PictureRgbaSurface {
  const count = pixelCount(width, height);
  budget(count * 4);
  return { width, height, data: new Uint8ClampedArray(count * 4) };
}
export function createPictureAlphaMask(width: number, height: number): PictureAlphaMask {
  const count = pixelCount(width, height);
  budget(count * 4);
  return { width, height, data: new Float32Array(count) };
}
export function pictureAlphaMaskFromSurface(surface: PictureRgbaSurface): PictureAlphaMask {
  const count = surfaceCount(surface);
  budget(count * 8);
  const data = new Float32Array(count);
  for (let index = 0; index < count; index++) data[index] = surface.data[index * 4 + 3]! / 255;
  return { width: surface.width, height: surface.height, data };
}

/** Integer-offset source-over. Fractional placement belongs in resampling,
 * keeping a single, explicit reconstruction step in the caller's render plan. */
export function compositePictureSourceOver(
  destination: PictureRgbaSurface,
  source: PictureRgbaSurface,
  left = 0,
  top = 0,
  opacity = 1,
): PictureRgbaSurface {
  const destinationCount = surfaceCount(destination),
    sourceCount = surfaceCount(source);
  opacityCheck(opacity);
  assertPictureEffectNumber(left, "composite left", -10_000_000, 10_000_000);
  assertPictureEffectNumber(top, "composite top", -10_000_000, 10_000_000);
  if (!Number.isInteger(left) || !Number.isInteger(top))
    throw new RangeError("Picture source-over offsets must be integers.");
  budget(destinationCount * 8, sourceCount * 4);
  const data = new Uint8ClampedArray(destination.data);
  const x0 = Math.max(0, left),
    y0 = Math.max(0, top);
  const x1 = Math.min(destination.width, left + source.width),
    y1 = Math.min(destination.height, top + source.height);
  if (opacity !== 0)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const target = (y * destination.width + x) * 4;
        const input = ((y - top) * source.width + x - left) * 4;
        const sa = (source.data[input + 3]! / 255) * opacity;
        const da = destination.data[target + 3]! / 255;
        const alpha = sa + da * (1 - sa);
        for (let channel = 0; channel < 3; channel++)
          data[target + channel] =
            alpha === 0
              ? 0
              : (source.data[input + channel]! * sa +
                  destination.data[target + channel]! * da * (1 - sa)) /
                alpha;
        data[target + 3] = alpha * 255;
      }
  return { width: destination.width, height: destination.height, data };
}

/** Sliding box convolution, O(pixels), with a constant mathematical exterior.
 * Loop count never grows with radius; the initial window is bounded by256. */
function boxAxis(
  input: Float32Array,
  output: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
  exterior: number,
): void {
  const length = horizontal ? width : height,
    lines = horizontal ? height : width;
  const step = horizontal ? 1 : width,
    divisor = radius * 2 + 1;
  for (let line = 0; line < lines; line++) {
    const origin = horizontal ? line * width : line;
    const insideWindow = Math.min(radius + 1, length);
    let sum = (radius + radius + 1 - insideWindow) * exterior;
    for (let index = 0; index < insideWindow; index++) sum += input[origin + index * step]!;
    for (let position = 0; position < length; position++) {
      output[origin + position * step] = Math.max(0, Math.min(1, sum / divisor));
      const remove = position - radius,
        add = position + radius + 1;
      sum +=
        (add < length ? input[origin + add * step]! : exterior) -
        (remove >= 0 ? input[origin + remove * step]! : exterior);
    }
  }
}
function gaussianAxis(
  input: Float32Array,
  output: Float32Array,
  width: number,
  height: number,
  radius: number,
  sigma: number,
  horizontal: boolean,
  exterior: number,
): void {
  const weights = new Float64Array(radius * 2 + 1);
  let weightSum = 0;
  for (let offset = -radius; offset <= radius; offset++) {
    const weight = offset === 0 ? 1 : Math.exp((-offset * offset) / (2 * sigma * sigma));
    weights[offset + radius] = weight;
    weightSum += weight;
  }
  for (let index = 0; index < weights.length; index++) weights[index] = weights[index]! / weightSum;
  const length = horizontal ? width : height,
    lines = horizontal ? height : width;
  const step = horizontal ? 1 : width;
  for (let line = 0; line < lines; line++) {
    const origin = horizontal ? line * width : line;
    for (let position = 0; position < length; position++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sample = position + offset;
        sum +=
          (sample >= 0 && sample < length ? input[origin + sample * step]! : exterior) *
          weights[offset + radius]!;
      }
      output[origin + position * step] = Math.max(0, Math.min(1, sum));
    }
  }
}
/** Both buffers belong only to this invocation. Support is exactly ceil(radius).
 * For support<=3 use Gaussian sigma=radius/3. Larger kernels are a fixed
 * three-box Gaussian approximation, split so summed support equals the declared
 * radius (asymptotic sigma=radius/3). There is no hidden infinite filter halo. */
function blurBuffers(
  first: Float32Array,
  scratch: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
  exterior: number,
): void {
  const support = pictureEffectBlurSupport(radiusPx);
  if (support === 0) return;
  if (support <= 3) {
    gaussianAxis(first, scratch, width, height, support, radiusPx / 3, true, exterior);
    gaussianAxis(scratch, first, width, height, support, radiusPx / 3, false, exterior);
  } else {
    for (let pass = 0; pass < 3; pass++) {
      const radius = Math.floor(support / 3) + (pass < support % 3 ? 1 : 0);
      boxAxis(first, scratch, width, height, radius, true, exterior);
      boxAxis(scratch, first, width, height, radius, false, exterior);
    }
  }
}

/** Blur keeps the supplied bounds. Caller supplies the declared support halo
 * before filtering; this makes tiling/pane clipping an explicit responsibility. */
export function blurPictureAlphaMask(
  mask: PictureAlphaMask,
  radiusPx: number,
  outsideAlpha = 0,
): PictureAlphaMask {
  const count = maskCount(mask);
  const support = pictureEffectBlurSupport(radiusPx);
  opacityCheck(outsideAlpha);
  budget(count * (support === 0 ? 8 : 12), 56);
  validateMaskValues(mask);
  const data = new Float32Array(mask.data);
  if (support > 0)
    blurBuffers(data, new Float32Array(count), mask.width, mask.height, radiusPx, outsideAlpha);
  return { width: mask.width, height: mask.height, data };
}

export function blurPictureRgbaSurface(
  surface: PictureRgbaSurface,
  radiusPx: number,
): PictureRgbaSurface {
  const count = surfaceCount(surface),
    support = pictureEffectBlurSupport(radiusPx);
  budget(count * (support === 0 ? 8 : 20), 112);
  const data = new Uint8ClampedArray(surface.data.length);
  if (support === 0) {
    data.set(surface.data);
    return { width: surface.width, height: surface.height, data };
  }
  const first = new Float32Array(count),
    scratch = new Float32Array(count),
    blurredAlpha = new Float32Array(count);
  for (let index = 0; index < count; index++) first[index] = surface.data[index * 4 + 3]! / 255;
  blurBuffers(first, scratch, surface.width, surface.height, radiusPx, 0);
  // Preserve unquantized alpha for unpremultiplication. Dividing by RGBA8's
  // rounded alpha can darken or brighten the lowest-alpha reconstruction fringe.
  blurredAlpha.set(first);
  for (let index = 0; index < count; index++) data[index * 4 + 3] = first[index]! * 255;
  for (let channel = 0; channel < 3; channel++) {
    for (let index = 0; index < count; index++)
      first[index] =
        (surface.data[index * 4 + channel]! / 255) * (surface.data[index * 4 + 3]! / 255);
    blurBuffers(first, scratch, surface.width, surface.height, radiusPx, 0);
    for (let index = 0; index < count; index++) {
      const alpha = blurredAlpha[index]!;
      data[index * 4 + channel] =
        data[index * 4 + 3] === 0 || alpha === 0 ? 0 : (first[index]! / alpha) * 255;
    }
  }
  return { width: surface.width, height: surface.height, data };
}

function sampleMask(mask: PictureAlphaMask, x: number, y: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    tx = x - x0,
    ty = y - y0;
  let value = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const sx = x0 + dx,
        sy = y0 + dy;
      if (sx >= 0 && sx < mask.width && sy >= 0 && sy < mask.height)
        value +=
          mask.data[sy * mask.width + sx]! * (dx === 0 ? 1 - tx : tx) * (dy === 0 ? 1 - ty : ty);
    }
  return value;
}

/** Explicit output bounds and inverse affine, pixel-center bilinear sampling.
 * A singular map produces an empty mask; no unsafe inverse or divide-by-zero. */
export function resamplePictureAlphaMask(
  mask: PictureAlphaMask,
  affine: PictureEffectAffine,
  bounds: PictureEffectBounds,
): PictureAlphaMask {
  const sourceCount = maskCount(mask);
  assertPictureEffectAffine(affine);
  const inverse = invertPictureEffectAffine(affine),
    size = boundsSize(bounds);
  budget(sourceCount * 4, size.count * 4);
  validateMaskValues(mask);
  const data = new Float32Array(size.count);
  if (inverse)
    for (let y = 0; y < size.height; y++)
      for (let x = 0; x < size.width; x++) {
        const px = size.bounds.left + x + 0.5,
          py = size.bounds.top + y + 0.5;
        data[y * size.width + x] = sampleMask(
          mask,
          inverse.a * px + inverse.c * py + inverse.e - 0.5,
          inverse.b * px + inverse.d * py + inverse.f - 0.5,
        );
      }
  return { width: size.width, height: size.height, data };
}

function colorizeMaskUnchecked(
  mask: PictureAlphaMask,
  color: PictureEffectColor,
  opacity: number,
): PictureRgbaSurface {
  const data = new Uint8ClampedArray(mask.data.length * 4);
  for (let index = 0; index < mask.data.length; index++) {
    const alpha = mask.data[index]! * opacity;
    data[index * 4 + 3] = alpha * 255;
    if (data[index * 4 + 3] !== 0) {
      data[index * 4] = color[0];
      data[index * 4 + 1] = color[1];
      data[index * 4 + 2] = color[2];
    }
  }
  return { width: mask.width, height: mask.height, data };
}
export function colorizePictureAlphaMask(
  mask: PictureAlphaMask,
  color: PictureEffectColor,
  opacity = 1,
): PictureRgbaSurface {
  const count = maskCount(mask);
  colorCheck(color);
  opacityCheck(opacity);
  budget(count * 8);
  validateMaskValues(mask);
  return colorizeMaskUnchecked(mask, color, opacity);
}

export type PictureShadowRasterOptions = PictureShadowGeometry & {
  color: PictureEffectColor;
  opacity: number;
};
export function createPictureShadowLayer(
  mask: PictureAlphaMask,
  options: PictureShadowRasterOptions,
): PictureRasterLayer | null {
  const count = maskCount(mask);
  colorCheck(options.color);
  opacityCheck(options.opacity);
  const sourceBounds = localBounds(mask.width, mask.height);
  const affine = createPictureShadowAffine(sourceBounds, options);
  const visualBounds = getPictureShadowBounds(sourceBounds, options);
  if (!visualBounds || options.opacity === 0) {
    validateMaskValues(mask);
    return null;
  }
  // Inner complement must include a halo whose mathematical exterior is ONE.
  const targetBounds =
    options.kind === "inner"
      ? expandPictureEffectBounds(sourceBounds, pictureEffectBlurSupport(options.blurRadiusPx))
      : visualBounds;
  const size = boundsSize(targetBounds);
  // Original mask, transformed mask, blur copy/scratch, final RGBA/inner mask.
  budget(count * 8, size.count * 16, 56);
  const transformed = resamplePictureAlphaMask(mask, affine, size.bounds);
  if (options.kind === "inner")
    for (let index = 0; index < transformed.data.length; index++)
      transformed.data[index] = 1 - transformed.data[index]!;
  const blurred = blurPictureAlphaMask(
    transformed,
    options.blurRadiusPx,
    options.kind === "inner" ? 1 : 0,
  );
  if (options.kind !== "inner")
    return {
      surface: colorizeMaskUnchecked(blurred, options.color, options.opacity),
      left: size.bounds.left,
      top: size.bounds.top,
    };
  const clipped = createPictureAlphaMask(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const source = (y - size.bounds.top) * size.width + x - size.bounds.left;
      clipped.data[y * mask.width + x] = mask.data[y * mask.width + x]! * blurred.data[source]!;
    }
  return {
    surface: colorizeMaskUnchecked(clipped, options.color, options.opacity),
    left: 0,
    top: 0,
  };
}

/** Writes one bilinearly interpolated premultiplied pixel without per-pixel
 * arrays/objects. outIndex is a byte offset in a straight RGBA8 destination. */
function sampleSurfaceInto(
  surface: PictureRgbaSurface,
  x: number,
  y: number,
  output: Uint8ClampedArray,
  outIndex: number,
  opacity: number,
): void {
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    tx = x - x0,
    ty = y - y0;
  let alpha = 0,
    red = 0,
    green = 0,
    blue = 0;
  for (let dy = 0; dy < 2; dy++)
    for (let dx = 0; dx < 2; dx++) {
      const sx = x0 + dx,
        sy = y0 + dy;
      if (sx < 0 || sx >= surface.width || sy < 0 || sy >= surface.height) continue;
      const index = (sy * surface.width + sx) * 4;
      const weight =
        ((dx === 0 ? 1 - tx : tx) * (dy === 0 ? 1 - ty : ty) * surface.data[index + 3]!) / 255;
      alpha += weight;
      red += surface.data[index]! * weight;
      green += surface.data[index + 1]! * weight;
      blue += surface.data[index + 2]! * weight;
    }
  output[outIndex + 3] = alpha * opacity * 255;
  if (output[outIndex + 3] !== 0 && alpha > 0) {
    output[outIndex] = red / alpha;
    output[outIndex + 1] = green / alpha;
    output[outIndex + 2] = blue / alpha;
  }
}
export function resamplePictureRgbaSurface(
  surface: PictureRgbaSurface,
  affine: PictureEffectAffine,
  bounds: PictureEffectBounds,
): PictureRgbaSurface {
  const count = surfaceCount(surface);
  assertPictureEffectAffine(affine);
  const inverse = invertPictureEffectAffine(affine),
    size = boundsSize(bounds);
  budget(count * 4, size.count * 4);
  const data = new Uint8ClampedArray(size.count * 4);
  if (inverse)
    for (let y = 0; y < size.height; y++)
      for (let x = 0; x < size.width; x++) {
        const px = size.bounds.left + x + 0.5,
          py = size.bounds.top + y + 0.5;
        sampleSurfaceInto(
          surface,
          inverse.a * px + inverse.c * py + inverse.e - 0.5,
          inverse.b * px + inverse.d * py + inverse.f - 0.5,
          data,
          (y * size.width + x) * 4,
          1,
        );
      }
  return { width: size.width, height: size.height, data };
}

export type PictureReflectionRasterOptions = {
  coverage: number;
  opacity: number;
  gapPx: number;
  blurRadiusPx: number;
};
export function createPictureReflectionLayer(
  surface: PictureRgbaSurface,
  options: PictureReflectionRasterOptions,
): PictureRasterLayer | null {
  const count = surfaceCount(surface);
  opacityCheck(options.opacity);
  const bounds = getPictureReflectionBounds(
    localBounds(surface.width, surface.height),
    options.coverage,
    options.gapPx,
    options.blurRadiusPx,
  );
  if (!bounds || options.opacity === 0) return null;
  const size = boundsSize(bounds);
  budget(count * 4, size.count * (options.blurRadiusPx === 0 ? 4 : 20), 112);
  const reflected = createPictureRgbaSurface(size.width, size.height);
  const baseline = surface.height + options.gapPx,
    reflectionHeight = options.coverage * surface.height;
  for (let y = 0; y < size.height; y++) {
    const pixelTop = size.bounds.top + y;
    const overlapTop = Math.max(pixelTop, baseline),
      overlapBottom = Math.min(pixelTop + 1, baseline + reflectionHeight);
    if (overlapBottom <= overlapTop) continue;
    const center = (overlapTop + overlapBottom) / 2;
    const progress = (center - baseline) / reflectionHeight;
    const alpha = options.opacity * (1 - progress) ** 2 * (overlapBottom - overlapTop);
    const sy = surface.height - (center - baseline) - 0.5;
    for (let x = 0; x < size.width; x++)
      sampleSurfaceInto(
        surface,
        size.bounds.left + x,
        sy,
        reflected.data,
        (y * size.width + x) * 4,
        alpha,
      );
  }
  return {
    surface:
      options.blurRadiusPx === 0
        ? reflected
        : blurPictureRgbaSurface(reflected, options.blurRadiusPx),
    left: size.bounds.left,
    top: size.bounds.top,
  };
}

/** Exact separable squared Euclidean transform of a binary support. Inward
 * distances include virtual transparent pixels just outside every surface side.
 * Support threshold is alpha>=1/255; RGB/luminance never defines the silhouette. */
function squaredDistances(mask: PictureAlphaMask, toSupport: boolean): Float32Array {
  const width = mask.width,
    height = mask.height,
    count = width * height;
  const distances = new Float32Array(count),
    scratch = new Float32Array(count);
  const length = Math.max(width, height);
  const sites = new Int32Array(length),
    cuts = new Float64Array(length + 1),
    values = new Float64Array(length);
  // Larger than any possible in-budget squared image distance, yet finite.
  const infinity = 1e12;
  for (let index = 0; index < count; index++) {
    const supported = mask.data[index]! >= 1 / 255;
    distances[index] = supported === toSupport ? 0 : infinity;
  }
  function transform(
    input: Float32Array,
    output: Float32Array,
    lines: number,
    lineLength: number,
    horizontal: boolean,
  ): void {
    const step = horizontal ? 1 : width;
    for (let line = 0; line < lines; line++) {
      const origin = horizontal ? line * width : line;
      for (let position = 0; position < lineLength; position++)
        values[position] = input[origin + position * step]!;
      let envelope = 0;
      sites[0] = 0;
      cuts[0] = -Infinity;
      cuts[1] = Infinity;
      for (let position = 1; position < lineLength; position++) {
        let intersection = 0;
        while (true) {
          const previous = sites[envelope]!;
          intersection =
            (values[position]! + position * position - (values[previous]! + previous * previous)) /
            (2 * (position - previous));
          if (intersection > cuts[envelope]! || envelope === 0) break;
          envelope--;
        }
        envelope++;
        sites[envelope] = position;
        cuts[envelope] = intersection;
        cuts[envelope + 1] = Infinity;
      }
      envelope = 0;
      for (let position = 0; position < lineLength; position++) {
        while (cuts[envelope + 1]! < position) envelope++;
        const site = sites[envelope]!;
        output[origin + position * step] = (position - site) ** 2 + values[site]!;
      }
    }
  }
  transform(distances, scratch, height, width, true);
  transform(scratch, distances, width, height, false);
  if (!toSupport)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const exterior = Math.min(x + 1, width - x, y + 1, height - y);
        const index = y * width + x;
        distances[index] = Math.min(distances[index]!, exterior * exterior);
      }
  return distances;
}
function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}
function distanceScratchBytes(width: number, height: number): number {
  return width * height * 8 + Math.max(width, height) * 20 + 8;
}

export type PictureGlowRasterOptions = {
  color: PictureEffectColor;
  opacity: number;
  radiusPx: number;
};
export function createPictureGlowLayer(
  mask: PictureAlphaMask,
  options: PictureGlowRasterOptions,
): PictureRasterLayer | null {
  const count = maskCount(mask);
  colorCheck(options.color);
  opacityCheck(options.opacity);
  assertPictureEffectNumber(
    options.radiusPx,
    "glow radius",
    0,
    PICTURE_RASTER_LIMITS.glowOrSoftEdgeRadius,
  );
  if (options.radiusPx === 0 || options.opacity === 0) {
    validateMaskValues(mask);
    return null;
  }
  const size = boundsSize(
    expandPictureEffectBounds(localBounds(mask.width, mask.height), Math.ceil(options.radiusPx)),
  );
  budget(count * 4, size.count * 8, distanceScratchBytes(size.width, size.height));
  validateMaskValues(mask);
  const expanded = createPictureAlphaMask(size.width, size.height);
  for (let y = 0; y < mask.height; y++)
    expanded.data.set(
      mask.data.subarray(y * mask.width, (y + 1) * mask.width),
      (y - size.bounds.top) * size.width - size.bounds.left,
    );
  const distances = squaredDistances(expanded, true);
  // Reuse the expanded mask after the distance pass; no retained scratch buffers.
  for (let index = 0; index < size.count; index++) {
    const distance = Math.sqrt(distances[index]!);
    expanded.data[index] =
      distance >= options.radiusPx
        ? 0
        : (1 - expanded.data[index]!) * (1 - smoothStep(distance / options.radiusPx));
  }
  return {
    surface: colorizeMaskUnchecked(expanded, options.color, options.opacity),
    left: size.bounds.left,
    top: size.bounds.top,
  };
}

export function softenPictureEdges(
  surface: PictureRgbaSurface,
  radiusPx: number,
): PictureRgbaSurface {
  const count = surfaceCount(surface);
  assertPictureEffectNumber(
    radiusPx,
    "soft edge radius",
    0,
    PICTURE_RASTER_LIMITS.glowOrSoftEdgeRadius,
  );
  budget(
    count * (radiusPx === 0 ? 8 : 12),
    radiusPx === 0 ? 0 : distanceScratchBytes(surface.width, surface.height),
  );
  const data = new Uint8ClampedArray(surface.data);
  if (radiusPx === 0) return { width: surface.width, height: surface.height, data };
  const mask = pictureAlphaMaskFromSurface(surface),
    distances = squaredDistances(mask, false);
  for (let index = 0; index < count; index++) {
    // Edge-support pixels have zero feather weight, including source holes.
    const inward = Math.max(0, Math.sqrt(distances[index]!) - 1);
    const multiplier = smoothStep(Math.min(1, inward / radiusPx));
    data[index * 4 + 3] = surface.data[index * 4 + 3]! * multiplier;
    if (data[index * 4 + 3] === 0) data.fill(0, index * 4, index * 4 + 3);
  }
  return { width: surface.width, height: surface.height, data };
}

export type PictureResolvedPaintStop = {
  offset: number;
  color: PictureEffectColor;
  opacity: number;
  brightness: number;
};
export type PictureResolvedGradient = {
  stops: readonly PictureResolvedPaintStop[];
  opacity: number;
} & (
  | { kind: "linear"; angleDeg: number }
  | {
      kind: "radial" | "rectangular";
      centerX: number;
      centerY: number;
      radiusX: number;
      radiusY: number;
    }
);
function gradientCheck(gradient: PictureResolvedGradient): void {
  opacityCheck(gradient.opacity);
  if (!Array.isArray(gradient.stops) || gradient.stops.length < 2 || gradient.stops.length > 16)
    throw new RangeError("Picture gradient needs 2–16 ordered stops.");
  let previous = -Infinity;
  for (const stop of gradient.stops) {
    assertPictureEffectNumber(stop.offset, "gradient stop offset", 0, 1);
    if (stop.offset < previous)
      throw new RangeError("Picture gradient stops must be nondecreasing.");
    previous = stop.offset;
    colorCheck(stop.color);
    opacityCheck(stop.opacity);
    assertPictureEffectNumber(stop.brightness, "stop brightness", -1, 1);
  }
  if (gradient.kind === "linear")
    assertPictureEffectNumber(gradient.angleDeg, "gradient angle", -3600, 3600);
  else if (gradient.kind === "radial" || gradient.kind === "rectangular") {
    assertPictureEffectNumber(gradient.centerX, "gradient center X", 0, 1);
    assertPictureEffectNumber(gradient.centerY, "gradient center Y", 0, 1);
    assertPictureEffectNumber(gradient.radiusX, "gradient radius X", Number.MIN_VALUE, 16);
    assertPictureEffectNumber(gradient.radiusY, "gradient radius Y", Number.MIN_VALUE, 16);
  } else throw new TypeError("Unknown picture gradient geometry.");
}
function brightnessChannel(channel: number, brightness: number): number {
  return brightness >= 0 ? channel + (255 - channel) * brightness : channel * (1 + brightness);
}
function gradientPixel(
  gradient: PictureResolvedGradient,
  position: number,
  output: Uint8ClampedArray,
  offset: number,
): void {
  const stops = gradient.stops,
    t = Math.max(0, Math.min(1, position));
  // Right-continuous hard steps: the LAST coincident stop wins at its offset.
  let next = 0;
  while (next < stops.length && stops[next]!.offset <= t) next++;
  const first = stops[Math.max(0, next - 1)]!,
    last = stops[Math.min(stops.length - 1, next)]!;
  const mix =
    first === last || last.offset === first.offset
      ? 0
      : (t - first.offset) / (last.offset - first.offset);
  const alpha = (first.opacity * (1 - mix) + last.opacity * mix) * gradient.opacity;
  output[offset + 3] = alpha * 255;
  if (output[offset + 3] === 0) {
    output.fill(0, offset, offset + 3);
    return;
  }
  const stopAlpha = first.opacity * (1 - mix) + last.opacity * mix;
  for (let channel = 0; channel < 3; channel++)
    output[offset + channel] =
      (brightnessChannel(first.color[channel]!, first.brightness) * first.opacity * (1 - mix) +
        brightnessChannel(last.color[channel]!, last.brightness) * last.opacity * mix) /
      stopAlpha;
}

/** Convenience sample boundary; raster fill validates once, without allocation
 * or validation per pixel. Brightness is a signed white/black tint of stop RGB. */
export function samplePictureGradient(
  gradient: PictureResolvedGradient,
  position: number,
): readonly [number, number, number, number] {
  gradientCheck(gradient);
  assertPictureEffectNumber(position, "gradient position", -10_000_000, 10_000_000);
  const pixel = new Uint8ClampedArray(4);
  gradientPixel(gradient, position, pixel, 0);
  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
}

export function fillPictureSolidSurface(
  width: number,
  height: number,
  color: PictureEffectColor,
  opacity = 1,
): PictureRgbaSurface {
  const count = pixelCount(width, height);
  colorCheck(color);
  opacityCheck(opacity);
  budget(count * 4);
  const surface = createPictureRgbaSurface(width, height);
  const alpha = Math.round(opacity * 255);
  if (alpha > 0)
    for (let index = 0; index < count; index++) {
      surface.data[index * 4] = color[0];
      surface.data[index * 4 + 1] = color[1];
      surface.data[index * 4 + 2] = color[2];
      surface.data[index * 4 + 3] = alpha;
    }
  return surface;
}

/** Optional coordinate affine maps raster pixel centers to paint coordinates
 * in the SAME width/height frame. The caller can supply an inverse outer2D
 * transform for a world-fixed gradient; no rotate-with-shape flag is ignored. */
export function fillPictureGradientSurface(
  width: number,
  height: number,
  gradient: PictureResolvedGradient,
  coordinateAffine?: PictureEffectAffine,
): PictureRgbaSurface {
  const count = pixelCount(width, height);
  gradientCheck(gradient);
  if (coordinateAffine) assertPictureEffectAffine(coordinateAffine);
  budget(count * 4);
  const surface = createPictureRgbaSurface(width, height);
  const linear = gradient.kind === "linear";
  const radians = linear ? (gradient.angleDeg * Math.PI) / 180 : 0;
  const dx = Math.cos(radians),
    dy = Math.sin(radians);
  const extent = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let px = x + 0.5,
        py = y + 0.5;
      if (coordinateAffine) {
        const mappedX = coordinateAffine.a * px + coordinateAffine.c * py + coordinateAffine.e;
        py = coordinateAffine.b * px + coordinateAffine.d * py + coordinateAffine.f;
        px = mappedX;
      }
      let position: number;
      if (gradient.kind === "linear")
        position = 0.5 + ((px - width / 2) * dx + (py - height / 2) * dy) / (2 * extent);
      else {
        const nx = (px / width - gradient.centerX) / gradient.radiusX;
        const ny = (py / height - gradient.centerY) / gradient.radiusY;
        position =
          gradient.kind === "radial" ? Math.hypot(nx, ny) : Math.max(Math.abs(nx), Math.abs(ny));
      }
      gradientPixel(gradient, position, surface.data, (y * width + x) * 4);
    }
  return surface;
}
