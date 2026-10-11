import type { PicturePatternPreset } from "@sheetcraft/core/picture-detailed-style";

export type PicturePatternTileSize = Readonly<{ width: number; height: number }>;
export type PicturePatternSamplingOptions = Readonly<{
  /** Raster pixels per native pattern unit; finite, positive, and at most 64.
   * Each tile side is rounded to whole pixels, with a minimum of one pixel. */
  scale?: number;
  /** Fixed 4 × 4 pixel-area sampling. False samples just the pixel center. */
  antialias?: boolean;
  /** Unsigned 32-bit seed for the two confetti patterns; other motifs ignore it. */
  seed?: number;
}>;
export type PicturePatternSampler = PicturePatternTileSize &
  Readonly<{
    preset: PicturePatternPreset;
    /** Foreground coverage/alpha in [0, 1]. Coordinates are safe integer raster
     * pixels; negative coordinates repeat identically. No pixel allocations. */
    sample: (x: number, y: number) => number;
  }>;

type PatternKernel = (x: number, y: number) => number;
const DEFAULT_SEED = 0x53434654;
const SQRT_HALF = Math.SQRT1_2;

/** The identifiers follow DrawingML, but these are product-owned geometries,
 * not copied Office/WPS tiles or a claim of matching their rendered pixels.
 * https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetpatternvalues
 * No colors, DOM, canvas, assets, or document state are read by this module. */
function nativeTileSize(preset: PicturePatternPreset): PicturePatternTileSize {
  switch (preset) {
    case "pct5":
    case "pct10":
    case "pct20":
    case "pct25":
    case "pct30":
    case "pct40":
    case "pct50":
    case "pct60":
    case "pct70":
    case "pct75":
    case "pct80":
    case "pct90":
      return { width: 20, height: 20 };
    case "narHorz":
    case "narVert":
    case "smCheck":
    case "smGrid":
      return { width: 4, height: 4 };
    case "horz":
    case "vert":
    case "ltHorz":
    case "ltVert":
    case "dkHorz":
    case "dkVert":
    case "cross":
    case "dnDiag":
    case "upDiag":
    case "ltDnDiag":
    case "ltUpDiag":
    case "dkDnDiag":
    case "dkUpDiag":
    case "diagCross":
    case "dotGrid":
      return { width: 8, height: 8 };
    case "dashHorz":
      return { width: 12, height: 8 };
    case "dashVert":
      return { width: 8, height: 12 };
    case "wdDnDiag":
    case "wdUpDiag":
    case "dashDnDiag":
    case "dashUpDiag":
    case "lgCheck":
    case "lgGrid":
    case "solidDmnd":
    case "openDmnd":
    case "dotDmnd":
      return { width: 12, height: 12 };
    case "horzBrick":
    case "diagBrick":
    case "sphere":
    case "weave":
    case "divot":
    case "shingle":
    case "trellis":
      return { width: 16, height: 16 };
    case "smConfetti":
    case "plaid":
      return { width: 24, height: 24 };
    case "lgConfetti":
      return { width: 32, height: 32 };
    case "wave":
    case "zigZag":
      return { width: 16, height: 8 };
    default:
      throw new TypeError("Unknown DrawingML picture pattern preset.");
  }
}

function assertScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 64)
    throw new RangeError("Picture pattern scale must be finite, positive, and at most 64.");
}

/** Rounded dimensions are also the sampler's exact raster repeat period.
 * Fractional scales do not accumulate phase drift across repeated tiles. */
export function getPicturePatternTileSize(
  preset: PicturePatternPreset,
  scale: number = 1,
): PicturePatternTileSize {
  const native = nativeTileSize(preset);
  assertScale(scale);
  return Object.freeze({
    width: Math.max(1, Math.round(native.width * scale)),
    height: Math.max(1, Math.round(native.height * scale)),
  });
}

function wrap(value: number, period: number): number {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

function periodicDistance(value: number, period: number): number {
  const phase = wrap(value, period);
  return Math.min(phase, period - phase);
}

function stripe(value: number, period: number, thickness: number): number {
  return wrap(value, period) < thickness ? 1 : 0;
}

/** An arithmetic 4 × 4 ordered dither, refined by a permutation of the 25
 * coarse cells. Its 20 × 20 tile contains each rank 0..399 exactly once. */
function densityRank(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const rank4 =
    8 * ((ix & 1) ^ (iy & 1)) +
    4 * (iy & 1) +
    2 * (((ix >> 1) & 1) ^ ((iy >> 1) & 1)) +
    ((iy >> 1) & 1);
  const coarseRank = ((Math.floor(ix / 4) + 5 * Math.floor(iy / 4)) * 7) % 25;
  return rank4 * 25 + coarseRank;
}

function hashCell(x: number, y: number, seed: number): number {
  let hash = seed ^ Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca77);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function confettiKernel(large: boolean, seed: number): PatternKernel {
  const cell = large ? 8 : 6;
  // Every rotated chip stays inside its own cell, including the outermost cells.
  const margin = large ? 3.1 : 1.8;
  return (x, y) => {
    const column = Math.floor(x / cell),
      row = Math.floor(y / cell);
    const hash = hashCell(column, row, seed);
    const cx = margin + (((hash >>> 8) & 255) / 255) * (cell - 2 * margin);
    const cy = margin + (((hash >>> 16) & 255) / 255) * (cell - 2 * margin);
    const dx = wrap(x, cell) - cx,
      dy = wrap(y, cell) - cy;
    const halfWidth = (large ? 0.95 : 0.45) + (hash & 3) * (large ? 0.15 : 0.12);
    const halfHeight = (large ? 2.2 : 1.1) + ((hash >>> 2) & 3) * 0.15;
    switch ((hash >>> 28) & 3) {
      case 0:
        return Math.abs(dx) < halfWidth && Math.abs(dy) < halfHeight ? 1 : 0;
      case 1:
        return Math.abs(dy) < halfWidth && Math.abs(dx) < halfHeight ? 1 : 0;
      case 2:
        return Math.abs((dx + dy) * SQRT_HALF) < halfWidth &&
          Math.abs((dy - dx) * SQRT_HALF) < halfHeight
          ? 1
          : 0;
      default:
        return Math.abs((dx - dy) * SQRT_HALF) < halfWidth &&
          Math.abs((dy + dx) * SQRT_HALF) < halfHeight
          ? 1
          : 0;
    }
  };
}

function brick(x: number, y: number): number {
  const row = Math.floor(y / 8);
  return wrap(y, 8) < 1.25 || wrap(x + wrap(row, 2) * 8, 16) < 1.25 ? 1 : 0;
}

function patternKernel(preset: PicturePatternPreset, seed: number): PatternKernel {
  switch (preset) {
    case "pct5":
    case "pct10":
    case "pct20":
    case "pct25":
    case "pct30":
    case "pct40":
    case "pct50":
    case "pct60":
    case "pct70":
    case "pct75":
    case "pct80":
    case "pct90": {
      const threshold = Number(preset.slice(3)) * 4;
      return (x, y) => (densityRank(x, y) < threshold ? 1 : 0);
    }
    case "horz":
      return (_x, y) => stripe(y, 8, 2);
    case "vert":
      return (x, _y) => stripe(x, 8, 2);
    case "ltHorz":
      return (_x, y) => stripe(y, 8, 1);
    case "ltVert":
      return (x, _y) => stripe(x, 8, 1);
    case "dkHorz":
      return (_x, y) => stripe(y, 8, 4);
    case "dkVert":
      return (x, _y) => stripe(x, 8, 4);
    case "narHorz":
      return (_x, y) => stripe(y, 4, 1);
    case "narVert":
      return (x, _y) => stripe(x, 4, 1);
    case "dashHorz":
      return (x, y) => stripe(y, 8, 2) * stripe(x, 12, 7);
    case "dashVert":
      return (x, y) => stripe(x, 8, 2) * stripe(y, 12, 7);
    case "cross":
      return (x, y) => Math.max(stripe(x, 8, 1.5), stripe(y, 8, 1.5));
    case "dnDiag":
      return (x, y) => stripe(y - x, 8, 2);
    case "upDiag":
      return (x, y) => stripe(y + x, 8, 2);
    case "ltDnDiag":
      return (x, y) => stripe(y - x, 8, 1);
    case "ltUpDiag":
      return (x, y) => stripe(y + x, 8, 1);
    case "dkDnDiag":
      return (x, y) => stripe(y - x, 8, 4);
    case "dkUpDiag":
      return (x, y) => stripe(y + x, 8, 4);
    case "wdDnDiag":
      return (x, y) => stripe(y - x, 12, 2);
    case "wdUpDiag":
      return (x, y) => stripe(y + x, 12, 2);
    case "dashDnDiag":
      return (x, y) => stripe(y - x, 6, 1.5) * stripe(x + y, 12, 7);
    case "dashUpDiag":
      return (x, y) => stripe(y + x, 6, 1.5) * stripe(x - y, 12, 7);
    case "diagCross":
      return (x, y) => Math.max(stripe(y - x, 8, 1), stripe(y + x, 8, 1));
    case "smCheck":
      return (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 1 : 0);
    case "lgCheck":
      return (x, y) => ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? 1 : 0);
    case "smGrid":
      return (x, y) => Math.max(stripe(x, 4, 1), stripe(y, 4, 1));
    case "lgGrid":
      return (x, y) => Math.max(stripe(x, 12, 1), stripe(y, 12, 1));
    case "dotGrid":
      return (x, y) =>
        Math.hypot(periodicDistance(x - 1, 8), periodicDistance(y - 1, 8)) < 1.15 ? 1 : 0;
    case "smConfetti":
      return confettiKernel(false, seed);
    case "lgConfetti":
      return confettiKernel(true, seed);
    case "horzBrick":
      return brick;
    case "diagBrick":
      return (x, y) => brick(x + y, y - x);
    case "solidDmnd":
      return (x, y) => (Math.abs(x - 6) + Math.abs(y - 6) < 5 ? 1 : 0);
    case "openDmnd":
      return (x, y) => (Math.abs(Math.abs(x - 6) + Math.abs(y - 6) - 5) < 0.65 ? 1 : 0);
    case "dotDmnd":
      return (x, y) => {
        // Eight round beads at the vertices and side midpoints of a rhombus.
        const nearestY = Math.round(y / 3) * 3;
        const dx = Math.abs(x - 6) - (6 - Math.abs(nearestY - 6));
        return Math.hypot(dx, y - nearestY) < 0.9 ? 1 : 0;
      };
    case "plaid":
      return (x, y) => {
        if (wrap(x, 6) < 0.65 || wrap(y, 6) < 0.65) return 1;
        const horizontal = wrap(y, 24) < 6,
          vertical = wrap(x, 24) < 6;
        return horizontal && vertical ? 0.85 : horizontal || vertical ? 0.5 : 0;
      };
    case "sphere":
      return (x, y) => {
        const dx = (x - 8) / 6,
          dy = (y - 8) / 6;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= 1) return 0;
        if (distanceSquared > 0.81) return 0.95;
        const lighting = Math.max(
          0,
          -0.35 * dx - 0.45 * dy + 0.82 * Math.sqrt(1 - distanceSquared),
        );
        return Math.max(0.15, Math.min(0.95, 0.85 - 0.65 * lighting));
      };
    case "weave":
      return (x, y) => {
        const px = wrap(x, 8),
          py = wrap(y, 8);
        const horizontal = py < 3.5,
          vertical = px < 3.5;
        if (!horizontal && !vertical) return 0;
        const horizontalOnTop =
          horizontal && (!vertical || (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0);
        const across = horizontalOnTop ? py : px;
        return across < 0.65 || across > 2.8 ? 0.95 : 0.4;
      };
    case "divot":
      return (x, y) => {
        const row = Math.floor(y / 8),
          dx = wrap(x + (row % 2) * 4, 8) - 4;
        return Math.abs(dx) < 2.5 && Math.abs(wrap(y, 8) - (5 - Math.abs(dx))) < 0.55 ? 1 : 0;
      };
    case "shingle":
      return (x, y) => {
        const row = Math.floor(y / 8),
          dx = wrap(x + (row % 2) * 8, 16) - 8;
        const py = wrap(y, 8);
        return py < 0.75 || Math.abs(Math.hypot(dx, py) - 7) < 0.65 ? 1 : 0;
      };
    case "wave":
      return (x, y) =>
        periodicDistance(y - (4 + 2 * Math.sin((x * Math.PI) / 8)), 8) < 0.65 ? 1 : 0;
    case "trellis":
      return (x, y) => {
        const down = periodicDistance(y - x, 16),
          up = periodicDistance(y + x, 16);
        if (down < 2.5 && up < 2.5) return 0.75;
        return (down >= 1 && down < 2) || (up >= 1 && up < 2) ? 1 : 0;
      };
    case "zigZag":
      return (x, y) => (periodicDistance(y - (2 + Math.abs(x - 8) / 2), 8) < 0.65 ? 1 : 0);
    default:
      throw new TypeError("Unknown DrawingML picture pattern preset.");
  }
}

/** Construct once per paint/tile. Sampling has O(1) time and O(1) memory,
 * with a maximum of 16 geometry evaluations and no random/global state.
 * The returned value is coverage, not the paint's overall opacity: callers
 * blend foreground/background colors and apply paint opacity separately. */
export function createPicturePatternSampler(
  preset: PicturePatternPreset,
  options: PicturePatternSamplingOptions = {},
): PicturePatternSampler {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Picture pattern sampling options require an object.");
  const native = nativeTileSize(preset);
  const { width, height } = getPicturePatternTileSize(
    preset,
    options.scale === undefined ? 1 : options.scale,
  );
  const seed = options.seed === undefined ? DEFAULT_SEED : options.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new RangeError("Picture pattern seed must be an unsigned 32-bit integer.");
  const antialias = options.antialias === undefined ? true : options.antialias;
  if (typeof antialias !== "boolean")
    throw new TypeError("Picture pattern antialias must be a boolean.");
  const kernel = patternKernel(preset, seed);
  const samplesPerAxis = antialias ? 4 : 1;
  const stepX = native.width / width / samplesPerAxis;
  const stepY = native.height / height / samplesPerAxis;
  return Object.freeze({
    preset,
    width,
    height,
    sample(x: number, y: number): number {
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
        throw new RangeError("Picture pattern coordinates must be safe integer raster pixels.");
      // Reduce raster coordinates before scaling, preserving phase at very
      // large safe integers and for negative coordinates.
      const left = (wrap(x, width) * native.width) / width;
      const top = (wrap(y, height) * native.height) / height;
      let coverage = 0;
      for (let row = 0; row < samplesPerAxis; row++)
        for (let column = 0; column < samplesPerAxis; column++)
          coverage += kernel(left + (column + 0.5) * stepX, top + (row + 0.5) * stepY);
      return coverage / (samplesPerAxis * samplesPerAxis);
    },
  });
}
