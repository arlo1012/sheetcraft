import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellRange } from "@idea10/core/workbook";
import {
  normalizeConditionalFormatRules,
  type ConditionalFormatIconSet,
  type ConditionalFormatThreshold,
  type SheetConditionalFormatRule,
} from "@idea10/core/conditional-formatting";
import { translateFormulaForCopy } from "@idea10/core/formula";
import { CompatibilityReportBuilder } from "./report.js";

type ConditionalFormatRead = {
  rules: SheetConditionalFormatRule[];
  unsupported: boolean;
};

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, token: string) => {
    const named: Record<string, string> = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"',
    };
    const lower = token.toLowerCase();
    if (lower in named) return named[lower] ?? entity;
    const point = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : Number(lower.slice(1));
    return Number.isSafeInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}

function encodeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match ? decodeXml(match[2] ?? "") : undefined;
}

function truthy(value: string | undefined): boolean {
  return /^(1|true)$/i.test(value?.trim() ?? "");
}

function columnIndex(label: string): number | null {
  let value = 0;
  for (const character of label.toUpperCase()) {
    if (character < "A" || character > "Z") return null;
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value > 0 ? value - 1 : null;
}

function columnLabel(column: number): string {
  let value = column + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function parseRange(reference: string): CellRange | null {
  const match = /^\$?([A-Z]+)\$?([1-9]\d*)(?::\$?([A-Z]+)\$?([1-9]\d*))?$/i.exec(reference.trim());
  if (!match) return null;
  const firstColumn = columnIndex(match[1] ?? "");
  const lastColumn = columnIndex(match[3] ?? match[1] ?? "");
  const firstRow = Number(match[2]) - 1;
  const lastRow = Number(match[4] ?? match[2]) - 1;
  if (
    firstColumn === null ||
    lastColumn === null ||
    firstRow < 0 ||
    lastRow < 0 ||
    firstColumn >= MAX_SHEET_COLUMNS ||
    lastColumn >= MAX_SHEET_COLUMNS ||
    firstRow >= MAX_SHEET_ROWS ||
    lastRow >= MAX_SHEET_ROWS
  )
    return null;
  return {
    start: {
      row: Math.min(firstRow, lastRow),
      column: Math.min(firstColumn, lastColumn),
    },
    end: {
      row: Math.max(firstRow, lastRow),
      column: Math.max(firstColumn, lastColumn),
    },
  };
}

function rangesFromSqref(value: string | undefined): CellRange[] | null {
  if (!value) return null;
  const ranges = value.split(/\s+/).filter(Boolean).map(parseRange);
  return ranges.length && ranges.every((range): range is CellRange => range !== null)
    ? ranges
    : null;
}

function rangeReference(range: CellRange): string {
  return `${columnLabel(range.start.column)}${range.start.row + 1}:${columnLabel(range.end.column)}${range.end.row + 1}`;
}

function rgb(value: string | undefined): string | undefined {
  if (!value || !/^(?:[0-9a-f]{2})?[0-9a-f]{6}$/i.test(value)) return undefined;
  return `#${value.slice(-6).toUpperCase()}`;
}

function differentialBoolean(xml: string, element: "b" | "i"): boolean | undefined {
  const attrs = new RegExp(`<(?:[a-z_][\\w.-]*:)?${element}\\b([^>]*)\\/?\\s*>`, "i").exec(
    xml,
  )?.[1];
  if (attrs === undefined) return undefined;
  return !/^(0|false)$/i.test(attribute(attrs, "val") ?? "1");
}

/** Read only the differential-style subset represented by the first release. */
function readDxf(xml: string | undefined): {
  style: SheetConditionalFormatRule["style"];
  unsupported: boolean;
} {
  if (!xml) return { style: {}, unsupported: false };
  let unsupported = false;
  const style: SheetConditionalFormatRule["style"] = {};
  const font = /<(?:[a-z_][\w.-]*:)?font\b[^>]*>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?font>/i.exec(
    xml,
  )?.[1];
  if (font !== undefined) {
    const bold = differentialBoolean(font, "b");
    const italic = differentialBoolean(font, "i");
    if (bold !== undefined) style.bold = bold;
    if (italic !== undefined) style.italic = italic;
    const color = /<(?:[a-z_][\w.-]*:)?color\b([^>]*)\/?\s*>/i.exec(font)?.[1];
    if (color !== undefined) {
      const value = rgb(attribute(color, "rgb"));
      if (value) style.textColor = value;
      else unsupported = true;
    }
    // Other differential font attributes cannot be represented by the v1 style.
    if (
      /<(?:u|strike|vertAlign|sz|name|family|scheme|charset|outline|shadow|condense|extend)\b/i.test(
        font,
      )
    )
      unsupported = true;
  }
  const fill = /<(?:[a-z_][\w.-]*:)?fill\b[^>]*>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?fill>/i.exec(
    xml,
  )?.[1];
  if (fill !== undefined) {
    const pattern =
      /<(?:[a-z_][\w.-]*:)?patternFill\b([^>]*)>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?patternFill>|<(?:[a-z_][\w.-]*:)?patternFill\b([^>]*)\/?\s*>/i.exec(
        fill,
      );
    const attrs = pattern?.[1] ?? pattern?.[3];
    const body = pattern?.[2] ?? "";
    const patternType = attribute(attrs ?? "", "patternType");
    if (!pattern || (patternType !== undefined && patternType !== "solid")) unsupported = true;
    else {
      const foreground = /<(?:[a-z_][\w.-]*:)?fgColor\b([^>]*)\/?\s*>/i.exec(body)?.[1];
      const background = /<(?:[a-z_][\w.-]*:)?bgColor\b([^>]*)\/?\s*>/i.exec(body)?.[1];
      // ISO SpreadsheetML uses fgColor for an explicit solid fill. DXF writers
      // such as XlsxWriter can instead omit patternType and emit bgColor, so
      // accept that external form without accepting a non-solid pattern.
      const color =
        patternType === "solid" ? (foreground ?? background) : (background ?? foreground);
      const value = rgb(attribute(color ?? "", "rgb"));
      if (value) style.fillColor = value;
      else unsupported = true;
    }
  }
  if (/<(?:[a-z_][\w.-]*:)?(?:numFmt|alignment|border|protection)\b/i.test(xml)) unsupported = true;
  return { style, unsupported };
}

function readDxfs(stylesXml: string | undefined): string[] {
  const container = /<(?:[a-z_][\w.-]*:)?dxfs\b[^>]*>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?dxfs>/i.exec(
    stylesXml ?? "",
  )?.[1];
  return container
    ? [
        ...container.matchAll(
          /<(?:[a-z_][\w.-]*:)?dxf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?dxf>)/gi,
        ),
      ].map((entry) => entry[2] ?? "")
    : [];
}

function formulae(body: string): string[] {
  return [
    ...body.matchAll(
      /<(?:[a-z_][\w.-]*:)?formula\b[^>]*>([\s\S]*?)<\/(?:[a-z_][\w.-]*:)?formula>/gi,
    ),
  ].map((match) => decodeXml(match[1] ?? ""));
}

/** A cellIs formula is either a number or a quoted literal in the Core v1 model. */
function asValue(value: string | undefined): number | string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^"(?:[^"]|"")*"$/.test(trimmed)) return trimmed.slice(1, -1).replace(/""/g, '"');
  const numeric = Number(trimmed);
  return trimmed !== "" && Number.isFinite(numeric) ? numeric : undefined;
}

function readCondition(
  type: string,
  operator: string | undefined,
  body: string,
  attrs: string,
): SheetConditionalFormatRule["condition"] | null {
  const values = formulae(body);
  if (type === "cellIs") {
    if (
      !operator ||
      !/^(greaterThan|greaterThanOrEqual|lessThan|lessThanOrEqual|equal|notEqual|between|notBetween)$/.test(
        operator,
      )
    )
      return null;
    const value = asValue(values[0]);
    if (value === undefined) return null;
    const secondValue = asValue(values[1]);
    if (/^(between|notBetween)$/.test(operator) && secondValue === undefined) return null;
    return {
      kind: "cellValue",
      operator: operator as Extract<
        SheetConditionalFormatRule["condition"],
        { kind: "cellValue" }
      >["operator"],
      value,
      ...(secondValue === undefined ? {} : { secondValue }),
    };
  }
  if (type === "expression") {
    if (values[0] === undefined) return null;
    return {
      kind: "formula",
      formula: values[0].startsWith("=") ? values[0] : `=${values[0]}`,
    };
  }
  const textOperator = (
    {
      containsText: "contains",
      notContainsText: "notContains",
      beginsWith: "beginsWith",
      endsWith: "endsWith",
    } as const
  )[type];
  if (textOperator) {
    const text = attribute(attrs, "text");
    if (text === undefined) return null;
    return { kind: "text", operator: textOperator, text };
  }
  if (type === "containsBlanks" || type === "notContainsBlanks")
    return { kind: "blank", blank: type === "containsBlanks" };
  if (type === "duplicateValues" || type === "uniqueValues")
    return { kind: "duplicate", unique: type === "uniqueValues" };
  return null;
}

function childElements(body: string, name: string): Array<{ attributes: string; body: string }> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    ...body.matchAll(
      new RegExp(
        `<(?:(?:[a-z_][\\w.-]*:)?${escaped})\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:(?:[a-z_][\\w.-]*:)?${escaped})>)`,
        "gi",
      ),
    ),
  ].map((match) => ({ attributes: match[1] ?? "", body: match[2] ?? "" }));
}

function readThreshold(attributes: string): ConditionalFormatThreshold | null {
  const kind = attribute(attributes, "type");
  if (kind === "min" || kind === "max") return { kind };
  if (kind !== "num" && kind !== "percent" && kind !== "percentile") return null;
  const value = Number(attribute(attributes, "val"));
  return Number.isFinite(value) ? { kind, value } : null;
}

function hasUnsupportedThresholdSemantics(entries: readonly { attributes: string }[]): boolean {
  return entries.some((entry) => /^(0|false)$/i.test(attribute(entry.attributes, "gte") ?? "1"));
}

function thresholdXml(threshold: ConditionalFormatThreshold): string {
  return threshold.kind === "min" || threshold.kind === "max"
    ? `<cfvo type="${threshold.kind}"/>`
    : `<cfvo type="${threshold.kind}" val="${threshold.value}"/>`;
}

function readColor(attributes: string): string | undefined {
  return rgb(attribute(attributes, "rgb"));
}

const ICON_SET_FROM_XLSX: Record<string, ConditionalFormatIconSet> = {
  "3Arrows": "threeArrows",
  "3ArrowsGray": "threeArrowsGray",
  "3Flags": "threeFlags",
  "3TrafficLights1": "threeTrafficLights",
  "3TrafficLights2": "threeTrafficLightsRimmed",
  "3Signs": "threeSigns",
  // OOXML names the circled variant 3Symbols and the plain variant 3Symbols2.
  "3Symbols": "threeSymbolsCircled",
  "3Symbols2": "threeSymbols",
  "4Arrows": "fourArrows",
  "4ArrowsGray": "fourArrowsGray",
  "4RedToBlack": "fourRedToBlack",
  "4Rating": "fourRatings",
  "4TrafficLights": "fourTrafficLights",
  "5Arrows": "fiveArrows",
  "5ArrowsGray": "fiveArrowsGray",
  "5Rating": "fiveRatings",
  "5Quarters": "fiveQuarters",
  "3Stars": "threeStars",
  "3Triangles": "threeTriangles",
  "5Boxes": "fiveBoxes",
};
const X14_ONLY_ICON_SETS = new Set<ConditionalFormatIconSet>([
  "threeStars",
  "threeTriangles",
  "fiveBoxes",
]);
const ICON_SET_TO_XLSX: Record<ConditionalFormatIconSet, string> = Object.fromEntries(
  Object.entries(ICON_SET_FROM_XLSX).map(([name, value]) => [value, name]),
) as Record<ConditionalFormatIconSet, string>;

function readVisualCondition(
  type: string,
  body: string,
  attrs: string,
): {
  condition: SheetConditionalFormatRule["condition"] | null;
  unsupported: boolean;
} | null {
  if (type === "top10") {
    const count = Number(attribute(attrs, "rank") ?? "10");
    return Number.isInteger(count) && count >= 1
      ? {
          condition: {
            kind: "rank",
            count,
            ...(truthy(attribute(attrs, "percent")) ? { percent: true } : {}),
            ...(truthy(attribute(attrs, "bottom")) ? { bottom: true } : {}),
          },
          unsupported: false,
        }
      : { condition: null, unsupported: true };
  }
  if (type === "aboveAverage") {
    const stdDev = attribute(attrs, "stdDev");
    const parsed = stdDev === undefined ? undefined : Number(stdDev);
    return parsed !== undefined && (!Number.isInteger(parsed) || parsed < 0 || parsed > 3)
      ? { condition: null, unsupported: true }
      : {
          condition: {
            kind: "average",
            above: !/^(0|false)$/i.test(attribute(attrs, "aboveAverage") ?? "1"),
            ...(truthy(attribute(attrs, "equalAverage")) ? { equalAverage: true } : {}),
            ...(parsed === undefined ? {} : { stdDev: parsed }),
          },
          unsupported: false,
        };
  }
  if (type === "timePeriod") {
    const period = attribute(attrs, "timePeriod");
    return period &&
      /^(yesterday|today|tomorrow|last7Days|lastWeek|thisWeek|nextWeek|lastMonth|thisMonth|nextMonth)$/.test(
        period,
      )
      ? {
          condition: {
            kind: "date",
            period: period as Extract<
              SheetConditionalFormatRule["condition"],
              { kind: "date" }
            >["period"],
          },
          unsupported: false,
        }
      : { condition: null, unsupported: true };
  }
  if (type === "dataBar") {
    const dataBar = childElements(body, "dataBar")[0];
    const cfvo = dataBar ? childElements(dataBar.body, "cfvo") : [];
    const color = dataBar
      ? readColor(childElements(dataBar.body, "color")[0]?.attributes ?? "")
      : undefined;
    const minimum = cfvo[0] ? readThreshold(cfvo[0].attributes) : null;
    const maximum = cfvo[1] ? readThreshold(cfvo[1].attributes) : null;
    if (!dataBar || !minimum || !maximum || !color || cfvo.length !== 2)
      return { condition: null, unsupported: true };
    return {
      condition: {
        kind: "dataBar",
        minimum,
        maximum,
        color,
        ...(attribute(dataBar.attributes, "gradient") === "0" ? { gradient: false } : {}),
        ...(attribute(dataBar.attributes, "showValue") === "0" ? { showValue: false } : {}),
      },
      unsupported:
        hasUnsupportedThresholdSemantics(cfvo) ||
        attribute(dataBar.attributes, "minLength") !== undefined ||
        attribute(dataBar.attributes, "maxLength") !== undefined ||
        /<(?:x14:)?(?:borderColor|negativeFillColor|axisColor)\b/i.test(dataBar.body),
    };
  }
  if (type === "colorScale") {
    const scale = childElements(body, "colorScale")[0];
    const thresholds = scale
      ? childElements(scale.body, "cfvo").map((entry) => readThreshold(entry.attributes))
      : [];
    const colors = scale
      ? childElements(scale.body, "color").map((entry) => readColor(entry.attributes))
      : [];
    const cfvo = scale ? childElements(scale.body, "cfvo") : [];
    if (
      !scale ||
      thresholds.length !== colors.length ||
      (thresholds.length !== 2 && thresholds.length !== 3) ||
      thresholds.some((value) => !value) ||
      colors.some((value) => !value)
    )
      return { condition: null, unsupported: true };
    return {
      condition: {
        kind: "colorScale",
        stops: thresholds.map((threshold, index) => ({
          threshold: threshold!,
          color: colors[index]!,
        })) as Extract<SheetConditionalFormatRule["condition"], { kind: "colorScale" }>["stops"],
      },
      unsupported: hasUnsupportedThresholdSemantics(cfvo),
    };
  }
  if (type === "iconSet") {
    const iconSet = childElements(body, "iconSet")[0];
    const name = iconSet
      ? ICON_SET_FROM_XLSX[attribute(iconSet.attributes, "iconSet") ?? "3TrafficLights1"]
      : undefined;
    const thresholds = iconSet
      ? childElements(iconSet.body, "cfvo").map((entry) => readThreshold(entry.attributes))
      : [];
    const cfvo = iconSet ? childElements(iconSet.body, "cfvo") : [];
    if (!iconSet || !name || X14_ONLY_ICON_SETS.has(name) || thresholds.some((value) => !value))
      return { condition: null, unsupported: true };
    return {
      condition: {
        kind: "iconSet",
        iconSet: name,
        thresholds: thresholds as ConditionalFormatThreshold[],
        ...(truthy(attribute(iconSet.attributes, "reverse")) ? { reverse: true } : {}),
        ...(attribute(iconSet.attributes, "showValue") === "0" ? { showValue: false } : {}),
      },
      unsupported: hasUnsupportedThresholdSemantics(cfvo),
    };
  }
  return null;
}

export function readXlsxConditionalFormats(
  worksheetXml: string,
  stylesXml: string | undefined,
  sheetIndex: number,
  report: CompatibilityReportBuilder,
): ConditionalFormatRead {
  const dxfs = readDxfs(stylesXml);
  const rules: SheetConditionalFormatRule[] = [];
  const priorities = new Map<string, number>();
  let unsupported = false;
  let ordinal = 0;
  if (/<x14:conditionalFormatting\b/i.test(worksheetXml)) {
    unsupported = true;
    report.add("feature-omitted", "warning", `sheet${sheetIndex + 1}.conditionalFormatting.x14`);
  }
  for (const container of worksheetXml.matchAll(
    /<(?!(?:x14|x14ac):)(?:[a-z_][\w.-]*:)?conditionalFormatting\b([^>]*)>([\s\S]*?)<\/(?!(?:x14|x14ac):)(?:[a-z_][\w.-]*:)?conditionalFormatting>/gi,
  )) {
    const ranges = rangesFromSqref(attribute(container[1] ?? "", "sqref"));
    for (const rule of (container[2] ?? "").matchAll(
      /<(?!(?:x14|x14ac):)(?:[a-z_][\w.-]*:)?cfRule\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?!(?:x14|x14ac):)(?:[a-z_][\w.-]*:)?cfRule>)/gi,
    )) {
      ordinal += 1;
      const location = `sheet${sheetIndex + 1}.conditionalFormatting[${ordinal}]`;
      const attrs = rule[1] ?? "";
      const type = attribute(attrs, "type") ?? "";
      const visual = readVisualCondition(type, rule[2] ?? "", attrs);
      const condition = ranges
        ? (visual?.condition ??
          readCondition(type, attribute(attrs, "operator"), rule[2] ?? "", attrs))
        : null;
      const dxfId = Number(attribute(attrs, "dxfId"));
      const dxf =
        Number.isInteger(dxfId) && dxfId >= 0
          ? readDxf(dxfs[dxfId])
          : { style: {}, unsupported: attribute(attrs, "dxfId") !== undefined };
      if (dxf.unsupported) report.add("style-omitted", "warning", location);
      if (visual?.unsupported) report.add("feature-omitted", "warning", location);
      const stopIfTrue = truthy(attribute(attrs, "stopIfTrue"));
      // A styleless rule is meaningful only when it stops lower-priority rules.
      const visualRule =
        condition?.kind === "dataBar" ||
        condition?.kind === "colorScale" ||
        condition?.kind === "iconSet";
      if (
        !ranges ||
        !condition ||
        visual?.unsupported ||
        (!Object.keys(dxf.style).length && !stopIfTrue && !visualRule)
      ) {
        unsupported = true;
        report.add("feature-omitted", "warning", location);
        continue;
      }
      const id = `xlsx-conditional-format-${sheetIndex + 1}-${ordinal}`;
      priorities.set(id, Number(attribute(attrs, "priority")) || ordinal);
      const candidate: SheetConditionalFormatRule = {
        id,
        ranges,
        anchor: { ...ranges[0]!.start },
        condition,
        style: dxf.style,
        ...(stopIfTrue ? { stopIfTrue: true } : {}),
      };
      try {
        rules.push(normalizeConditionalFormatRules([candidate])[0]!);
      } catch {
        unsupported = true;
        priorities.delete(id);
        report.add("feature-omitted", "warning", location);
      }
    }
  }
  rules.sort((left, right) => (priorities.get(left.id) ?? 0) - (priorities.get(right.id) ?? 0));
  return { rules, unsupported };
}

/**
 * Resolves worksheet parts through workbook relationships, because worksheet
 * order is not required to match the sheetN.xml suffix.
 */
export function readXlsxConditionalFormatMetadata(
  bytes: Uint8Array,
  report: CompatibilityReportBuilder,
): ConditionalFormatRead[] {
  const entries = unzipSync(bytes);
  const workbook = entries["xl/workbook.xml"];
  const relationships = entries["xl/_rels/workbook.xml.rels"];
  const styles = entries["xl/styles.xml"];
  if (!workbook || !relationships) return [];
  const targets = new Map<string, string>();
  for (const relation of strFromU8(relationships).matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = relation[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    if (!id || !target || !/\/worksheet$/i.test(attribute(attrs, "Type") ?? "")) continue;
    const pathSegments = target.replace(/^\/+/, "").split("/");
    const normalized = (target.startsWith("/") ? pathSegments : ["xl", ...pathSegments])
      .reduce<string[]>((path, segment) => {
        if (!segment || segment === ".") return path;
        if (segment === "..") {
          path.pop();
          return path;
        }
        path.push(segment);
        return path;
      }, [])
      .join("/");
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(normalized)) targets.set(id, normalized);
  }
  const stylesXml = styles ? strFromU8(styles) : undefined;
  return [...strFromU8(workbook).matchAll(/<sheet\b([^>]*)\/?\s*>/gi)].map((sheet, index) => {
    const path = targets.get(attribute(sheet[1] ?? "", "r:id") ?? "");
    return readXlsxConditionalFormats(
      path ? strFromU8(entries[path] ?? new Uint8Array()) : "",
      stylesXml,
      index,
      report,
    );
  });
}

function dxfXml(style: SheetConditionalFormatRule["style"]): string {
  const font =
    style.bold !== undefined || style.italic !== undefined || style.textColor
      ? `<font>${style.bold === undefined ? "" : `<b val="${style.bold ? 1 : 0}"/>`}${style.italic === undefined ? "" : `<i val="${style.italic ? 1 : 0}"/>`}${style.textColor ? `<color rgb="FF${style.textColor.slice(1).toUpperCase()}"/>` : ""}</font>`
      : "";
  const fill = style.fillColor
    ? `<fill><patternFill patternType="solid"><fgColor rgb="FF${style.fillColor.slice(1).toUpperCase()}"/><bgColor rgb="FF${style.fillColor.slice(1).toUpperCase()}"/></patternFill></fill>`
    : "";
  return `<dxf>${font}${fill}</dxf>`;
}

function quoteFormulaText(text: string): string {
  return text.replace(/"/g, '""');
}

/** SEARCH interprets *, ? and ~ as wildcards; Core text conditions do not. */
function searchFormulaText(text: string): string {
  return quoteFormulaText(text).replace(/[~*?]/g, "~$&");
}

function cellFormulaValue(value: number | string): string {
  return typeof value === "number" ? String(value) : `"${quoteFormulaText(value)}"`;
}

function ruleXml(rule: SheetConditionalFormatRule, priority: number, dxfId: number): string {
  const dxf = Object.keys(rule.style).length ? ` dxfId="${dxfId}"` : "";
  const stop = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
  // OOXML conditions are evaluated relative to the first sqref cell. The Core
  // anchor can survive a partial clear, so rebase before serializing it.
  const rangeAnchor = rule.ranges[0]!.start;
  const anchor = `${columnLabel(rangeAnchor.column)}${rangeAnchor.row + 1}`;
  const condition = rule.condition;
  if (condition.kind === "cellValue") {
    const values = [condition.value, condition.secondValue].filter((value) => value !== undefined);
    return `<cfRule type="cellIs" operator="${condition.operator}" priority="${priority}"${dxf}${stop}>${values.map((value) => `<formula>${encodeXml(cellFormulaValue(value))}</formula>`).join("")}</cfRule>`;
  }
  if (condition.kind === "formula")
    return `<cfRule type="expression" priority="${priority}"${dxf}${stop}><formula>${encodeXml(translateFormulaForCopy(condition.formula, { row: rangeAnchor.row - rule.anchor.row, column: rangeAnchor.column - rule.anchor.column }).replace(/^=/, ""))}</formula></cfRule>`;
  if (condition.kind === "text") {
    const type = (
      {
        contains: "containsText",
        notContains: "notContainsText",
        beginsWith: "beginsWith",
        endsWith: "endsWith",
      } as const
    )[condition.operator];
    const formula =
      condition.operator === "contains"
        ? `NOT(ISERROR(SEARCH("${searchFormulaText(condition.text)}",${anchor})))`
        : condition.operator === "notContains"
          ? `ISERROR(SEARCH("${searchFormulaText(condition.text)}",${anchor}))`
          : condition.operator === "beginsWith"
            ? `LEFT(${anchor},${condition.text.length})="${quoteFormulaText(condition.text)}"`
            : `RIGHT(${anchor},${condition.text.length})="${quoteFormulaText(condition.text)}"`;
    return `<cfRule type="${type}" operator="${type}" text="${encodeXml(condition.text)}" priority="${priority}"${dxf}${stop}><formula>${encodeXml(formula)}</formula></cfRule>`;
  }
  if (condition.kind === "blank") {
    const type = condition.blank ? "containsBlanks" : "notContainsBlanks";
    const formula = condition.blank ? `LEN(TRIM(${anchor}))=0` : `LEN(TRIM(${anchor}))>0`;
    return `<cfRule type="${type}" priority="${priority}"${dxf}${stop}><formula>${formula}</formula></cfRule>`;
  }
  if (condition.kind === "duplicate") {
    const type = condition.unique ? "uniqueValues" : "duplicateValues";
    return `<cfRule type="${type}" priority="${priority}"${dxf}${stop}/>`;
  }
  if (condition.kind === "rank")
    return `<cfRule type="top10" priority="${priority}"${dxf}${stop} rank="${condition.count}"${condition.percent ? ' percent="1"' : ""}${condition.bottom ? ' bottom="1"' : ""}/>`;
  if (condition.kind === "average")
    return `<cfRule type="aboveAverage" priority="${priority}"${dxf}${stop}${condition.above ? "" : ' aboveAverage="0"'}${condition.equalAverage ? ' equalAverage="1"' : ""}${condition.stdDev === undefined ? "" : ` stdDev="${condition.stdDev}"`}/>`;
  if (condition.kind === "date")
    return `<cfRule type="timePeriod" priority="${priority}"${dxf}${stop} timePeriod="${condition.period}"/>`;
  if (condition.kind === "dataBar") {
    return `<cfRule type="dataBar" priority="${priority}"><dataBar${condition.showValue === false ? ' showValue="0"' : ""}>${thresholdXml(condition.minimum)}${thresholdXml(condition.maximum)}<color rgb="FF${condition.color.slice(1).toUpperCase()}"/></dataBar></cfRule>`;
  }
  if (condition.kind === "colorScale")
    return `<cfRule type="colorScale" priority="${priority}"><colorScale>${condition.stops.map((stop) => thresholdXml(stop.threshold)).join("")}${condition.stops.map((stop) => `<color rgb="FF${stop.color.slice(1).toUpperCase()}"/>`).join("")}</colorScale></cfRule>`;
  return `<cfRule type="iconSet" priority="${priority}"><iconSet iconSet="${ICON_SET_TO_XLSX[condition.iconSet]}"${condition.reverse ? ' reverse="1"' : ""}${condition.showValue === false ? ' showValue="0"' : ""}>${condition.thresholds.map(thresholdXml).join("")}</iconSet></cfRule>`;
}

/** Add first-release conditional formats after ExcelJS has produced its base archive. */
export function writeXlsxConditionalFormats(
  entries: Record<string, Uint8Array>,
  sheets: readonly SheetConditionalFormatRule[][],
  report?: CompatibilityReportBuilder,
): void {
  const styles = entries["xl/styles.xml"];
  if (!styles) throw new Error("Missing generated XLSX styles.");
  const serializableSheets = sheets.map((rules, sheetIndex) =>
    rules.filter((rule) => {
      if (rule.condition.kind !== "iconSet" || !X14_ONLY_ICON_SETS.has(rule.condition.iconSet))
        return true;
      report?.add(
        "feature-omitted",
        "warning",
        `sheet${sheetIndex + 1}.conditionalFormatting.${rule.id}.${rule.condition.iconSet}`,
      );
      return false;
    }),
  );
  const allRules = serializableSheets.flat();
  if (!allRules.length) return;
  const dxfs = allRules.map((rule) => dxfXml(rule.style));
  const stylesXml = strFromU8(styles);
  const previous = /<dxfs\b[^>]*>[\s\S]*?<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i;
  const dxfContainer = `<dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs>`;
  entries["xl/styles.xml"] = strToU8(
    previous.test(stylesXml)
      ? stylesXml.replace(previous, dxfContainer)
      : stylesXml.replace(/<tableStyles\b/i, `${dxfContainer}<tableStyles`),
  );
  let priority = 1;
  let dxfId = 0;
  for (const [sheetIndex, rules] of serializableSheets.entries()) {
    if (!rules.length) continue;
    const path = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    const xml = strFromU8(entry);
    const body = rules
      .map((rule) => {
        const next = ruleXml(rule, priority, dxfId);
        if (
          rule.condition.kind === "dataBar" &&
          (rule.condition.negativeColor !== undefined || rule.condition.gradient === false)
        )
          report?.add(
            "feature-omitted",
            "warning",
            `sheet${sheetIndex + 1}.conditionalFormatting.${rule.id}.dataBarExtension`,
          );
        priority += 1;
        dxfId += 1;
        return `<conditionalFormatting sqref="${rule.ranges.map(rangeReference).join(" ")}">${next}</conditionalFormatting>`;
      })
      .join("");
    // Schema order: after merges and before data validations/extensions.
    const target =
      /<dataValidations\b|<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<extLst\b|<\/worksheet>/i;
    entries[path] = strToU8(
      target.test(xml)
        ? xml.replace(target, `${body}$&`)
        : xml.replace(/<\/worksheet>/i, `${body}</worksheet>`),
    );
  }
}
