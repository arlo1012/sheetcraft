import type { IdFactory } from "@sheetcraft/core/runtime";

export function createBrowserIdFactory(): IdFactory {
  let sequence = 0;

  return (prefix) => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }

    sequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${sequence}`;
  };
}
