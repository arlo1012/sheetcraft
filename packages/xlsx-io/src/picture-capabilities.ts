import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  isFramedPictureObject,
  normalizePictureObject,
  type StandalonePictureObject,
} from "@sheetcraft/core/picture-object";
import {
  encodeNativePictureGeometry,
  assertNativePictureGeometryPrecision,
} from "./picture-frame-geometry.js";

/** The sole appearance transform supported by the basic native-picture slice. */
export function isNativePictureThemeSuppression(value: unknown): boolean {
  const record = (input: unknown, keys: readonly string[]): input is Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const ownKeys = Reflect.ownKeys(input);
    return (
      ownKeys.length === keys.length &&
      ownKeys.every((key) => typeof key === "string" && keys.includes(key)) &&
      keys.every((key) => "value" in Object.getOwnPropertyDescriptor(input, key)!)
    );
  };
  if (!record(value, ["appearance"])) return false;
  const appearance = Object.getOwnPropertyDescriptor(value, "appearance")!.value;
  if (!record(appearance, ["suppressThemeEffects"])) return false;
  const flags = Object.getOwnPropertyDescriptor(appearance, "suppressThemeEffects")!.value;
  const keys = ["shadow", "outline", "reflection", "bevel"];
  return (
    record(flags, keys) &&
    keys.every((key) => Object.getOwnPropertyDescriptor(flags, key)!.value === true)
  );
}

/** Shared, non-rendering native/Web admission; no getters are evaluated. */
export function isSupportedNativePictureFrame(
  image: StandalonePictureObject,
  metrics?: PictureSheetMetrics,
): boolean {
  const data = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return true;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      return "value" in descriptor && data(descriptor.value);
    });
  };
  try {
    if (
      !data(image) ||
      !isFramedPictureObject(image) ||
      (image.transform !== undefined && !isNativePictureThemeSuppression(image.transform))
    )
      return false;
    const normalized = normalizePictureObject(image);
    if (
      !isFramedPictureObject(normalized) ||
      normalized.hidden ||
      normalized.groupId !== undefined ||
      normalized.frame.cropShape !== undefined
    )
      return false;
    encodeNativePictureGeometry(normalized.frame);
    if (metrics) {
      const resolved = resolvePictureFrame(normalized.frame, metrics);
      if (resolved.collapsed) return false;
      assertNativePictureGeometryPrecision(normalized.frame, resolved.rect);
    }
    return true;
  } catch {
    return false;
  }
}

export { assertNativePictureSourceOrientation } from "./picture-source-orientation.js";
