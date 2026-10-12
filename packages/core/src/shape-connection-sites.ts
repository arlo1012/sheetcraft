import { normalizeShapePresetParameters } from "./shape-presets/contract.js";
import { evaluateShapePresetAtDisplaySize } from "./shape-presets/display-size.js";
import type { ShapePresetName } from "./shape-presets/catalog.js";
import type { ShapePresetParameters } from "./shape-presets/types.js";
import { shapeFrameLocalToWorld, type ShapeFrameRect } from "./shape-frame.js";

/** Ordered sites belong to the pinned source, not a caller's mutable array index. */
export const SHAPE_CONNECTION_SITE_REVISION = "sheetcraft-preset-sites-v1" as const;
export type ShapeConnectionSiteIdentity = Readonly<{
  revision: typeof SHAPE_CONNECTION_SITE_REVISION;
  preset: ShapePresetName;
  index: number;
}>;
export type ProjectedShapeConnectionSite = Readonly<{
  identity: ShapeConnectionSiteIdentity;
  /** Flipped, unrotated local logical coordinates. */
  localPosition: Readonly<{ x: number; y: number }>;
  /** Continuous worksheet coordinates, before any viewport or page projection. */
  position: Readonly<{ x: number; y: number }>;
  /** Outward unit vector with geometry flips and the complete world rotation applied. */
  direction: Readonly<{ x: number; y: number }>;
}>;
export type ShapeConnectionSiteProjection =
  | Readonly<{ status: "ready"; sites: readonly ProjectedShapeConnectionSite[] }>
  | Readonly<{ status: "collapsed"; sites: readonly [] }>;
export type ShapeConnectionSiteFlips = Readonly<{
  shapeFlipX?: boolean;
  shapeFlipY?: boolean;
}>;

function record(
  value: unknown,
  allowed: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${label}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError(`${label} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !allowed.includes(key) || !("value" in descriptor))
      throw new TypeError(`${label} must contain only supported own data fields.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}
function coordinate(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 10_000_000)
    throw new RangeError("Shape connection sites exceed the worksheet-coordinate budget.");
  return value === 0 ? 0 : value;
}
function quarterVector(degrees: number): Readonly<{ x: number; y: number }> {
  const turn = ((degrees % 360) + 360) % 360;
  if (turn === 0) return { x: 1, y: 0 };
  if (turn === 90) return { x: 0, y: 1 };
  if (turn === 180) return { x: -1, y: 0 };
  if (turn === 270) return { x: 0, y: -1 };
  const radians = (turn * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

/**
 * Resolve the preset's actual ordered sites, including adjustment-dependent and
 * out-of-frame sites. This is geometry only: target eligibility and binding
 * ownership remain the caller's policy. Collapsed layouts are explicit; no
 * epsilon extents, fabricated midpoint, CSS frame or viewport coordinate is used.
 */
export function projectShapePresetConnectionSites(
  input: ShapePresetParameters,
  rect: ShapeFrameRect,
  rotation = 0,
  flips: ShapeConnectionSiteFlips = {},
): ShapeConnectionSiteProjection {
  const shape = normalizeShapePresetParameters(input) ?? { preset: "rect" as const };
  const raw = record(rect, ["x", "y", "width", "height"], "connection-site frame");
  const frame: ShapeFrameRect = {
    x: coordinate(raw.x),
    y: coordinate(raw.y),
    width: coordinate(raw.width),
    height: coordinate(raw.height),
  };
  if ([frame.width, frame.height].some((value) => value < 0 || value > 16_384))
    throw new RangeError("Connection-site extents must be 0–16384 logical pixels.");
  if (typeof rotation !== "number" || !Number.isFinite(rotation) || Math.abs(rotation) > 360)
    throw new RangeError("Connection-site rotation must be finite within one full turn.");
  const options = record(flips, ["shapeFlipX", "shapeFlipY"], "connection-site flips");
  for (const value of Object.values(options))
    if (value !== undefined && typeof value !== "boolean")
      throw new TypeError("Connection-site flips must be booleans.");
  if (!frame.width || !frame.height)
    return Object.freeze({ status: "collapsed", sites: Object.freeze([]) as readonly [] });
  const geometry = evaluateShapePresetAtDisplaySize(shape, frame.width, frame.height);
  const worldRotation = quarterVector(rotation);
  const sites = geometry.connectionSites.map((site, index): ProjectedShapeConnectionSite => {
    const localPosition = Object.freeze({
      x: coordinate(options.shapeFlipX ? frame.width - site.position.x : site.position.x),
      y: coordinate(options.shapeFlipY ? frame.height - site.position.y : site.position.y),
    });
    const projected = shapeFrameLocalToWorld(frame, rotation, localPosition);
    const localDirection = quarterVector(site.angle / 60_000);
    const dx = options.shapeFlipX ? -localDirection.x : localDirection.x;
    const dy = options.shapeFlipY ? -localDirection.y : localDirection.y;
    return Object.freeze({
      identity: Object.freeze({
        revision: SHAPE_CONNECTION_SITE_REVISION,
        preset: shape.preset,
        index,
      }),
      localPosition,
      position: Object.freeze({ x: coordinate(projected.x), y: coordinate(projected.y) }),
      direction: Object.freeze({
        x: coordinate(dx * worldRotation.x - dy * worldRotation.y),
        y: coordinate(dx * worldRotation.y + dy * worldRotation.x),
      }),
    });
  });
  return Object.freeze({ status: "ready", sites: Object.freeze(sites) });
}
