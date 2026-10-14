import { EQUATION_RENDER_LIMITS } from "./equation-render";

/** Presentation inputs are pixel properties, never workbook or mutable drawing objects. */
export interface EquationPresentationInput {
  readonly sourceIdentity: object;
  readonly source: string;
  readonly fontSize: number;
  readonly color: string;
  readonly localW: number;
  readonly localH: number;
  readonly density: number;
}

export const EQUATION_PRESENTATION_LIMITS = Object.freeze({
  rasterSidePixels: 4096,
  rasterPixels: 4 * 1024 * 1024,
  retainedBytes: 64 * 1024 * 1024,
  displayListBytes: 4 * 1024 * 1024,
  nodes: 8192,
  drawOps: 4096,
  coordinate: 1_000_000,
  timeoutMs: 5000,
  concurrentPrepares: 2,
  cacheEntries: 32,
});

export type EquationPresentationLimits = typeof EQUATION_PRESENTATION_LIMITS;
export type EquationPresentationReason =
  | "invalid-source"
  | "budget"
  | "font"
  | "unsupported-primitive"
  | "canvas"
  | "stale"
  | "disposed";

export interface EquationPresentationUnavailable {
  readonly status: "unavailable";
  readonly reason: EquationPresentationReason;
  readonly message: string;
}

export class EquationPresentationFailure extends Error {
  constructor(
    readonly reason: EquationPresentationReason,
    message: string,
  ) {
    super(message);
    this.name = "EquationPresentationFailure";
  }
}

export interface EquationPresentationPlan {
  readonly status: "ready";
  readonly input: Readonly<EquationPresentationInput>;
  /** Exact source and every pixel field. Identity is a separate reference-keyed cache boundary. */
  readonly signature: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly rasterBytes: number;
}

/** Configuration can tighten the hard ceilings, never remove them. */
export function equationPresentationLimits(
  requested: Partial<Record<keyof EquationPresentationLimits, number>> = {},
): EquationPresentationLimits {
  const result = { ...EQUATION_PRESENTATION_LIMITS };
  for (const key of Object.keys(result) as (keyof EquationPresentationLimits)[]) {
    const value = requested[key];
    if (value !== undefined) {
      if (!Number.isFinite(value) || value < 1)
        throw new EquationPresentationFailure("budget", "Invalid equation presentation limit.");
      Object.assign(result, { [key]: Math.min(result[key], Math.floor(value)) });
    }
  }
  return Object.freeze(result);
}

export function planEquationPresentation(
  source: EquationPresentationInput,
  limits: EquationPresentationLimits = EQUATION_PRESENTATION_LIMITS,
): EquationPresentationPlan | EquationPresentationUnavailable {
  if (!source || typeof source !== "object")
    return {
      status: "unavailable",
      reason: "invalid-source",
      message: "Invalid equation presentation input.",
    };
  // Capture synchronously before the first font await. Do not retain the caller's mutable object.
  const input = Object.freeze({
    sourceIdentity: source.sourceIdentity,
    source: source.source,
    fontSize: source.fontSize,
    color: source.color,
    localW: source.localW,
    localH: source.localH,
    density: source.density,
  });
  if (
    input.sourceIdentity === null ||
    typeof input.sourceIdentity !== "object" ||
    typeof input.source !== "string" ||
    typeof input.color !== "string" ||
    !input.color.trim() ||
    input.color.length > 128 ||
    Array.from(input.color).some((character) => character.charCodeAt(0) < 32)
  )
    return {
      status: "unavailable",
      reason: "invalid-source",
      message: "Invalid equation presentation input.",
    };
  if (input.source.length > EQUATION_RENDER_LIMITS.sourceUnits)
    return {
      status: "unavailable",
      reason: "budget",
      message: "Equation source exceeds the rendering budget.",
    };
  for (const value of [input.fontSize, input.localW, input.localH, input.density]) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > limits.coordinate
    )
      return {
        status: "unavailable",
        reason: "budget",
        message: "Invalid equation presentation dimensions.",
      };
  }
  const pixelWidth = Math.ceil(input.localW * input.density);
  const pixelHeight = Math.ceil(input.localH * input.density);
  const pixels = pixelWidth * pixelHeight;
  if (
    !Number.isSafeInteger(pixels) ||
    pixelWidth > limits.rasterSidePixels ||
    pixelHeight > limits.rasterSidePixels ||
    pixels > limits.rasterPixels ||
    pixels * 4 > limits.retainedBytes
  )
    return {
      status: "unavailable",
      reason: "budget",
      message: "Equation raster exceeds the presentation budget.",
    };
  return Object.freeze({
    status: "ready",
    input,
    signature: JSON.stringify([
      input.source,
      input.fontSize,
      input.color,
      input.localW,
      input.localH,
      input.density,
    ]),
    pixelWidth,
    pixelHeight,
    rasterBytes: pixels * 4,
  });
}

export interface EquationRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface EquationTextOperation {
  readonly kind: "text";
  readonly text: string;
  readonly x: number;
  readonly baseline: number;
  readonly font: string;
  readonly color: string;
  readonly clips: readonly EquationRect[];
}
export interface EquationRectOperation extends EquationRect {
  readonly kind: "rect";
  readonly color: string;
  readonly clips: readonly EquationRect[];
}
export interface EquationPathOperation {
  readonly kind: "path";
  readonly d: string;
  readonly matrix: readonly [number, number, number, number, number, number];
  readonly color: string;
  readonly fillRule: CanvasFillRule;
  readonly clips: readonly EquationRect[];
}
export type EquationDrawOperation =
  | EquationTextOperation
  | EquationRectOperation
  | EquationPathOperation;

export function assertEquationCurrent(isCurrent: () => boolean): void {
  if (!isCurrent())
    throw new EquationPresentationFailure("stale", "The equation source is no longer current.");
}
