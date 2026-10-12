/** Sparse object properties. Omitted title is empty; omitted booleans are true. */
export type PictureProperties = {
  altTitle?: string;
  locked?: boolean;
  printObject?: boolean;
};
export const PICTURE_PROPERTY_KEYS = ["altTitle", "locked", "printObject"] as const;

/** Detect even an invalid field without evaluating a getter. */
export function hasPicturePropertiesField(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    PICTURE_PROPERTY_KEYS.some((key) => Object.hasOwn(value, key))
  );
}

/** Only own data may define object behavior; inherited/accessor properties cannot unlock an object. */
export function normalizePictureProperties(value: unknown): PictureProperties {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid picture properties.");
  const result: PictureProperties = {};
  for (const key of PICTURE_PROPERTY_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      if (key in value) throw new TypeError(`Picture ${key} must be an own data field.`);
      continue;
    }
    if (!("value" in descriptor)) throw new TypeError(`Picture ${key} cannot be an accessor.`);
    const field: unknown = descriptor.value;
    if (field === undefined) continue;
    if (key === "altTitle") {
      if (typeof field !== "string") throw new TypeError("Picture title must be a string.");
      if (field !== "") result.altTitle = field;
    } else {
      if (typeof field !== "boolean") throw new TypeError(`Picture ${key} must be a boolean.`);
      if (!field) result[key] = false;
    }
  }
  return result;
}

export function getPictureProperties(value: PictureProperties): Required<PictureProperties> {
  const properties = normalizePictureProperties(value);
  return {
    altTitle: properties.altTitle ?? "",
    locked: properties.locked ?? true,
    printObject: properties.printObject ?? true,
  };
}
export function arePicturePropertiesEqual(
  left: PictureProperties,
  right: PictureProperties,
): boolean {
  const a = getPictureProperties(left),
    b = getPictureProperties(right);
  return a.altTitle === b.altTitle && a.locked === b.locked && a.printObject === b.printObject;
}

/** An owned tree's root controls locking and printing until ownership is released. */
export function getPictureOwnerBehavior(
  value: PictureProperties,
): Pick<Required<PictureProperties>, "locked" | "printObject"> {
  const properties = getPictureProperties(value);
  return { locked: properties.locked, printObject: properties.printObject };
}
