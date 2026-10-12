/** Shape-owned behavior, independent of picture sources and legacy placement. */
export type ShapeObjectProperties = {
  lockAspectRatio?: true;
  locked?: false;
  printObject?: false;
  altTitle?: string;
  altDescription?: string;
};
export const SHAPE_OBJECT_TEXT_LIMIT = 32768;
const keys = ["lockAspectRatio", "locked", "printObject", "altTitle", "altDescription"] as const;

/** Sparse defaults match newly created desktop shapes: unlocked ratio, locked/printed object. */
export function normalizeShapeObjectProperties(value: unknown): ShapeObjectProperties | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid shape object properties.");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype)
    throw new TypeError("Shape object properties must be ordinary data records.");
  const result: ShapeObjectProperties = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !(keys as readonly string[]).includes(key))
      throw new TypeError("Unknown shape object property.");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in descriptor)) throw new TypeError("Shape properties cannot be accessors.");
    const field: unknown = descriptor.value;
    if (field === undefined) continue;
    if (key === "altTitle" || key === "altDescription") {
      if (typeof field !== "string" || field.length > SHAPE_OBJECT_TEXT_LIMIT)
        throw new RangeError("Shape alternate text must be a bounded string.");
      if (field !== "") result[key] = field;
    } else {
      if (typeof field !== "boolean") throw new TypeError("Shape object flags must be boolean.");
      if (key === "lockAspectRatio") {
        if (field) result.lockAspectRatio = true;
      } else if (!field) result[key as "locked" | "printObject"] = false;
    }
  }
  return Object.keys(result).length ? result : undefined;
}

export function getShapeObjectProperties(value?: ShapeObjectProperties): {
  lockAspectRatio: boolean;
  locked: boolean;
  printObject: boolean;
  altTitle: string;
  altDescription: string;
} {
  const result = normalizeShapeObjectProperties(value);
  return {
    lockAspectRatio: result?.lockAspectRatio ?? false,
    locked: result?.locked ?? true,
    printObject: result?.printObject ?? true,
    altTitle: result?.altTitle ?? "",
    altDescription: result?.altDescription ?? "",
  };
}

export function areShapeObjectPropertiesEqual(
  left?: ShapeObjectProperties,
  right?: ShapeObjectProperties,
): boolean {
  return (
    JSON.stringify(getShapeObjectProperties(left)) ===
    JSON.stringify(getShapeObjectProperties(right))
  );
}
