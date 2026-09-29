import { strFromU8, strToU8, unzipSync } from "fflate/browser";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type CellRange } from "@idea10/core/workbook";
import {
  conditionalFormatFormulaSources,
  normalizeConditionalFormatRules,
  type ConditionalFormatStyle,
  type ConditionalFormatIconSet,
  type ConditionalFormatOperand,
  type ConditionalFormatThreshold,
  type SheetConditionalFormatRule,
} from "@idea10/core/conditional-formatting";
import { translateFormulaForCopy } from "@idea10/core/formula";
import {
  CELL_BORDER_LINE_STYLES,
  CELL_FILL_PATTERNS,
  type CellBorder,
  type CellFillGradient,
  type CellFillPatternStyle,
} from "@idea10/core/style";
import { CompatibilityReportBuilder } from "./report.js";
import { fromExcelNumberFormat, toExcelNumberFormat } from "./number-format.js";

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

function differentialBoolean(xml: string, element: string): boolean | undefined {
  const attrs = new RegExp(`<(?:[a-z_][\\w.-]*:)?${element}\\b([^>]*)\\/?\\s*>`, "i").exec(
    xml,
  )?.[1];
  if (attrs === undefined) return undefined;
  return !/^(0|false)$/i.test(attribute(attrs, "val") ?? "1");
}

function readDxf(xml: string | undefined): {
  style: SheetConditionalFormatRule["style"];
  unsupported: boolean;
} {
  if (!xml) return { style: {}, unsupported: false };
  let unsupported = false;
  const style: SheetConditionalFormatRule["style"] = {};
  const font = childElements(xml, "font")[0]?.body;
  if (font !== undefined) {
    const bold = differentialBoolean(font, "b");
    const italic = differentialBoolean(font, "i");
    const strikethrough = differentialBoolean(font, "strike");
    if (bold !== undefined) style.bold = bold;
    if (italic !== undefined) style.italic = italic;
    if (strikethrough !== undefined) style.strikethrough = strikethrough;
    const name = childElements(font, "name")[0];
    if (name) {
      const value = attribute(name.attributes, "val");
      if (value && value.length <= 80) style.fontFamily = value;
      else unsupported = true;
    }
    const size = childElements(font, "sz")[0];
    if (size) {
      const value = Number(attribute(size.attributes, "val"));
      if (Number.isInteger(value) && value >= 8 && value <= 72) style.fontSize = value;
      else unsupported = true;
    }
    const underline = childElements(font, "u")[0];
    if (underline) {
      const value = attribute(underline.attributes, "val") ?? "single";
      if (value === "none") style.underline = false;
      else if (value === "single") style.underline = true;
      else if (value === "double" || value === "singleAccounting" || value === "doubleAccounting")
        style.underline = value;
      else unsupported = true;
    }
    const script = childElements(font, "vertAlign")[0];
    if (script) {
      const value = attribute(script.attributes, "val");
      if (value === "superscript" || value === "subscript") style.fontScript = value;
      else if (value === "baseline") style.fontScript = false;
      else unsupported = true;
    }
    const color = childElements(font, "color")[0];
    if (color) {
      const value = rgb(attribute(color.attributes, "rgb"));
      if (value) style.textColor = value;
      else if (truthy(attribute(color.attributes, "auto"))) style.textColor = false;
      else unsupported = true;
    }
    const allowed = new Set(["b", "i", "strike", "name", "sz", "u", "vertAlign", "color"]);
    if (
      [...font.matchAll(/<\/?(?:[a-z_][\w.-]*:)?([a-z_][\w.-]*)\b[^>]*>/gi)].some(
        (entry) => !allowed.has(entry[1] ?? ""),
      )
    )
      unsupported = true;
  }
  const fill = childElements(xml, "fill")[0]?.body;
  if (fill !== undefined) {
    const pattern = childElements(fill, "patternFill")[0];
    const gradient = childElements(fill, "gradientFill")[0];
    if (pattern && gradient) unsupported = true;
    else if (pattern) {
      const declaredPatternType = attribute(pattern.attributes, "patternType");
      const foreground = childElements(pattern.body, "fgColor")[0];
      const background = childElements(pattern.body, "bgColor")[0];
      const foregroundColor = foreground && rgb(attribute(foreground.attributes, "rgb"));
      const backgroundColor = background && rgb(attribute(background.attributes, "rgb"));
      // Some DXF writers omit patternType but use bgColor for a solid fill.
      const patternType = declaredPatternType ?? (foreground || background ? "solid" : "none");
      if (patternType === "none") {
        style.fillColor = false;
        style.fillPattern = false;
        style.fillGradient = false;
      } else if (patternType === "solid") {
        const value = foregroundColor ?? backgroundColor;
        if (value) style.fillColor = value;
        else unsupported = true;
      } else if ((CELL_FILL_PATTERNS as readonly string[]).includes(patternType)) {
        style.fillPattern = patternType as CellFillPatternStyle;
        if (foreground && !foregroundColor) unsupported = true;
        if (background && !backgroundColor) unsupported = true;
        if (foregroundColor) style.fillPatternColor = foregroundColor;
        if (backgroundColor) style.fillColor = backgroundColor;
      } else unsupported = true;
    } else if (gradient) {
      const stops = childElements(gradient.body, "stop").map((stop) => {
        const position = Number(attribute(stop.attributes, "position"));
        const color = childElements(stop.body, "color")[0];
        const value = color && rgb(attribute(color.attributes, "rgb"));
        return Number.isFinite(position) && position >= 0 && position <= 1 && value
          ? { position, color: value }
          : undefined;
      });
      const validStops =
        stops.every((stop): stop is { position: number; color: string } => !!stop) &&
        stops.length >= 2 &&
        stops[0]?.position === 0 &&
        stops.at(-1)?.position === 1 &&
        stops.every((stop, index) => index === 0 || stop!.position > stops[index - 1]!.position);
      const type = attribute(gradient.attributes, "type");
      const number = (name: string, fallback?: number) => {
        const value = Number(attribute(gradient.attributes, name));
        return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
      };
      if (!validStops) unsupported = true;
      else if (type === "path") {
        const left = number("left", 0);
        const right = number("right", left);
        const top = number("top", 0);
        const bottom = number("bottom", top);
        if (left === undefined || right === undefined || top === undefined || bottom === undefined)
          unsupported = true;
        else style.fillGradient = { type: "path", left, right, top, bottom, stops };
      } else {
        const angle = Number(attribute(gradient.attributes, "degree") ?? "0");
        if (!Number.isFinite(angle)) unsupported = true;
        else style.fillGradient = { type: "linear", angle, stops };
      }
    } else unsupported = true;
  }
  const numberFormat = childElements(xml, "numFmt")[0];
  if (numberFormat) {
    const parsed = fromExcelNumberFormat(attribute(numberFormat.attributes, "formatCode"));
    if (parsed) style.numberFormat = parsed;
    else if (parsed === null) style.numberFormat = false;
    else if (parsed === undefined) unsupported = true;
  }
  const border = childElements(xml, "border")[0];
  if (border) {
    const sides: Array<
      [
        keyof Pick<
          ConditionalFormatStyle,
          "borderTop" | "borderRight" | "borderBottom" | "borderLeft"
        >,
        string,
      ]
    > = [
      ["borderTop", "top"],
      ["borderRight", "right"],
      ["borderBottom", "bottom"],
      ["borderLeft", "left"],
    ];
    const readBorder = (entry: {
      attributes: string;
      body: string;
    }): CellBorder | false | undefined => {
      const lineStyle = attribute(entry.attributes, "style");
      if (lineStyle === undefined) return false;
      const color = childElements(entry.body, "color")[0];
      const value = color && rgb(attribute(color.attributes, "rgb"));
      return value && (CELL_BORDER_LINE_STYLES as readonly string[]).includes(lineStyle)
        ? { style: lineStyle as CellBorder["style"], color: value }
        : undefined;
    };
    for (const [key, name] of sides) {
      const entry = childElements(border.body, name)[0];
      if (!entry) continue;
      const value = readBorder(entry);
      if (value === undefined) unsupported = true;
      else style[key] = value;
    }
    const diagonal = childElements(border.body, "diagonal")[0];
    if (diagonal) {
      const value = readBorder(diagonal);
      const up = attribute(border.attributes, "diagonalUp");
      const down = attribute(border.attributes, "diagonalDown");
      if (value === undefined) unsupported = true;
      else {
        if (truthy(up)) style.borderDiagonalUp = value;
        else if (/^(0|false)$/i.test(up ?? "")) style.borderDiagonalUp = false;
        if (truthy(down)) style.borderDiagonalDown = value;
        else if (/^(0|false)$/i.test(down ?? "")) style.borderDiagonalDown = false;
      }
    }
    const allowed = new Set(["top", "right", "bottom", "left", "diagonal"]);
    if (
      [...border.body.matchAll(/<\/?(?:[a-z_][\w.-]*:)?([a-z_][\w.-]*)\b[^>]*>/gi)].some(
        (entry) => !allowed.has(entry[1] ?? "") && entry[1] !== "color",
      )
    )
      unsupported = true;
  }
  if (/<(?:[a-z_][\w.-]*:)?(?:alignment|protection)\b/i.test(xml)) unsupported = true;
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

/** A cellIs formula may be a literal or an arbitrary Core formula expression. */
function asOperand(value: string | undefined): ConditionalFormatOperand | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^"(?:[^"]|"")*"$/.test(trimmed)) return trimmed.slice(1, -1).replace(/""/g, '"');
  const numeric = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(numeric)) return numeric;
  return trimmed !== ""
    ? { formula: trimmed.startsWith("=") ? trimmed : `=${trimmed}` }
    : undefined;
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
    const value = asOperand(values[0]);
    if (value === undefined) return null;
    const secondValue = asOperand(values[1]);
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
  if (kind === "formula") {
    const formula = attribute(attributes, "val")?.trim();
    return formula ? { kind, formula: formula.startsWith("=") ? formula : `=${formula}` } : null;
  }
  if (kind !== "num" && kind !== "percent" && kind !== "percentile") return null;
  const value = Number(attribute(attributes, "val"));
  return Number.isFinite(value) ? { kind, value } : null;
}

function hasUnsupportedThresholdSemantics(entries: readonly { attributes: string }[]): boolean {
  return entries.some((entry) => /^(0|false)$/i.test(attribute(entry.attributes, "gte") ?? "1"));
}

function formulaForXlsx(formula: string, rowOffset: number, columnOffset: number): string {
  return translateFormulaForCopy(formula, { row: rowOffset, column: columnOffset }).replace(
    /^=/,
    "",
  );
}

function thresholdXml(
  threshold: ConditionalFormatThreshold,
  rowOffset = 0,
  columnOffset = 0,
): string {
  return threshold.kind === "min" || threshold.kind === "max"
    ? `<cfvo type="${threshold.kind}"/>`
    : threshold.kind === "autoMin" || threshold.kind === "autoMax"
      ? `<cfvo type="${threshold.kind === "autoMin" ? "min" : "max"}"/>`
      : threshold.kind === "formula"
        ? `<cfvo type="formula" val="${encodeXml(formulaForXlsx(threshold.formula, rowOffset, columnOffset))}"/>`
        : `<cfvo type="${threshold.kind}" val="${threshold.value}"/>`;
}

function x14ThresholdXml(
  threshold: ConditionalFormatThreshold,
  rowOffset = 0,
  columnOffset = 0,
): string {
  const kind = threshold.kind === "min" || threshold.kind === "max" ? "percent" : threshold.kind;
  const value =
    threshold.kind === "min"
      ? "0"
      : threshold.kind === "max"
        ? "100"
        : threshold.kind === "autoMin" || threshold.kind === "autoMax"
          ? "0"
          : threshold.kind === "formula"
            ? formulaForXlsx(threshold.formula, rowOffset, columnOffset)
            : String(threshold.value);
  return `<x14:cfvo type="${kind}"><xm:f>${encodeXml(value)}</xm:f></x14:cfvo>`;
}

function readX14Threshold(entry: {
  attributes: string;
  body: string;
}): ConditionalFormatThreshold | null {
  const kind = attribute(entry.attributes, "type");
  if (kind === "min" || kind === "max") return { kind };
  if (kind === "formula") {
    const formula = decodeXml(childElements(entry.body, "f")[0]?.body ?? "").trim();
    return formula ? { kind, formula: formula.startsWith("=") ? formula : `=${formula}` } : null;
  }
  if (kind !== "num" && kind !== "percent" && kind !== "percentile") return null;
  const formula = decodeXml(childElements(entry.body, "f")[0]?.body ?? "").trim();
  if (!formula) return null;
  const value = Number(formula);
  return Number.isFinite(value) ? { kind, value } : null;
}

/** x14 adds autoMin/autoMax for data bars. They are deliberately not accepted
 * by the generic threshold reader: icon sets and colour scales cannot use them. */
function readX14DataBarThreshold(entry: {
  attributes: string;
  body: string;
}): ConditionalFormatThreshold | null {
  const kind = attribute(entry.attributes, "type");
  if (kind === "autoMin") return { kind: "autoMin" };
  if (kind === "autoMax") return { kind: "autoMax" };
  return readX14Threshold(entry);
}

function baseDataBarThreshold(threshold: ConditionalFormatThreshold): ConditionalFormatThreshold {
  // Office 2007 does not know the automatic-zero bounds. Its closest usable
  // fallback is the range min/max; Office 2010+ reads the linked x14 rule.
  if (threshold.kind === "autoMin") return { kind: "min" };
  if (threshold.kind === "autoMax") return { kind: "max" };
  return threshold;
}

function x14DataBarThresholdXml(
  threshold: ConditionalFormatThreshold,
  rowOffset = 0,
  columnOffset = 0,
): string {
  if (threshold.kind === "autoMin" || threshold.kind === "autoMax")
    return `<x14:cfvo type="${threshold.kind}"/>`;
  if (threshold.kind === "min" || threshold.kind === "max")
    return `<x14:cfvo type="${threshold.kind}"/>`;
  return x14ThresholdXml(threshold, rowOffset, columnOffset);
}

function readColor(attributes: string): string | undefined {
  return rgb(attribute(attributes, "rgb"));
}

function dataBarBaseExtensionId(attributes: string, body: string): string | undefined {
  // Excel links its standard rule through a rule-local extLst. Accept the
  // attribute form too, because a few producers emit that nonstandard shape.
  return (childElements(body, "id")[0]?.body.trim() || attribute(attributes, "id"))?.toUpperCase();
}

type DataBarCondition = Extract<SheetConditionalFormatRule["condition"], { kind: "dataBar" }>;

function readX14DataBar(
  entry: { attributes: string; body: string },
  base: DataBarCondition,
): DataBarCondition | null {
  const cfvo = childElements(entry.body, "cfvo");
  const minimum = cfvo[0] ? readX14DataBarThreshold(cfvo[0]) : base.minimum;
  const maximum = cfvo[1] ? readX14DataBarThreshold(cfvo[1]) : base.maximum;
  const fillColor =
    readColor(childElements(entry.body, "fillColor")[0]?.attributes ?? "") ?? base.color;
  const border = truthy(attribute(entry.attributes, "border"));
  const negativeSame = truthy(attribute(entry.attributes, "negativeBarColorSameAsPositive"));
  const negativeBorderSame =
    attribute(entry.attributes, "negativeBarBorderColorSameAsPositive") === undefined ||
    truthy(attribute(entry.attributes, "negativeBarBorderColorSameAsPositive"));
  const axisPosition = attribute(entry.attributes, "axisPosition") ?? "automatic";
  const direction = attribute(entry.attributes, "direction") ?? "context";
  const borderColor = readColor(childElements(entry.body, "borderColor")[0]?.attributes ?? "");
  const negativeColor = readColor(
    childElements(entry.body, "negativeFillColor")[0]?.attributes ?? "",
  );
  const negativeBorderColor = readColor(
    childElements(entry.body, "negativeBorderColor")[0]?.attributes ?? "",
  );
  const axisColor = readColor(childElements(entry.body, "axisColor")[0]?.attributes ?? "");
  if (
    (cfvo.length !== 0 && cfvo.length !== 2) ||
    !minimum ||
    !maximum ||
    !fillColor ||
    hasUnsupportedThresholdSemantics(cfvo) ||
    (border && !borderColor) ||
    (!negativeSame && !negativeColor) ||
    (border && !negativeBorderSame && !negativeBorderColor) ||
    (axisPosition !== "automatic" && axisPosition !== "middle" && axisPosition !== "none") ||
    (direction !== "context" && direction !== "leftToRight" && direction !== "rightToLeft") ||
    (axisPosition !== "none" && !axisColor)
  )
    return null;
  return {
    kind: "dataBar",
    minimum,
    maximum,
    color: fillColor,
    ...(border ? { borderColor: borderColor! } : {}),
    ...(negativeSame ? {} : { negativeColor: negativeColor! }),
    ...(border && !negativeBorderSame ? { negativeBorderColor: negativeBorderColor! } : {}),
    ...(attribute(entry.attributes, "gradient") === undefined
      ? base.gradient === false
        ? { gradient: false }
        : {}
      : attribute(entry.attributes, "gradient") === "0" ||
          /^false$/i.test(attribute(entry.attributes, "gradient") ?? "")
        ? { gradient: false }
        : {}),
    ...(attribute(entry.attributes, "showValue") === undefined
      ? base.showValue === false
        ? { showValue: false }
        : {}
      : attribute(entry.attributes, "showValue") === "0" ||
          /^false$/i.test(attribute(entry.attributes, "showValue") ?? "")
        ? { showValue: false }
        : {}),
    ...(direction === "context" ? {} : { direction }),
    ...(axisPosition === "automatic" ? {} : { axisPosition }),
    ...(axisPosition === "none" || axisColor === "#000000" ? {} : { axisColor: axisColor! }),
  };
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
        ...(/^(0|false)$/i.test(attribute(iconSet.attributes, "showValue") ?? "")
          ? { showValue: false }
          : {}),
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
  const dataBarsByExtensionId = new Map<string, number>();
  let unsupported = false;
  let ordinal = 0;
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
        const extensionId = dataBarBaseExtensionId(attrs, rule[2] ?? "");
        if (condition.kind === "dataBar" && extensionId)
          dataBarsByExtensionId.set(extensionId.toUpperCase(), rules.length - 1);
      } catch {
        unsupported = true;
        priorities.delete(id);
        report.add("feature-omitted", "warning", location);
      }
    }
  }
  for (const container of worksheetXml.matchAll(
    /<x14:conditionalFormatting\b([^>]*)>([\s\S]*?)<\/x14:conditionalFormatting>/gi,
  )) {
    const containerAttributes = container[1] ?? "";
    const containerBody = container[2] ?? "";
    const ranges = rangesFromSqref(childElements(containerBody, "sqref")[0]?.body.trim());
    for (const rule of childElements(containerBody, "cfRule")) {
      ordinal += 1;
      const location = `sheet${sheetIndex + 1}.conditionalFormatting[${ordinal}]`;
      const type = attribute(rule.attributes, "type");
      if (type === "dataBar") {
        const extensionId = attribute(rule.attributes, "id")?.toUpperCase();
        const index =
          extensionId === undefined ? undefined : dataBarsByExtensionId.get(extensionId);
        const base = index === undefined ? undefined : rules[index];
        const dataBar =
          base?.condition.kind === "dataBar"
            ? readX14DataBar(
                childElements(rule.body, "dataBar")[0] ?? { attributes: "", body: "" },
                base.condition,
              )
            : null;
        if (index === undefined || !dataBar || !ranges) {
          unsupported = true;
          report.add("feature-omitted", "warning", location);
          continue;
        }
        if (!base || base.condition.kind !== "dataBar") {
          unsupported = true;
          report.add("feature-omitted", "warning", location);
          continue;
        }
        try {
          rules[index] = normalizeConditionalFormatRules([
            { ...base, ranges, anchor: { ...ranges[0]!.start }, condition: dataBar },
          ])[0]!;
        } catch {
          unsupported = true;
          report.add("feature-omitted", "warning", location);
        }
        continue;
      }
      const iconSet = childElements(rule.body, "iconSet")[0];
      const ruleOutsideIconSet = rule.body.replace(
        /<x14:iconSet\b[^>]*>[\s\S]*?<\/x14:iconSet>/gi,
        "",
      );
      const name = iconSet
        ? ICON_SET_FROM_XLSX[attribute(iconSet.attributes, "iconSet") ?? ""]
        : undefined;
      const cfvo = iconSet ? childElements(iconSet.body, "cfvo") : [];
      const thresholds = cfvo.map(readX14Threshold);
      if (
        type !== "iconSet" ||
        !ranges ||
        !iconSet ||
        !name ||
        !X14_ONLY_ICON_SETS.has(name) ||
        truthy(attribute(containerAttributes, "activePresent")) ||
        truthy(attribute(rule.attributes, "activePresent")) ||
        truthy(attribute(iconSet.attributes, "custom")) ||
        childElements(iconSet.body, "cfIcon").length > 0 ||
        childElements(ruleOutsideIconSet, "f").length > 0 ||
        thresholds.some((value) => !value) ||
        hasUnsupportedThresholdSemantics(cfvo)
      ) {
        unsupported = true;
        report.add("feature-omitted", "warning", location);
        continue;
      }
      const id = `xlsx-conditional-format-${sheetIndex + 1}-${ordinal}`;
      priorities.set(id, Number(attribute(rule.attributes, "priority")) || ordinal);
      const candidate: SheetConditionalFormatRule = {
        id,
        ranges,
        anchor: { ...ranges[0]!.start },
        condition: {
          kind: "iconSet",
          iconSet: name,
          thresholds: thresholds as ConditionalFormatThreshold[],
          ...(truthy(attribute(iconSet.attributes, "reverse")) ? { reverse: true } : {}),
          ...(/^(0|false)$/i.test(attribute(iconSet.attributes, "showValue") ?? "")
            ? { showValue: false }
            : {}),
        },
        style: {},
        ...(truthy(attribute(rule.attributes, "stopIfTrue")) ? { stopIfTrue: true } : {}),
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

function dxfColor(tag: string, color: string): string {
  return `<${tag} rgb="FF${color.slice(1).toUpperCase()}"/>`;
}

function dxfGradientXml(gradient: CellFillGradient): string {
  const attributes =
    gradient.type === "linear"
      ? ` degree="${gradient.angle}"`
      : ` type="path" left="${gradient.left}" right="${gradient.right}" top="${gradient.top}" bottom="${gradient.bottom}"`;
  return `<gradientFill${attributes}>${gradient.stops.map((stop) => `<stop position="${stop.position}">${dxfColor("color", stop.color)}</stop>`).join("")}</gradientFill>`;
}

function dxfBorderXml(style: ConditionalFormatStyle): string {
  const sides: Array<
    [
      keyof Pick<
        ConditionalFormatStyle,
        "borderTop" | "borderRight" | "borderBottom" | "borderLeft"
      >,
      string,
    ]
  > = [
    ["borderTop", "top"],
    ["borderRight", "right"],
    ["borderBottom", "bottom"],
    ["borderLeft", "left"],
  ];
  const sideXml = sides
    .map(([key, name]) => {
      const border = style[key];
      if (border === undefined) return "";
      if (border === false || border === null) return `<${name}/>`;
      return `<${name} style="${border.style}">${dxfColor("color", border.color)}</${name}>`;
    })
    .join("");
  const up = style.borderDiagonalUp;
  const down = style.borderDiagonalDown;
  if (up === undefined && down === undefined) return sideXml ? `<border>${sideXml}</border>` : "";
  const diagonal =
    up && typeof up === "object" ? up : down && typeof down === "object" ? down : false;
  const diagonalXml =
    diagonal === false
      ? "<diagonal/>"
      : `<diagonal style="${diagonal.style}">${dxfColor("color", diagonal.color)}</diagonal>`;
  return `<border${up === undefined ? "" : ` diagonalUp="${typeof up === "object" ? 1 : 0}"`}${down === undefined ? "" : ` diagonalDown="${typeof down === "object" ? 1 : 0}"`}>${sideXml}${diagonalXml}</border>`;
}

function dxfFillXml(style: ConditionalFormatStyle): string {
  if (style.fillGradient && typeof style.fillGradient === "object")
    return `<fill>${dxfGradientXml(style.fillGradient)}</fill>`;
  if (typeof style.fillPattern === "string")
    return `<fill><patternFill patternType="${style.fillPattern}">${typeof style.fillPatternColor === "string" ? dxfColor("fgColor", style.fillPatternColor) : ""}${typeof style.fillColor === "string" ? dxfColor("bgColor", style.fillColor) : ""}</patternFill></fill>`;
  if (typeof style.fillColor === "string")
    return `<fill><patternFill patternType="solid">${dxfColor("fgColor", style.fillColor)}${dxfColor("bgColor", style.fillColor)}</patternFill></fill>`;
  if (
    (style.fillPattern === false ||
      style.fillPattern === null ||
      style.fillGradient === false ||
      style.fillGradient === null) &&
    (style.fillColor === false || style.fillColor === null)
  )
    return '<fill><patternFill patternType="none"/></fill>';
  return "";
}

function dxfXml(style: ConditionalFormatStyle): string {
  const fontFamily = typeof style.fontFamily === "string" ? style.fontFamily : undefined;
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : undefined;
  const textColor = typeof style.textColor === "string" ? style.textColor : undefined;
  const underline = style.underline;
  const font =
    fontFamily !== undefined ||
    fontSize !== undefined ||
    style.bold !== undefined ||
    style.italic !== undefined ||
    style.underline !== undefined ||
    style.strikethrough !== undefined ||
    style.fontScript !== undefined ||
    textColor !== undefined
      ? `<font>${fontFamily === undefined ? "" : `<name val="${encodeXml(fontFamily)}"/>`}${fontSize === undefined ? "" : `<sz val="${fontSize}"/>`}${style.bold === undefined || style.bold === null ? "" : `<b val="${style.bold ? 1 : 0}"/>`}${style.italic === undefined || style.italic === null ? "" : `<i val="${style.italic ? 1 : 0}"/>`}${underline === undefined || underline === null ? "" : underline === true ? "<u/>" : `<u val="${underline === false ? "none" : underline}"/>`}${style.strikethrough === undefined || style.strikethrough === null ? "" : `<strike val="${style.strikethrough ? 1 : 0}"/>`}${style.fontScript === undefined || style.fontScript === null ? "" : `<vertAlign val="${style.fontScript === false ? "baseline" : style.fontScript}"/>`}${textColor === undefined ? (style.textColor === false ? '<color auto="1"/>' : "") : dxfColor("color", textColor)}</font>`
      : "";
  const fill = dxfFillXml(style);
  const numberFormat =
    style.numberFormat && typeof style.numberFormat === "object"
      ? `<numFmt numFmtId="164" formatCode="${encodeXml(toExcelNumberFormat(style.numberFormat))}"/>`
      : style.numberFormat === false || style.numberFormat === null
        ? '<numFmt numFmtId="0" formatCode="General"/>'
        : "";
  return `<dxf>${numberFormat}${font}${fill}${dxfBorderXml(style)}</dxf>`;
}

function hasDxfOmission(style: ConditionalFormatStyle): boolean {
  const diagonalConflict = Boolean(
    style.borderDiagonalUp &&
    typeof style.borderDiagonalUp === "object" &&
    style.borderDiagonalDown &&
    typeof style.borderDiagonalDown === "object" &&
    (style.borderDiagonalUp.style !== style.borderDiagonalDown.style ||
      style.borderDiagonalUp.color !== style.borderDiagonalDown.color),
  );
  const replacesFill =
    typeof style.fillColor === "string" ||
    typeof style.fillPattern === "string" ||
    (style.fillGradient !== null && typeof style.fillGradient === "object");
  const clearsEntireFill =
    (style.fillPattern === false ||
      style.fillPattern === null ||
      style.fillGradient === false ||
      style.fillGradient === null) &&
    (style.fillColor === false || style.fillColor === null);
  return (
    style.fontFamily === false ||
    style.fontFamily === null ||
    style.fontSize === false ||
    style.fontSize === null ||
    style.fillPatternColor === false ||
    style.fillPatternColor === null ||
    (!replacesFill &&
      !clearsEntireFill &&
      (style.fillPattern === false ||
        style.fillPattern === null ||
        style.fillGradient === false ||
        style.fillGradient === null)) ||
    diagonalConflict
  );
}

function quoteFormulaText(text: string): string {
  return text.replace(/"/g, '""');
}

/** SEARCH interprets *, ? and ~ as wildcards; Core text conditions do not. */
function searchFormulaText(text: string): string {
  return quoteFormulaText(text).replace(/[~*?]/g, "~$&");
}

function cellFormulaValue(
  value: ConditionalFormatOperand,
  rowOffset: number,
  columnOffset: number,
): string {
  return typeof value === "number"
    ? String(value)
    : typeof value === "string"
      ? `"${quoteFormulaText(value)}"`
      : formulaForXlsx(value.formula, rowOffset, columnOffset);
}

function dataBarExtensionId(priority: number): string {
  return `{00000000-0000-0000-0000-${priority.toString(16).padStart(12, "0").toUpperCase()}}`;
}

function needsDataBarExtension(condition: DataBarCondition): boolean {
  return (
    condition.minimum.kind === "autoMin" ||
    condition.maximum.kind === "autoMax" ||
    condition.borderColor !== undefined ||
    condition.negativeColor !== undefined ||
    condition.negativeBorderColor !== undefined ||
    condition.gradient === false ||
    (condition.direction !== undefined && condition.direction !== "context") ||
    (condition.axisPosition !== undefined && condition.axisPosition !== "automatic") ||
    (condition.axisColor !== undefined && condition.axisColor.toUpperCase() !== "#000000")
  );
}

function dataBarBaseExtensionXml(priority: number): string {
  return `<extLst><ext uri="{B025F937-C7B1-47D3-B67F-A62EFF666E3E}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:id>${dataBarExtensionId(priority)}</x14:id></ext></extLst>`;
}

function ruleXml(rule: SheetConditionalFormatRule, priority: number, dxfId?: number): string {
  const dxf = dxfId === undefined ? "" : ` dxfId="${dxfId}"`;
  const stop = rule.stopIfTrue ? ' stopIfTrue="1"' : "";
  // OOXML conditions are evaluated relative to the first sqref cell. The Core
  // anchor can survive a partial clear, so rebase before serializing it.
  const rangeAnchor = rule.ranges[0]!.start;
  const rowOffset = rangeAnchor.row - rule.anchor.row;
  const columnOffset = rangeAnchor.column - rule.anchor.column;
  const anchor = `${columnLabel(rangeAnchor.column)}${rangeAnchor.row + 1}`;
  const condition = rule.condition;
  if (condition.kind === "cellValue") {
    const values = [condition.value, condition.secondValue].filter((value) => value !== undefined);
    return `<cfRule type="cellIs" operator="${condition.operator}" priority="${priority}"${dxf}${stop}>${values.map((value) => `<formula>${encodeXml(cellFormulaValue(value, rowOffset, columnOffset))}</formula>`).join("")}</cfRule>`;
  }
  if (condition.kind === "formula")
    return `<cfRule type="expression" priority="${priority}"${dxf}${stop}><formula>${encodeXml(formulaForXlsx(condition.formula, rowOffset, columnOffset))}</formula></cfRule>`;
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
    return `<cfRule type="dataBar" priority="${priority}"><dataBar${condition.showValue === false ? ' showValue="0"' : ""}>${thresholdXml(baseDataBarThreshold(condition.minimum), rowOffset, columnOffset)}${thresholdXml(baseDataBarThreshold(condition.maximum), rowOffset, columnOffset)}<color rgb="FF${condition.color.slice(1).toUpperCase()}"/></dataBar>${needsDataBarExtension(condition) ? dataBarBaseExtensionXml(priority) : ""}</cfRule>`;
  }
  if (condition.kind === "colorScale")
    return `<cfRule type="colorScale" priority="${priority}"><colorScale>${condition.stops.map((stop) => thresholdXml(stop.threshold)).join("")}${condition.stops.map((stop) => `<color rgb="FF${stop.color.slice(1).toUpperCase()}"/>`).join("")}</colorScale></cfRule>`;
  return `<cfRule type="iconSet" priority="${priority}"><iconSet iconSet="${ICON_SET_TO_XLSX[condition.iconSet]}"${condition.reverse ? ' reverse="1"' : ""}${condition.showValue === false ? ' showValue="0"' : ""}>${condition.thresholds.map((threshold) => thresholdXml(threshold)).join("")}</iconSet></cfRule>`;
}

function x14RuleXml(rule: SheetConditionalFormatRule, priority: number): string | null {
  const condition = rule.condition;
  if (condition.kind === "dataBar") {
    if (!needsDataBarExtension(condition)) return null;
    const rangeAnchor = rule.ranges[0]!.start;
    const rowOffset = rangeAnchor.row - rule.anchor.row;
    const columnOffset = rangeAnchor.column - rule.anchor.column;
    const axisPosition = condition.axisPosition ?? "automatic";
    const direction = condition.direction ?? "context";
    const axisColor = condition.axisColor ?? "#000000";
    const border = condition.borderColor !== undefined;
    const negativeBorderColor = border ? condition.negativeBorderColor : undefined;
    return `<x14:conditionalFormatting xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:cfRule type="dataBar" id="${dataBarExtensionId(priority)}"><x14:dataBar${condition.showValue === false ? ' showValue="0"' : ""}${border ? ' border="1"' : ""}${condition.gradient === false ? ' gradient="0"' : ""}${direction === "context" ? "" : ` direction="${direction}"`}${condition.negativeColor === undefined ? ' negativeBarColorSameAsPositive="1"' : ""}${negativeBorderColor === undefined ? "" : ' negativeBarBorderColorSameAsPositive="0"'}${axisPosition === "automatic" ? "" : ` axisPosition="${axisPosition}"`}>${x14DataBarThresholdXml(condition.minimum, rowOffset, columnOffset)}${x14DataBarThresholdXml(condition.maximum, rowOffset, columnOffset)}${border ? `<x14:borderColor rgb="FF${condition.borderColor!.slice(1).toUpperCase()}"/>` : ""}${condition.negativeColor === undefined ? "" : `<x14:negativeFillColor rgb="FF${condition.negativeColor.slice(1).toUpperCase()}"/>`}${negativeBorderColor === undefined ? "" : `<x14:negativeBorderColor rgb="FF${negativeBorderColor.slice(1).toUpperCase()}"/>`}${axisPosition === "none" ? "" : `<x14:axisColor rgb="FF${axisColor.slice(1).toUpperCase()}"/>`}</x14:dataBar></x14:cfRule><xm:sqref>${rule.ranges.map(rangeReference).join(" ")}</xm:sqref></x14:conditionalFormatting>`;
  }
  if (condition.kind !== "iconSet" || !X14_ONLY_ICON_SETS.has(condition.iconSet)) return null;
  const id = priority.toString(16).padStart(12, "0").toUpperCase();
  return `<x14:conditionalFormatting xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main"><x14:cfRule type="iconSet" priority="${priority}" id="{00000000-0000-0000-0000-${id}}"${rule.stopIfTrue ? ' stopIfTrue="1"' : ""}><x14:iconSet iconSet="${ICON_SET_TO_XLSX[condition.iconSet]}"${condition.reverse ? ' reverse="1"' : ""}${condition.showValue === false ? ' showValue="0"' : ""}>${condition.thresholds.map((threshold) => x14ThresholdXml(threshold)).join("")}</x14:iconSet></x14:cfRule><xm:sqref>${rule.ranges.map(rangeReference).join(" ")}</xm:sqref></x14:conditionalFormatting>`;
}

function appendX14ConditionalFormatting(xml: string, body: string): string {
  if (!body) return xml;
  const extension = `<ext uri="{78C0D931-6437-407d-A8EE-F0AAD7539E65}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:conditionalFormattings>${body}</x14:conditionalFormattings></ext>`;
  const tags = /<\/?(?:[a-z_][\w.-]*:)?[a-z_][\w.-]*\b[^>]*>/gi;
  let depth = 0;
  for (const tag of xml.matchAll(tags)) {
    const source = tag[0];
    const closing = source.startsWith("</");
    const selfClosing = source.endsWith("/>");
    const name = /^<\/?(?:[a-z_][\w.-]*:)?([a-z_][\w.-]*)\b/i.exec(source)?.[1];
    if (name === "extLst" && selfClosing && depth === 1)
      return `${xml.slice(0, tag.index)}<extLst>${extension}</extLst>${xml.slice(tag.index + source.length)}`;
    if (closing) {
      if (name === "extLst" && depth === 2)
        return `${xml.slice(0, tag.index)}${extension}${xml.slice(tag.index)}`;
      depth -= 1;
    } else if (!selfClosing) {
      depth += 1;
    }
  }
  return xml.replace(/<\/worksheet>/i, `<extLst>${extension}</extLst></worksheet>`);
}

/** Keep the first exact duplicate, preserving relative rule priority. Formula rules are
 * retained because separate evaluations can differ for volatile functions.
 * Never union ranges: that changes rank, duplicate and visual statistics.
 */
function compactExportRules(
  rules: readonly SheetConditionalFormatRule[],
): SheetConditionalFormatRule[] {
  const seen = new Set<string>();
  return normalizeConditionalFormatRules(rules).filter((rule) => {
    if (conditionalFormatFormulaSources(rule).length) return true;
    const key = JSON.stringify({
      ranges: rule.ranges,
      anchor: rule.anchor,
      condition: rule.condition,
      style: {
        ...rule.style,
        ...(rule.style.fillColor ? { fillColor: rule.style.fillColor.toUpperCase() } : {}),
        ...(rule.style.textColor ? { textColor: rule.style.textColor.toUpperCase() } : {}),
      },
      stopIfTrue: Boolean(rule.stopIfTrue),
    });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Compact only the export copy, preserving the editable workbook and history. */
export function writeXlsxConditionalFormats(
  entries: Record<string, Uint8Array>,
  sheets: readonly SheetConditionalFormatRule[][],
  report?: CompatibilityReportBuilder,
): void {
  const styles = entries["xl/styles.xml"];
  if (!styles) throw new Error("Missing generated XLSX styles.");
  const exportSheets = sheets.map(compactExportRules);
  const allRules = exportSheets.flat();
  if (!allRules.length) return;
  const dxfs: string[] = [];
  const styleIds = new Map<string, number>();
  const ruleStyleIds = new Map<SheetConditionalFormatRule, number>();
  for (const rule of allRules) {
    if (
      !Object.keys(rule.style).length ||
      rule.condition.kind === "iconSet" ||
      rule.condition.kind === "dataBar" ||
      rule.condition.kind === "colorScale"
    )
      continue;
    const xml = dxfXml(rule.style);
    let id = styleIds.get(xml);
    if (id === undefined) {
      id = dxfs.length;
      dxfs.push(xml);
      styleIds.set(xml, id);
    }
    ruleStyleIds.set(rule, id);
  }
  const stylesXml = strFromU8(styles);
  const previous = /<dxfs\b[^>]*>[\s\S]*?<\/dxfs>|<dxfs\b[^>]*\/?\s*>/i;
  const dxfContainer = `<dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs>`;
  entries["xl/styles.xml"] = strToU8(
    previous.test(stylesXml)
      ? stylesXml.replace(previous, dxfContainer)
      : stylesXml.replace(/<tableStyles\b/i, `${dxfContainer}<tableStyles`),
  );
  let priority = 1;
  for (const [sheetIndex, rules] of exportSheets.entries()) {
    if (!rules.length) continue;
    const path = `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const entry = entries[path];
    if (!entry) continue;
    const xml = strFromU8(entry);
    let x14Body = "";
    const body = rules
      .map((rule) => {
        const x14 = x14RuleXml(rule, priority);
        const linkedDataBar = rule.condition.kind === "dataBar";
        const next = linkedDataBar
          ? ruleXml(rule, priority, ruleStyleIds.get(rule))
          : (x14 ?? ruleXml(rule, priority, ruleStyleIds.get(rule)));
        if (
          (rule.condition.kind === "iconSet" ||
            rule.condition.kind === "dataBar" ||
            rule.condition.kind === "colorScale") &&
          Object.keys(rule.style).length
        )
          report?.add(
            "style-omitted",
            "warning",
            `sheet${sheetIndex + 1}.conditionalFormatting.${rule.id}.visualStyle`,
          );
        if (hasDxfOmission(rule.style))
          report?.add(
            "style-omitted",
            "warning",
            `sheet${sheetIndex + 1}.conditionalFormatting.${rule.id}.dxfStyle`,
          );
        if (x14) x14Body += x14;
        priority += 1;
        return x14 && !linkedDataBar
          ? ""
          : `<conditionalFormatting sqref="${rule.ranges.map(rangeReference).join(" ")}">${next}</conditionalFormatting>`;
      })
      .join("");
    // Schema order: after merges and before data validations/extensions.
    const target =
      /<dataValidations\b|<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<extLst\b|<\/worksheet>/i;
    const withBaseRules = target.test(xml)
      ? xml.replace(target, `${body}$&`)
      : xml.replace(/<\/worksheet>/i, `${body}</worksheet>`);
    entries[path] = strToU8(appendX14ConditionalFormatting(withBaseRules, x14Body));
  }
}
