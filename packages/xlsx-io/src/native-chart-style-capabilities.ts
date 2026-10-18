import type { SheetChart } from "@sheetcraft/core/sheet-charts";

/** One concrete family name, never a CSS fallback list or a theme font token. */
export function isNativeChartFontFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    /^[-_\p{L}][-_\p{L}\p{N} ]*$/u.test(value) &&
    !/ {2}/.test(value) &&
    !value.startsWith("+") &&
    !/^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-.+|inherit|initial|unset|revert)$/i.test(
      value,
    )
  );
}
export function nativeChartRgb(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) return;
  return (
    value.length === 4
      ? value
          .slice(1)
          .split("")
          .map((v) => v + v)
          .join("")
      : value.slice(1)
  ).toUpperCase();
}
function own(value: object, key: string): unknown {
  const field = Object.getOwnPropertyDescriptor(value, key);
  if (!field || !("value" in field)) throw new Error("Expected an own data field.");
  return field.value;
}
function record(value: unknown, known: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)
  )
    throw new Error("Expected record.");
  for (const key of known)
    if (key in value && !Object.hasOwn(value, key)) throw new Error("Inherited field.");
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("Unknown symbol.");
    out[key] = own(value, key);
  }
  return out;
}
function validScriptFonts(value: unknown): boolean {
  try {
    const slots = record(value, ["latin", "eastAsia", "complexScript"]);
    if (!Object.keys(slots).length) return false;
    return Object.entries(slots).every(([slot, value]) => {
      if (!["latin", "eastAsia", "complexScript"].includes(slot)) return false;
      const choice = record(value, ["kind", "family", "role", "slot"]);
      if (choice.kind === "automatic") return Object.keys(choice).length === 1;
      if (choice.kind === "family")
        return Object.keys(choice).length === 2 && isNativeChartFontFamily(choice.family);
      return (
        choice.kind === "theme" &&
        Object.keys(choice).length === 3 &&
        ["major", "minor"].includes(String(choice.role)) &&
        choice.slot === slot
      );
    });
  } catch {
    return false;
  }
}
const textKeys = ["scriptFonts", "fontFamily", "fontSize", "bold", "color", "italic"];
const formatKeys = [
  "title",
  "legend",
  "plot",
  "categoryAxis",
  "valueAxis",
  "secondaryValueAxis",
  "bar",
  "series",
];
const axisKeys = [
  "show",
  "reverse",
  "labelAngle",
  "title",
  "titleVisible",
  "text",
  "line",
  "min",
  "max",
  "majorUnit",
  "minorUnit",
  "majorGridlines",
  "minorGridlines",
  "numberFormat",
  "linkedToSource",
];
const presentationKeys = ["palette", "percentStacked", "lineMarkers", "background"];

/** Shared fail-closed leaf admission, safe before any resource access or caller getters. */
export function unsupportedNativeChartStyles(chart: SheetChart): readonly string[] {
  const issues = new Set<string>();
  const text = (value: unknown, path: string, legend = false) => {
    let fields: Record<string, unknown>;
    try {
      fields = record(value, textKeys);
    } catch {
      issues.add(path);
      return;
    }
    if ("fontFamily" in fields && "scriptFonts" in fields) issues.add(`${path}.scriptFonts`);
    for (const [key, choice] of Object.entries(fields)) {
      const valid =
        key === "scriptFonts"
          ? validScriptFonts(choice)
          : key === "fontFamily"
            ? isNativeChartFontFamily(choice)
            : key === "fontSize"
              ? typeof choice === "number" &&
                Number.isFinite(choice) &&
                choice >= 4 / 3 &&
                choice <= 256 &&
                (legend
                  ? Math.round(choice * 75) / 75 === choice
                  : Math.abs(choice * 75 - Math.round(choice * 75)) < 1e-8)
              : key === "bold" || (legend && key === "italic")
                ? typeof choice === "boolean"
                : key === "color"
                  ? nativeChartRgb(choice) !== undefined
                  : false;
      if (!valid) issues.add(`${path}.${key}`);
    }
  };
  const hasStyle = "format" in chart || "presentation" in chart;
  if (!hasStyle) return [];
  let ordinary = false;
  try {
    ordinary =
      ["column", "bar", "line"].includes(own(chart, "type") as string) &&
      !["pivotTableId", "dataCache", "source", "rectangleSeries", "seriesFilter"].some(
        (key) => key in chart,
      ) &&
      own(chart, "stacked") === false;
    const range = record(own(chart, "range"), ["start", "end"]);
    const start = record(range.start, ["row", "column"]),
      end = record(range.end, ["row", "column"]);
    const direction = own(chart, "seriesBy");
    const header = own(chart, direction === "columns" ? "headerColumn" : "headerRow");
    const first = start[direction === "columns" ? "column" : "row"],
      last = end[direction === "columns" ? "column" : "row"];
    if (
      !["columns", "rows"].includes(direction as string) ||
      typeof header !== "boolean" ||
      typeof first !== "number" ||
      typeof last !== "number"
    )
      throw new Error("Unproven series count.");
    const count = last - first + 1 - Number(header);
    ordinary = ordinary && Number.isSafeInteger(count) && count >= 1 && count <= 16;
  } catch {
    ordinary = false;
  }
  for (const top of ["format", "presentation"] as const) {
    if (!(top in chart)) continue;
    if (!ordinary) {
      issues.add(top);
      continue;
    }
    let fields: Record<string, unknown>;
    try {
      fields = record(own(chart, top), top === "format" ? formatKeys : presentationKeys);
    } catch {
      issues.add(top);
      continue;
    }
    for (const [key, value] of Object.entries(fields)) {
      const path = `${top}.${key}`;
      if (top === "format") {
        if (key === "title") {
          try {
            if (!own(chart, "title")) {
              issues.add(path);
              continue;
            }
          } catch {
            issues.add(path);
            continue;
          }
          text(value, path);
        } else if (key === "legend") {
          try {
            if (own(chart, "legend") !== true) {
              issues.add(path);
              continue;
            }
            for (const [leaf, choice] of Object.entries(record(value, ["text", "surface"]))) {
              if (leaf === "text") text(choice, `${path}.text`, true);
              else if (leaf === "surface") {
                try {
                  for (const [paint, setting] of Object.entries(
                    record(choice, ["fill", "stroke", "strokeWidth"]),
                  )) {
                    const valid =
                      paint === "fill" || paint === "stroke"
                        ? setting === "transparent" || nativeChartRgb(setting) !== undefined
                        : paint === "strokeWidth" &&
                          typeof setting === "number" &&
                          Number.isFinite(setting) &&
                          setting > 0 &&
                          setting <= 32 &&
                          Math.round(setting * 9525) / 9525 === setting;
                    if (!valid) issues.add(`${path}.surface.${paint}`);
                  }
                } catch {
                  issues.add(`${path}.surface`);
                }
              } else issues.add(`${path}.${leaf}`);
            }
          } catch {
            issues.add(path);
          }
        } else if (key === "categoryAxis" || key === "valueAxis") {
          try {
            for (const [leaf, choice] of Object.entries(record(value, axisKeys)))
              if (leaf === "text") text(choice, `${path}.text`);
              else if (key === "categoryAxis" && leaf === "labelAngle") {
                if (
                  typeof choice !== "number" ||
                  !Number.isFinite(choice) ||
                  choice < -90 ||
                  choice > 90 ||
                  Math.round(choice * 60000) / 60000 !== choice
                )
                  issues.add(`${path}.${leaf}`);
              } else issues.add(`${path}.${leaf}`);
          } catch {
            issues.add(path);
          }
        } else issues.add(path);
      } else if (key === "palette") {
        try {
          if (
            !Array.isArray(value) ||
            !value.length ||
            value.length > 16 ||
            Object.getPrototypeOf(value) !== Array.prototype
          )
            throw new Error("Invalid palette.");
          for (const index of Array.from({ length: value.length }, (_, i) => i))
            if (nativeChartRgb(own(value, String(index))) === undefined)
              throw new Error("Invalid palette color.");
          if (Reflect.ownKeys(value).length !== value.length + 1)
            throw new Error("Invalid palette fields.");
        } catch {
          issues.add(path);
        }
      } else issues.add(path);
    }
  }
  return [...issues];
}
