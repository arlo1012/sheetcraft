import { isShapePresetName } from "./shape-presets/contract.js";
import type { ShapePresetName } from "./shape-presets/catalog.js";

export type ShapeConnectorEndpoint =
  | { kind: "free"; xRatio: number; yRatio: number }
  | { kind: "site"; targetId: string; preset: ShapePresetName; siteIndex: number };

/** V1 fixes ordered preset-site identity; attached endpoints have no stored fallback point. */
export type ShapeConnector = {
  kind: "shape-connector-v1";
  begin: ShapeConnectorEndpoint;
  end: ShapeConnectorEndpoint;
};

function record(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor))
      throw new TypeError(`${name} must contain own data fields, not accessors.`);
    result[key] = descriptor.value as unknown;
  }
  return result;
}

function ratio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000)
    throw new RangeError("Shape connector ratios must be finite within their coordinate budget.");
  return value === 0 ? 0 : value;
}

function normalizeEndpoint(value: unknown): ShapeConnectorEndpoint {
  const source = record(
    value,
    ["kind", "xRatio", "yRatio", "targetId", "preset", "siteIndex"],
    "shape connector endpoint",
  );
  if (source.kind === "free") {
    const endpoint = record(source, ["kind", "xRatio", "yRatio"], "free connector endpoint");
    return { kind: "free", xRatio: ratio(endpoint.xRatio), yRatio: ratio(endpoint.yRatio) };
  }
  if (source.kind === "site") {
    const endpoint = record(
      source,
      ["kind", "targetId", "preset", "siteIndex"],
      "attached connector endpoint",
    );
    if (typeof endpoint.targetId !== "string" || !endpoint.targetId.trim())
      throw new TypeError("A shape connector target ID must be non-empty.");
    if (!isShapePresetName(endpoint.preset))
      throw new TypeError("Unknown shape connector target preset.");
    const siteIndex = endpoint.siteIndex;
    if (
      typeof siteIndex !== "number" ||
      !Number.isInteger(siteIndex) ||
      siteIndex < 0 ||
      siteIndex > 15
    )
      throw new RangeError("A shape connector site index must be an integer from 0 to 15.");
    return {
      kind: "site",
      targetId: endpoint.targetId,
      preset: endpoint.preset,
      siteIndex: siteIndex === 0 ? 0 : siteIndex,
    };
  }
  throw new TypeError("Unknown shape connector endpoint kind.");
}

/** Local data validation only; drawing eligibility and target references belong to the forest. */
export function normalizeShapeConnector(value: unknown): ShapeConnector {
  const source = record(value, ["kind", "begin", "end"], "shape connector");
  if (source.kind !== "shape-connector-v1") throw new TypeError("Unknown shape connector kind.");
  return {
    kind: "shape-connector-v1",
    begin: normalizeEndpoint(source.begin),
    end: normalizeEndpoint(source.end),
  };
}

export function cloneShapeConnector(value: ShapeConnector): ShapeConnector {
  return normalizeShapeConnector(value);
}

export function areShapeConnectorsEqual(left: ShapeConnector, right: ShapeConnector): boolean {
  return (
    JSON.stringify(normalizeShapeConnector(left)) === JSON.stringify(normalizeShapeConnector(right))
  );
}
