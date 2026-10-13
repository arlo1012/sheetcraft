import { FREE_SHAPE_PATH_WORK_BUDGET } from "./shape-presets/path-budget.js";
import { flattenShapePath } from "./shape-presets/path.js";

/** Numeric, single-contour geometry for the three free-drawing tools. */
export type ShapeFreePathTool = "curve" | "freeform" | "scribble";
/** Corner points use the sparse default and have no persisted entry. */
export type ShapeFreePathPointType = "smooth" | "straight";
export type ShapeFreePathCommand =
  | readonly ["M" | "L", number, number]
  | readonly ["Q", number, number, number, number]
  | readonly ["C", number, number, number, number, number, number]
  | readonly ["Z"];
export type ShapeFreePath = {
  tool: ShapeFreePathTool;
  viewBox: { width: number; height: number };
  commands: readonly ShapeFreePathCommand[];
  /** Retained fill/text area after a closed contour is opened by removing one stroke edge. */
  openArea?: true;
  /** Command-index vertex types; a closed coincident final vertex uses the initial M index 0. */
  pointTypes?: Readonly<Record<string, ShapeFreePathPointType>>;
};

export const MAX_SHAPE_FREE_PATH_COMMANDS = 2048;
export const MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE = 16384;

function dataRecord(
  value: unknown,
  keys: readonly string[],
  name: string,
  requiredKeys: readonly string[] = keys,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`Invalid ${name}.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data record.`);
  const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key))
      throw new TypeError(`Unknown ${name} field.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError(`${name} cannot contain accessors.`);
    fields[key] = descriptor.value;
  }
  if (requiredKeys.some((key) => !Object.hasOwn(fields, key)))
    throw new TypeError(`${name} requires own data fields.`);
  return fields;
}

/** Inspect descriptors rather than indexing the source, so accessors are never evaluated. */
function dataArray(value: unknown, maxLength: number, name: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null)
    throw new TypeError(`${name} must be an ordinary data array.`);
  const length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (length > maxLength) throw new RangeError(`${name} exceeds its command budget.`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)
      throw new TypeError(`${name} cannot contain unknown fields.`);
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError(`${name} cannot contain accessors.`);
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor) throw new TypeError(`${name} cannot contain holes or inherited entries.`);
    result.push(descriptor.value);
  }
  return result;
}

function dimension(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 1 ||
    value > MAX_SHAPE_FREE_PATH_VIEWBOX_SIZE
  )
    throw new RangeError(
      "Free shape viewBox dimensions must be finite within their coordinate budget.",
    );
  return value;
}

/** Validate and deeply detach all geometry. No strings containing executable path data are accepted. */
export function normalizeShapeFreePath(value: unknown): ShapeFreePath {
  const path = dataRecord(
    value,
    ["tool", "viewBox", "commands", "pointTypes", "openArea"],
    "free shape path",
    ["tool", "viewBox", "commands"],
  );
  if (path.tool !== "curve" && path.tool !== "freeform" && path.tool !== "scribble")
    throw new RangeError("Invalid free shape tool.");
  const openArea = Object.hasOwn(path, "openArea");
  if (openArea && path.openArea !== true)
    throw new TypeError("A retained free shape area must use the sparse literal true flag.");
  const box = dataRecord(path.viewBox, ["width", "height"], "free shape viewBox");
  const width = dimension(box.width),
    height = dimension(box.height),
    source = dataArray(path.commands, MAX_SHAPE_FREE_PATH_COMMANDS, "Free shape commands");
  if (source.length < 2) throw new RangeError("Free shape paths require at least two commands.");
  const commands: ShapeFreePathCommand[] = [];
  let startX = 0,
    startY = 0,
    distinct = false;
  for (let index = 0; index < source.length; index++) {
    const command = dataArray(source[index], 7, "Free shape command"),
      operation = command[0];
    const length =
      operation === "M" || operation === "L"
        ? 3
        : operation === "Q"
          ? 5
          : operation === "C"
            ? 7
            : operation === "Z"
              ? 1
              : 0;
    if (!length || command.length !== length)
      throw new TypeError("Invalid free shape command tuple.");
    if (
      (index === 0 && operation !== "M") ||
      (index > 0 && operation === "M") ||
      (operation === "Z" && index !== source.length - 1)
    )
      throw new TypeError("Free shape paths require one initial M and an optional final Z.");
    const normalized: (string | number)[] = [operation as string];
    for (let coordinate = 1; coordinate < command.length; coordinate += 2) {
      const x = command[coordinate],
        y = command[coordinate + 1];
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > width ||
        y < 0 ||
        y > height
      )
        throw new RangeError("Free shape points and controls must be finite within the viewBox.");
      if (index === 0) {
        startX = x;
        startY = y;
      } else if (x !== startX || y !== startY) distinct = true;
      normalized.push(x === 0 ? 0 : x, y === 0 ? 0 : y);
    }
    commands.push(normalized as unknown as ShapeFreePathCommand);
  }
  if (!distinct)
    throw new RangeError("Free shape paths require a coordinate distinct from their start.");
  if (openArea) {
    if (commands[commands.length - 1]?.[0] === "Z")
      throw new TypeError("A retained free shape area requires an open stroke path.");
    // Retain the shared flatten budget independently of the exact area proof.
    // A tolerance in source units can collapse a shallow curve that becomes
    // visible after frame scaling; its finite Bernstein controls still prove
    // whether the authored contour lies on one line.
    flattenShapePath({ commands, filled: true, stroke: true }, 0.01, FREE_SHAPE_PATH_WORK_BUDGET);
    const points = commands.flatMap((command) => {
        const coordinates: { x: number; y: number }[] = [];
        for (let index = 1; index < command.length; index += 2)
          coordinates.push({ x: command[index] as number, y: command[index + 1] as number });
        return coordinates;
      }),
      first = points[0]!,
      second = points.find((point) => point.x !== first.x || point.y !== first.y);
    // Two-knot curves can enclose area, and crossed contours can have zero
    // signed area. Noncollinear authored controls avoid both false negatives.
    const hasArea =
      second &&
      points.some((point) => {
        const a = (second.x - first.x) * (point.y - first.y),
          b = (second.y - first.y) * (point.x - first.x);
        return Math.abs(a - b) > Number.EPSILON * (Math.abs(a) + Math.abs(b)) * 16;
      });
    if (!hasArea)
      throw new RangeError("A retained free shape area requires noncollinear filled geometry.");
  }
  const pointTypes: Record<string, ShapeFreePathPointType> = {};
  if (Object.hasOwn(path, "pointTypes")) {
    const allowedKeys = commands.flatMap((command, index) =>
        command[0] === "Z" ? [] : [String(index)],
      ),
      source = dataRecord(path.pointTypes, allowedKeys, "free shape point types", []);
    for (const [key, type] of Object.entries(source)) {
      if (type !== "smooth" && type !== "straight")
        throw new TypeError(
          "Free shape point types must be smooth or straight; corner is the sparse default.",
        );
      pointTypes[key] = type;
    }
    // An explicitly repeated start before Z belongs to the same closing seam node.
    const finalIndex = commands.length - 2,
      finalVertex = commands[finalIndex];
    if (
      commands[commands.length - 1]?.[0] === "Z" &&
      finalVertex &&
      finalVertex[finalVertex.length - 2] === startX &&
      finalVertex[finalVertex.length - 1] === startY &&
      Object.hasOwn(pointTypes, String(finalIndex))
    ) {
      const alias = pointTypes[String(finalIndex)]!;
      if (Object.hasOwn(pointTypes, "0") && pointTypes["0"] !== alias)
        throw new TypeError("A closed free shape seam cannot have conflicting vertex types.");
      pointTypes["0"] = alias;
      delete pointTypes[String(finalIndex)];
    }
  }
  return {
    tool: path.tool,
    viewBox: { width, height },
    commands,
    ...(openArea ? { openArea: true as const } : {}),
    ...(Object.keys(pointTypes).length ? { pointTypes } : {}),
  };
}

/** For validated geometry, closure is explicit and independent of coincident endpoints. */
export function isShapeFreePathClosed(path: ShapeFreePath): boolean {
  return path.commands[path.commands.length - 1]?.[0] === "Z";
}
