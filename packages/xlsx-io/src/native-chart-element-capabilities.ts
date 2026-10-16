import type { SheetChart } from "@sheetcraft/core/sheet-charts";

const elementKeys = [
  "titlePosition",
  "legendPosition",
  "legendOverlay",
  "labelPosition",
  "dataTable",
  "labelContent",
  "labelScope",
] as const;
export const nativeLegendPositions = {
  top: "t",
  bottom: "b",
  left: "l",
  right: "r",
  topRight: "tr",
} as const;
export const nativeLabelPositions = {
  center: "ctr",
  insideEnd: "inEnd",
  insideBase: "inBase",
  outsideEnd: "outEnd",
} as const;

function ownData(value: object, key: string): unknown {
  const field = Object.getOwnPropertyDescriptor(value, key);
  if (!field || !("value" in field)) throw new Error("Expected an own chart data field.");
  return field.value;
}

/**
 * A leaf capability gate, not a generic permission to serialize all elements.
 * Inspect descriptors before reads so rejected payloads cannot invoke getters.
 */
export function unsupportedNativeChartElements(chart: SheetChart): readonly string[] {
  if (!("elements" in chart)) return [];
  try {
    const raw = ownData(chart, "elements");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["elements"];
    const prototype: unknown = Object.getPrototypeOf(raw);
    if (prototype !== null && prototype !== Object.prototype) return ["elements"];
    const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of elementKeys) if (key in raw && !Object.hasOwn(raw, key)) return ["elements"];
    for (const key of Reflect.ownKeys(raw)) {
      if (typeof key !== "string" || !elementKeys.includes(key as (typeof elementKeys)[number]))
        return ["elements"];
      fields[key] = ownData(raw, key);
    }
    const type = ownData(chart, "type");
    if (
      !["column", "bar", "line"].includes(type as string) ||
      "pivotTableId" in chart ||
      "dataCache" in chart
    )
      return ["elements"];
    const title = ownData(chart, "title"),
      legend = ownData(chart, "legend"),
      labels = ownData(chart, "labels");
    if (typeof title !== "string" || typeof legend !== "boolean" || typeof labels !== "boolean")
      return ["elements"];
    const issues = new Set<string>();
    const reject = (key: (typeof elementKeys)[number]) => issues.add(`elements.${key}`);
    if (Object.hasOwn(fields, "titlePosition")) {
      const value = fields.titlePosition;
      if (
        !["none", "above", "overlay"].includes(value as string) ||
        // Native deletion has no place for the retained, hidden title text.
        (value === "none" ? title !== "" : title === "")
      )
        reject("titlePosition");
    }
    if (Object.hasOwn(fields, "legendPosition")) {
      const value = fields.legendPosition;
      if (typeof value !== "string" || !Object.hasOwn(nativeLegendPositions, value) || !legend)
        reject("legendPosition");
    }
    if (
      Object.hasOwn(fields, "legendOverlay") &&
      (typeof fields.legendOverlay !== "boolean" || !legend)
    )
      reject("legendOverlay");
    if (Object.hasOwn(fields, "labelPosition")) {
      const value = fields.labelPosition;
      if (
        typeof value !== "string" ||
        !Object.hasOwn(nativeLabelPositions, value) ||
        !labels ||
        type === "line"
      )
        reject("labelPosition");
    }
    for (const [key, defaultValue] of [
      ["dataTable", "none"],
      ["labelContent", "value"],
      ["labelScope", "all"],
    ] as const)
      if (Object.hasOwn(fields, key) && fields[key] !== defaultValue) reject(key);
    return [...issues];
  } catch {
    return ["elements"];
  }
}
