import { normalizeChartRectangleSeries } from "@sheetcraft/core/chart-range-series";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import { toExcelNumberFormat } from "./number-format.js";
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
/** A deliberately narrow axis contract; other cell formats are not chart admission. */
export function nativeValueAxisNumberCode(value: unknown): string | undefined {
  try {
    const fields = record(value, ["kind", "fractionDigits", "useGrouping", "code"]);
    if (fields.kind === "custom")
      return Object.keys(fields).length === 2 && fields.code === "General" ? "General" : undefined;
    if (
      !["number", "percent"].includes(fields.kind as string) ||
      Object.keys(fields).some((key) => !["kind", "fractionDigits", "useGrouping"].includes(key)) ||
      typeof fields.fractionDigits !== "number" ||
      !Number.isInteger(fields.fractionDigits) ||
      fields.fractionDigits < 0 ||
      fields.fractionDigits > 20 ||
      ("useGrouping" in fields && typeof fields.useGrouping !== "boolean")
    )
      return undefined;
    return toExcelNumberFormat(fields as CellNumberFormat);
  } catch {
    return undefined;
  }
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
  "titleText",
  "titleRotation",
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
/** Explicit single-line content only; implicit application placeholders are not text. */
export function isNativeAxisTitle(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 1000 &&
    !!value.trim() &&
    [...value].every((character) => {
      const scalar = character.codePointAt(0)!;
      return (
        (scalar >= 0x20 && scalar <= 0xd7ff) ||
        (scalar >= 0xe000 && scalar <= 0xfffd) ||
        (scalar >= 0x10000 && scalar <= 0x10ffff)
      );
    })
  );
}
const presentationKeys = ["palette", "percentStacked", "lineMarkers", "background"];

/** Only active, explicitly styled ordinary line bands can be encoded natively.
 * Dormant/header/opposite-direction identities have no native representation.
 * Descriptor-safe because this also runs before the workbook export boundary.
 */
export function supportsNativeLineSeriesStyles(chart: SheetChart): boolean {
  try {
    if (
      own(chart, "type") !== "line" ||
      own(chart, "stacked") !== false ||
      ["pivotTableId", "dataCache", "source", "seriesFilter"].some((key) => key in chart)
    )
      return false;
    const rawRange = record(own(chart, "range"), ["start", "end"]);
    const start = record(rawRange.start, ["row", "column"]);
    const end = record(rawRange.end, ["row", "column"]);
    if (
      Object.keys(rawRange).length !== 2 ||
      Object.keys(start).length !== 2 ||
      Object.keys(end).length !== 2 ||
      ![start.row, start.column, end.row, end.column].every(
        (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
      )
    )
      return false;
    const range = {
      start: { row: start.row as number, column: start.column as number },
      end: { row: end.row as number, column: end.column as number },
    };
    const by = own(chart, "seriesBy");
    if (by !== "rows" && by !== "columns") return false;
    const header = own(chart, by === "rows" ? "headerRow" : "headerColumn");
    if (typeof header !== "boolean") return false;
    const bindings = normalizeChartRectangleSeries(own(chart, "rectangleSeries"), range);
    if (bindings[by === "rows" ? "columns" : "rows"].length) return false;
    const first = range.start[by === "rows" ? "row" : "column"] + Number(header);
    const last = range.end[by === "rows" ? "row" : "column"];
    if (
      last < first ||
      last - first >= 16 ||
      !bindings[by].length ||
      bindings[by].some((entry) => entry.index < first)
    )
      return false;
    const format = record(own(chart, "format"), formatKeys);
    const rawEntries = format.series;
    if (
      !Array.isArray(rawEntries) ||
      Object.getPrototypeOf(rawEntries) !== Array.prototype ||
      rawEntries.length > 16 ||
      Reflect.ownKeys(rawEntries).length !== rawEntries.length + 1
    )
      return false;
    const entries = Array.from({ length: rawEntries.length }, (_, index) =>
      own(rawEntries, String(index)),
    );
    const ids = new Set<string>();
    for (const value of entries) {
      const entry = record(value, ["id", "strokeWidth", "markers"]);
      if (
        Object.keys(entry).some((key) => !["id", "strokeWidth", "markers"].includes(key)) ||
        typeof entry.id !== "string" ||
        ids.has(entry.id) ||
        !bindings[by].some((binding) => binding.id === entry.id) ||
        !("strokeWidth" in entry || "markers" in entry)
      )
        return false;
      if (
        "strokeWidth" in entry &&
        !(
          typeof entry.strokeWidth === "number" &&
          Number.isFinite(entry.strokeWidth) &&
          entry.strokeWidth > 0 &&
          entry.strokeWidth <= 32 &&
          Math.abs(entry.strokeWidth * 9525 - Math.round(entry.strokeWidth * 9525)) < 1e-8
        )
      )
        return false;
      if ("markers" in entry && typeof entry.markers !== "boolean") return false;
      ids.add(entry.id);
    }
    return entries.length === bindings[by].length;
  } catch {
    return false;
  }
}

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
      !["pivotTableId", "dataCache", "source", "seriesFilter"].some((key) => key in chart) &&
      own(chart, "stacked") === false &&
      (!("rectangleSeries" in chart) || supportsNativeLineSeriesStyles(chart));
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
        } else if (key === "series") {
          if (!supportsNativeLineSeriesStyles(chart)) issues.add(path);
        } else if (key === "categoryAxis" || key === "valueAxis") {
          try {
            const axis = record(value, axisKeys);
            const visibleTitle = isNativeAxisTitle(axis.title) && axis.titleVisible !== false;
            const latent = axis.titleText !== undefined || axis.titleRotation !== undefined;
            for (const [leaf, choice] of Object.entries(axis))
              if (leaf === "text") text(choice, `${path}.text`);
              else if (leaf === "title") {
                if (!visibleTitle && !(choice === "" && axis.titleVisible !== true && !latent))
                  issues.add(`${path}.title`);
              } else if (leaf === "titleVisible") {
                if (
                  typeof choice !== "boolean" ||
                  (choice && !visibleTitle) ||
                  (!choice && ((axis.title !== undefined && axis.title !== "") || latent))
                )
                  issues.add(`${path}.titleVisible`);
              } else if (leaf === "titleText") {
                if (!visibleTitle) issues.add(`${path}.titleText`);
                text(choice, `${path}.titleText`, true);
              } else if (leaf === "titleRotation") {
                if (
                  !visibleTitle ||
                  typeof choice !== "number" ||
                  !Number.isFinite(choice) ||
                  Math.abs(choice) > 90 ||
                  Math.round(choice * 60000) / 60000 !== choice
                )
                  issues.add(`${path}.titleRotation`);
              } else if (key === "categoryAxis" && leaf === "labelAngle") {
                if (
                  typeof choice !== "number" ||
                  !Number.isFinite(choice) ||
                  choice < -90 ||
                  choice > 90 ||
                  Math.round(choice * 60000) / 60000 !== choice
                )
                  issues.add(`${path}.${leaf}`);
              } else if (key === "valueAxis" && leaf === "numberFormat") {
                // Re-linking retains a latent format in Core; WPS preservation is unproven.
                if (nativeValueAxisNumberCode(choice) === undefined || axis.linkedToSource === true)
                  issues.add(`${path}.${leaf}`);
              } else if (key === "valueAxis" && leaf === "linkedToSource") {
                if (typeof choice !== "boolean") issues.add(`${path}.${leaf}`);
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
