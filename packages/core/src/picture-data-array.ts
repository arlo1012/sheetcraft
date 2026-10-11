/** Reads bounded, dense own data without executing caller-supplied array methods. */
export function readPictureDataArray<T>(value: readonly T[], name: string, maximum: number): T[] {
  if (!Array.isArray(value)) throw new TypeError(`Invalid ${name}.`);
  if (value.length > maximum) throw new RangeError(`${name} node budget exceeded.`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      throw new TypeError(
        `${name} must be an ordinary indexed data array containing only root entries.`,
      );
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError(`${name} cannot contain accessors; entries must be data fields.`);
  }
  const result: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor))
      throw new TypeError(`${name} must contain dense own data entries.`);
    result.push(descriptor.value as T);
  }
  return result;
}
