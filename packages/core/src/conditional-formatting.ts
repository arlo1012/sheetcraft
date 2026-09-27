import { WorkbookDomainError, toWorkbookErrorDetail } from "./errors.js";
import { parseFormula } from "./formula/parser.js";
import { translateFormulaForCopy } from "./formula/references.js";
import { excelSerialToDateParts, type ExcelDateSystem } from "./formula/date-system.js";
import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { normalizeCellStyle, type CellStyle } from "./style.js";
import {
  createCellKey,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";

export type ConditionalFormatStyle = {
  fillColor?: string;
  textColor?: string;
  bold?: boolean;
  italic?: boolean;
};

export type ConditionalFormatDatePeriod =
  | "yesterday"
  | "today"
  | "tomorrow"
  | "last7Days"
  | "lastWeek"
  | "thisWeek"
  | "nextWeek"
  | "lastMonth"
  | "thisMonth"
  | "nextMonth";

export type ConditionalFormatThreshold =
  | { kind: "min" }
  | { kind: "max" }
  | { kind: "num" | "percent" | "percentile"; value: number };

export type ConditionalFormatColorScaleStop = {
  threshold: ConditionalFormatThreshold;
  color: string;
};

export type ConditionalFormatIconSet =
  | "threeArrows"
  | "threeArrowsGray"
  | "threeFlags"
  | "threeTrafficLights"
  | "threeTrafficLightsRimmed"
  | "threeSigns"
  | "threeTriangles"
  | "threeStars"
  | "threeSymbols"
  | "threeSymbolsCircled"
  | "fourArrows"
  | "fourArrowsGray"
  | "fourRedToBlack"
  | "fourRatings"
  | "fourTrafficLights"
  | "fiveArrows"
  | "fiveArrowsGray"
  | "fiveRatings"
  | "fiveQuarters"
  | "fiveBoxes";

export type ConditionalFormatVisual = {
  dataBar?: {
    start: number;
    end: number;
    axis: number;
    color: string;
    negativeColor?: string;
    gradient: boolean;
    showValue: boolean;
  };
  iconSet?: { iconSet: ConditionalFormatIconSet; iconIndex: number; showValue: boolean };
};

export type ConditionalFormatResolverOptions = {
  now?: () => Date;
  dateSystem?: ExcelDateSystem;
};

export type ConditionalFormatCondition =
  | {
      kind: "cellValue";
      operator:
        | "greaterThan"
        | "greaterThanOrEqual"
        | "lessThan"
        | "lessThanOrEqual"
        | "equal"
        | "notEqual"
        | "between"
        | "notBetween";
      value: number | string;
      secondValue?: number | string;
    }
  | { kind: "text"; operator: "contains" | "notContains" | "beginsWith" | "endsWith"; text: string }
  | { kind: "blank"; blank: boolean }
  | { kind: "duplicate"; unique: boolean }
  | { kind: "formula"; formula: string }
  | { kind: "rank"; count: number; percent?: boolean; bottom?: boolean }
  | { kind: "average"; above: boolean; equalAverage?: boolean; stdDev?: number }
  | { kind: "date"; period: ConditionalFormatDatePeriod }
  | {
      kind: "dataBar";
      minimum: ConditionalFormatThreshold;
      maximum: ConditionalFormatThreshold;
      color: string;
      negativeColor?: string;
      gradient?: boolean;
      showValue?: boolean;
    }
  | {
      kind: "colorScale";
      stops:
        | [ConditionalFormatColorScaleStop, ConditionalFormatColorScaleStop]
        | [
            ConditionalFormatColorScaleStop,
            ConditionalFormatColorScaleStop,
            ConditionalFormatColorScaleStop,
          ];
    }
  | {
      kind: "iconSet";
      iconSet: ConditionalFormatIconSet;
      thresholds: ConditionalFormatThreshold[];
      reverse?: boolean;
      showValue?: boolean;
    };

export type SheetConditionalFormatRule = {
  id: string;
  ranges: CellRange[];
  anchor: CellAddress;
  condition: ConditionalFormatCondition;
  style: ConditionalFormatStyle;
  stopIfTrue?: boolean;
};

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const VALUE_OPERATORS = new Set<
  Extract<ConditionalFormatCondition, { kind: "cellValue" }>["operator"]
>([
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "equal",
  "notEqual",
  "between",
  "notBetween",
]);
const TEXT_OPERATORS = new Set<Extract<ConditionalFormatCondition, { kind: "text" }>["operator"]>([
  "contains",
  "notContains",
  "beginsWith",
  "endsWith",
]);
const DATE_PERIODS = new Set<ConditionalFormatDatePeriod>([
  "yesterday",
  "today",
  "tomorrow",
  "last7Days",
  "lastWeek",
  "thisWeek",
  "nextWeek",
  "lastMonth",
  "thisMonth",
  "nextMonth",
]);
const ICON_SETS = new Set<ConditionalFormatIconSet>([
  "threeArrows",
  "threeArrowsGray",
  "threeFlags",
  "threeTrafficLights",
  "threeTrafficLightsRimmed",
  "threeSigns",
  "threeTriangles",
  "threeStars",
  "threeSymbols",
  "threeSymbolsCircled",
  "fourArrows",
  "fourArrowsGray",
  "fourRedToBlack",
  "fourRatings",
  "fourTrafficLights",
  "fiveArrows",
  "fiveArrowsGray",
  "fiveRatings",
  "fiveQuarters",
  "fiveBoxes",
]);

function iconSetSize(iconSet: ConditionalFormatIconSet): number {
  return iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
}

function invalid(field: string, value: unknown): never {
  throw new WorkbookDomainError(
    { code: "invalid_command_payload", details: { field, value: toWorkbookErrorDetail(value) } },
    `Invalid conditional-formatting rule field: ${field}.`,
  );
}

function normalizeAddress(address: CellAddress, field: string): CellAddress {
  if (!address || typeof address !== "object" || !isCellAddressInBounds(address))
    invalid(field, address);
  return { row: address.row, column: address.column };
}

function normalizeRange(range: CellRange, field: string): CellRange {
  if (!range || typeof range !== "object") invalid(field, range);
  const start = normalizeAddress(range.start, `${field}.start`);
  const end = normalizeAddress(range.end, `${field}.end`);
  return {
    start: { row: Math.min(start.row, end.row), column: Math.min(start.column, end.column) },
    end: { row: Math.max(start.row, end.row), column: Math.max(start.column, end.column) },
  };
}

function normalizeColor(color: unknown, field: string): string {
  if (typeof color !== "string" || !COLOR_PATTERN.test(color)) invalid(field, color);
  return color;
}

function normalizeThreshold(
  value: ConditionalFormatThreshold,
  field: string,
): ConditionalFormatThreshold {
  if (!value || typeof value !== "object") invalid(field, value);
  if (value.kind === "min" || value.kind === "max") return { kind: value.kind };
  if (value.kind !== "num" && value.kind !== "percent" && value.kind !== "percentile")
    return invalid(`${field}.kind`, (value as { kind?: unknown }).kind);
  if (typeof value.value !== "number" || !Number.isFinite(value.value))
    invalid(`${field}.value`, value.value);
  if (
    (value.kind === "percent" || value.kind === "percentile") &&
    (value.value < 0 || value.value > 100)
  )
    invalid(`${field}.value`, value.value);
  return { kind: value.kind, value: value.value };
}

function assertThresholdOrder(
  thresholds: readonly ConditionalFormatThreshold[],
  field: string,
): void {
  for (let index = 1; index < thresholds.length; index += 1) {
    const previous = thresholds[index - 1]!;
    const next = thresholds[index]!;
    if (previous.kind === "max" || next.kind === "min") invalid(`${field}.${index}`, next);
    if (
      previous.kind === next.kind &&
      "value" in previous &&
      "value" in next &&
      previous.value > next.value
    )
      invalid(`${field}.${index}`, next);
  }
}

function normalizeCondition(condition: ConditionalFormatCondition): ConditionalFormatCondition {
  if (!condition || typeof condition !== "object") invalid("condition", condition);
  if (condition.kind === "cellValue") {
    if (!VALUE_OPERATORS.has(condition.operator)) invalid("condition.operator", condition.operator);
    if (!isComparable(condition.value)) invalid("condition.value", condition.value);
    const requiresSecond = condition.operator === "between" || condition.operator === "notBetween";
    if (requiresSecond && !isComparable(condition.secondValue))
      invalid("condition.secondValue", condition.secondValue);
    if (
      !requiresSecond &&
      condition.secondValue !== undefined &&
      !isComparable(condition.secondValue)
    )
      invalid("condition.secondValue", condition.secondValue);
    return {
      kind: "cellValue",
      operator: condition.operator,
      value: condition.value,
      ...(condition.secondValue === undefined ? {} : { secondValue: condition.secondValue }),
    };
  }
  if (condition.kind === "text") {
    if (!TEXT_OPERATORS.has(condition.operator)) invalid("condition.operator", condition.operator);
    if (typeof condition.text !== "string") invalid("condition.text", condition.text);
    return { kind: "text", operator: condition.operator, text: condition.text };
  }
  if (condition.kind === "blank") {
    if (typeof condition.blank !== "boolean") invalid("condition.blank", condition.blank);
    return { kind: "blank", blank: condition.blank };
  }
  if (condition.kind === "duplicate") {
    if (typeof condition.unique !== "boolean") invalid("condition.unique", condition.unique);
    return { kind: "duplicate", unique: condition.unique };
  }
  if (condition.kind === "formula") {
    if (typeof condition.formula !== "string" || !parseFormula(condition.formula).ok)
      invalid("condition.formula", condition.formula);
    return { kind: "formula", formula: condition.formula };
  }
  if (condition.kind === "rank") {
    if (
      !Number.isInteger(condition.count) ||
      condition.count < 1 ||
      (condition.percent && condition.count > 100)
    )
      invalid("condition.count", condition.count);
    if (condition.percent !== undefined && typeof condition.percent !== "boolean")
      invalid("condition.percent", condition.percent);
    if (condition.bottom !== undefined && typeof condition.bottom !== "boolean")
      invalid("condition.bottom", condition.bottom);
    return {
      kind: "rank",
      count: condition.count,
      ...(condition.percent ? { percent: true } : {}),
      ...(condition.bottom ? { bottom: true } : {}),
    };
  }
  if (condition.kind === "average") {
    if (typeof condition.above !== "boolean") invalid("condition.above", condition.above);
    if (condition.equalAverage !== undefined && typeof condition.equalAverage !== "boolean")
      invalid("condition.equalAverage", condition.equalAverage);
    if (
      condition.stdDev !== undefined &&
      (!Number.isInteger(condition.stdDev) || condition.stdDev < 0 || condition.stdDev > 3)
    )
      invalid("condition.stdDev", condition.stdDev);
    return {
      kind: "average",
      above: condition.above,
      ...(condition.equalAverage ? { equalAverage: true } : {}),
      ...(condition.stdDev === undefined ? {} : { stdDev: condition.stdDev }),
    };
  }
  if (condition.kind === "date") {
    if (!DATE_PERIODS.has(condition.period)) invalid("condition.period", condition.period);
    return { kind: "date", period: condition.period };
  }
  if (condition.kind === "dataBar") {
    if (condition.gradient !== undefined && typeof condition.gradient !== "boolean")
      invalid("condition.gradient", condition.gradient);
    if (condition.showValue !== undefined && typeof condition.showValue !== "boolean")
      invalid("condition.showValue", condition.showValue);
    const minimum = normalizeThreshold(condition.minimum, "condition.minimum");
    const maximum = normalizeThreshold(condition.maximum, "condition.maximum");
    assertThresholdOrder([minimum, maximum], "condition");
    return {
      kind: "dataBar",
      minimum,
      maximum,
      color: normalizeColor(condition.color, "condition.color"),
      ...(condition.negativeColor === undefined
        ? {}
        : { negativeColor: normalizeColor(condition.negativeColor, "condition.negativeColor") }),
      ...(condition.gradient === false ? { gradient: false } : {}),
      ...(condition.showValue === false ? { showValue: false } : {}),
    };
  }
  if (condition.kind === "colorScale") {
    if (
      !Array.isArray(condition.stops) ||
      (condition.stops.length !== 2 && condition.stops.length !== 3)
    )
      invalid("condition.stops", condition.stops);
    const stops = condition.stops.map((stop, index) => {
      if (!stop || typeof stop !== "object") invalid(`condition.stops.${index}`, stop);
      return {
        threshold: normalizeThreshold(stop.threshold, `condition.stops.${index}.threshold`),
        color: normalizeColor(stop.color, `condition.stops.${index}.color`),
      };
    });
    assertThresholdOrder(
      stops.map((stop) => stop.threshold),
      "condition.stops",
    );
    return {
      kind: "colorScale",
      stops: stops as Extract<ConditionalFormatCondition, { kind: "colorScale" }>["stops"],
    };
  }
  if (condition.kind === "iconSet") {
    if (!ICON_SETS.has(condition.iconSet)) invalid("condition.iconSet", condition.iconSet);
    if (
      !Array.isArray(condition.thresholds) ||
      condition.thresholds.length !== iconSetSize(condition.iconSet)
    )
      invalid("condition.thresholds", condition.thresholds);
    if (condition.reverse !== undefined && typeof condition.reverse !== "boolean")
      invalid("condition.reverse", condition.reverse);
    if (condition.showValue !== undefined && typeof condition.showValue !== "boolean")
      invalid("condition.showValue", condition.showValue);
    const thresholds = condition.thresholds.map((threshold, index) =>
      normalizeThreshold(threshold, `condition.thresholds.${index}`),
    );
    assertThresholdOrder(thresholds, "condition.thresholds");
    return {
      kind: "iconSet",
      iconSet: condition.iconSet,
      thresholds,
      ...(condition.reverse ? { reverse: true } : {}),
      ...(condition.showValue === false ? { showValue: false } : {}),
    };
  }
  return invalid("condition.kind", (condition as { kind?: unknown }).kind);
}

function normalizeStyle(
  style: ConditionalFormatStyle,
  allowEmpty: boolean,
): ConditionalFormatStyle {
  if (!style || typeof style !== "object") invalid("style", style);
  if (
    style.fillColor !== undefined &&
    (typeof style.fillColor !== "string" || !COLOR_PATTERN.test(style.fillColor))
  )
    invalid("style.fillColor", style.fillColor);
  if (
    style.textColor !== undefined &&
    (typeof style.textColor !== "string" || !COLOR_PATTERN.test(style.textColor))
  )
    invalid("style.textColor", style.textColor);
  if (style.bold !== undefined && typeof style.bold !== "boolean")
    invalid("style.bold", style.bold);
  if (style.italic !== undefined && typeof style.italic !== "boolean")
    invalid("style.italic", style.italic);
  const normalized: ConditionalFormatStyle = {};
  if (style.fillColor !== undefined) normalized.fillColor = style.fillColor;
  if (style.textColor !== undefined) normalized.textColor = style.textColor;
  if (style.bold !== undefined) normalized.bold = style.bold;
  if (style.italic !== undefined) normalized.italic = style.italic;
  if (!allowEmpty && !Object.keys(normalized).length) invalid("style", style);
  return normalized;
}

/** Returns fresh, normalized rules. Array order is the persisted high-to-low priority. */
export function normalizeConditionalFormatRules(
  rules: readonly SheetConditionalFormatRule[],
): SheetConditionalFormatRule[] {
  if (!Array.isArray(rules)) invalid("conditionalFormats", rules);
  const ids = new Set<string>();
  return rules.map((rule, index) => {
    if (!rule || typeof rule !== "object") invalid(`conditionalFormats.${index}`, rule);
    if (typeof rule.id !== "string" || !rule.id.trim() || ids.has(rule.id))
      invalid(`conditionalFormats.${index}.id`, rule.id);
    ids.add(rule.id);
    if (!Array.isArray(rule.ranges) || !rule.ranges.length)
      invalid(`conditionalFormats.${index}.ranges`, rule.ranges);
    if (rule.stopIfTrue !== undefined && typeof rule.stopIfTrue !== "boolean")
      invalid(`conditionalFormats.${index}.stopIfTrue`, rule.stopIfTrue);
    return {
      id: rule.id,
      ranges: rule.ranges.map((range: CellRange, rangeIndex: number) =>
        normalizeRange(range, `conditionalFormats.${index}.ranges.${rangeIndex}`),
      ),
      anchor: normalizeAddress(rule.anchor, `conditionalFormats.${index}.anchor`),
      condition: normalizeCondition(rule.condition),
      style: normalizeStyle(
        rule.style,
        rule.stopIfTrue === true ||
          rule.condition.kind === "dataBar" ||
          rule.condition.kind === "colorScale" ||
          rule.condition.kind === "iconSet",
      ),
      ...(rule.stopIfTrue ? { stopIfTrue: true } : {}),
    };
  });
}

export function cloneConditionalFormatRule(
  rule: SheetConditionalFormatRule,
): SheetConditionalFormatRule {
  return normalizeConditionalFormatRules([rule])[0]!;
}

function isComparable(value: unknown): value is number | string {
  return (typeof value === "number" && Number.isFinite(value)) || typeof value === "string";
}

function inRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function isInRule(address: CellAddress, rule: SheetConditionalFormatRule): boolean {
  return rule.ranges.some((range) => inRange(address, range));
}

function formulaValueKey(value: FormulaValue): string | undefined {
  if (value === null || value === "" || isFormulaError(value)) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? `n:${value}` : undefined;
  if (typeof value === "string") return `s:${value.toLocaleLowerCase()}`;
  return `b:${value}`;
}

function cellValueMatches(
  value: FormulaValue,
  condition: Extract<ConditionalFormatCondition, { kind: "cellValue" }>,
): boolean {
  if (isFormulaError(value) || value === null || typeof value === "boolean") return false;
  const target = condition.value;
  if (typeof value !== typeof target) return condition.operator === "notEqual";
  const comparableValue = typeof value === "string" ? value.toLocaleLowerCase() : value;
  const comparableTarget = typeof target === "string" ? target.toLocaleLowerCase() : target;
  const compare =
    comparableValue < comparableTarget ? -1 : comparableValue > comparableTarget ? 1 : 0;
  switch (condition.operator) {
    case "greaterThan":
      return compare > 0;
    case "greaterThanOrEqual":
      return compare >= 0;
    case "lessThan":
      return compare < 0;
    case "lessThanOrEqual":
      return compare <= 0;
    case "equal":
      return compare === 0;
    case "notEqual":
      return compare !== 0;
    case "between":
    case "notBetween": {
      if (condition.secondValue === undefined || typeof condition.secondValue !== typeof value)
        return false;
      const secondValue =
        typeof condition.secondValue === "string"
          ? condition.secondValue.toLocaleLowerCase()
          : condition.secondValue;
      const lower = comparableTarget <= secondValue ? comparableTarget : secondValue;
      const upper = comparableTarget <= secondValue ? secondValue : comparableTarget;
      const matches = comparableValue >= lower && comparableValue <= upper;
      return condition.operator === "between" ? matches : !matches;
    }
  }
}

function textMatches(
  value: FormulaValue,
  condition: Extract<ConditionalFormatCondition, { kind: "text" }>,
): boolean {
  if (isFormulaError(value) || value === null) return false;
  const text = String(value).toLocaleLowerCase();
  const query = condition.text.toLocaleLowerCase();
  switch (condition.operator) {
    case "contains":
      return text.includes(query);
    case "notContains":
      return !text.includes(query);
    case "beginsWith":
      return text.startsWith(query);
    case "endsWith":
      return text.endsWith(query);
  }
}

type ConditionalFormulaEvaluator = SheetEvaluator & {
  evaluateFormula?: (source: string, address: CellAddress) => FormulaValue;
};

function formulaMatches(
  rule: SheetConditionalFormatRule,
  address: CellAddress,
  evaluator: ConditionalFormulaEvaluator,
): boolean {
  if (!evaluator.evaluateFormula) return false;
  const source = translateFormulaForCopy(
    rule.condition.kind === "formula" ? rule.condition.formula : "",
    {
      row: address.row - rule.anchor.row,
      column: address.column - rule.anchor.column,
    },
  );
  const value = evaluator.evaluateFormula(source, address);
  return !isFormulaError(value) && (value === true || (typeof value === "number" && value !== 0));
}

function collectSparseAddresses(sheet: Sheet, evaluator: SheetEvaluator): CellAddress[] {
  const addresses = new Map<string, CellAddress>();
  for (const [key, cell] of sheet.cells) {
    if (cell.content) {
      const separator = key.indexOf(":");
      const address = {
        row: Number(key.slice(0, separator)),
        column: Number(key.slice(separator + 1)),
      };
      addresses.set(key, address);
      if (cell.content.kind === "formula") evaluator.getComputedValue(address);
    }
  }
  for (const projection of evaluator.getSpillProjections?.() ?? [])
    addresses.set(createCellKey(projection.address), projection.address);
  return [...addresses.values()];
}

function numericValuesForRule(
  rule: SheetConditionalFormatRule,
  sparseAddresses: readonly CellAddress[],
  evaluator: SheetEvaluator,
): number[] {
  const values: number[] = [];
  const seen = new Set<string>();
  for (const address of sparseAddresses) {
    const key = createCellKey(address);
    if (seen.has(key) || !isInRule(address, rule)) continue;
    seen.add(key);
    const value = evaluator.getComputedValue(address);
    if (typeof value === "number" && Number.isFinite(value)) values.push(value);
  }
  return values;
}

type NumericSummary = {
  values: number[];
  sorted: number[];
  minimum: number;
  maximum: number;
  mean: number;
  standardDeviation: number;
};

function createNumericSummary(values: number[]): NumericSummary | undefined {
  if (!values.length) return undefined;
  let minimum = values[0]!;
  let maximum = values[0]!;
  let sum = 0;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    sum += value;
  }
  const mean = sum / values.length;
  let squareSum = 0;
  for (const value of values) squareSum += (value - mean) ** 2;
  return {
    values,
    sorted: [...values].sort((left, right) => left - right),
    minimum,
    maximum,
    mean,
    standardDeviation: Math.sqrt(squareSum / values.length),
  };
}

function resolveThreshold(
  threshold: ConditionalFormatThreshold,
  summary: NumericSummary | undefined,
): number | undefined {
  if (!summary) return undefined;
  if (threshold.kind === "min") return summary.minimum;
  if (threshold.kind === "max") return summary.maximum;
  if (threshold.kind === "num") return threshold.value;
  if (threshold.kind === "percent")
    return summary.minimum + ((summary.maximum - summary.minimum) * threshold.value) / 100;
  const index = ((summary.sorted.length - 1) * threshold.value) / 100;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return (
    summary.sorted[lower]! + (summary.sorted[upper]! - summary.sorted[lower]!) * (index - lower)
  );
}

function interpolateColor(left: string, right: string, ratio: number): string {
  const clamp = Math.max(0, Math.min(1, ratio));
  const channel = (offset: number) =>
    Math.round(
      Number.parseInt(left.slice(offset, offset + 2), 16) * (1 - clamp) +
        Number.parseInt(right.slice(offset, offset + 2), 16) * clamp,
    )
      .toString(16)
      .padStart(2, "0");
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function colorScaleColor(
  value: FormulaValue,
  condition: Extract<ConditionalFormatCondition, { kind: "colorScale" }>,
  summary: NumericSummary | undefined,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const resolved = condition.stops.map((stop) => ({
    ...stop,
    value: resolveThreshold(stop.threshold, summary),
  }));
  if (resolved.some((stop) => stop.value === undefined)) return undefined;
  if (resolved.some((stop, index) => index > 0 && stop.value! < resolved[index - 1]!.value!))
    return undefined;
  if (value <= resolved[0]!.value!) return resolved[0]!.color;
  for (let index = 1; index < resolved.length; index += 1) {
    const previous = resolved[index - 1]!;
    const next = resolved[index]!;
    if (value <= next.value!) {
      const width = next.value! - previous.value!;
      return width === 0
        ? next.color
        : interpolateColor(previous.color, next.color, (value - previous.value!) / width);
    }
  }
  return resolved.at(-1)!.color;
}

function dateMatches(
  value: FormulaValue,
  period: ConditionalFormatDatePeriod,
  options: ConditionalFormatResolverOptions,
  clock: Date,
): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  let parts: ReturnType<typeof excelSerialToDateParts>;
  try {
    parts = excelSerialToDateParts(value, options.dateSystem ?? "1900");
  } catch {
    return false;
  }
  const today = new Date(clock.getFullYear(), clock.getMonth(), clock.getDate());
  const candidate = new Date(parts.year, parts.month - 1, parts.day);
  const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
  const addDays = (date: Date, count: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  };
  const weekStart = (date: Date) => {
    const start = new Date(date);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return start;
  };
  const inDays = (start: Date, count: number) =>
    candidate >= start && candidate < addDays(start, count);
  if (period === "yesterday") return sameDay(candidate, addDays(today, -1));
  if (period === "today") return sameDay(candidate, today);
  if (period === "tomorrow") return sameDay(candidate, addDays(today, 1));
  if (period === "last7Days") return inDays(addDays(today, -6), 7);
  const thisWeek = weekStart(today);
  if (period === "lastWeek") return inDays(addDays(thisWeek, -7), 7);
  if (period === "thisWeek") return inDays(thisWeek, 7);
  if (period === "nextWeek") return inDays(addDays(thisWeek, 7), 7);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === "lastMonth")
    return (
      candidate >= new Date(today.getFullYear(), today.getMonth() - 1, 1) && candidate < monthStart
    );
  if (period === "thisMonth")
    return (
      candidate >= monthStart && candidate < new Date(today.getFullYear(), today.getMonth() + 1, 1)
    );
  return (
    candidate >= new Date(today.getFullYear(), today.getMonth() + 1, 1) &&
    candidate < new Date(today.getFullYear(), today.getMonth() + 2, 1)
  );
}

function rankMatches(
  value: FormulaValue,
  condition: Extract<ConditionalFormatCondition, { kind: "rank" }>,
  summary: NumericSummary | undefined,
): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || !summary) return false;
  const count = Math.min(
    summary.sorted.length,
    condition.percent
      ? Math.max(1, Math.ceil((summary.sorted.length * condition.count) / 100))
      : condition.count,
  );
  const cutoff = condition.bottom
    ? summary.sorted[count - 1]!
    : summary.sorted[summary.sorted.length - count]!;
  return condition.bottom ? value <= cutoff : value >= cutoff;
}

function averageMatches(
  value: FormulaValue,
  condition: Extract<ConditionalFormatCondition, { kind: "average" }>,
  summary: NumericSummary | undefined,
): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || !summary) return false;
  const deviation =
    condition.stdDev === undefined ? 0 : summary.standardDeviation * condition.stdDev;
  const threshold = condition.above ? summary.mean + deviation : summary.mean - deviation;
  return condition.above
    ? condition.equalAverage
      ? value >= threshold
      : value > threshold
    : condition.equalAverage
      ? value <= threshold
      : value < threshold;
}

/**
 * Creates a read-only, revision-scoped resolver. Duplicate counts and each cell's
 * overlay are populated only when a visible address asks for them.
 */
export function createConditionalFormatResolver(
  sheet: Sheet,
  evaluator: ConditionalFormulaEvaluator,
  options: ConditionalFormatResolverOptions = {},
): (address: CellAddress) => ConditionalFormatStyle | undefined {
  const rules = normalizeConditionalFormatRules(sheet.conditionalFormats ?? []);
  const clock = options.now?.() ?? new Date();
  const overlays = new Map<string, ConditionalFormatStyle | undefined>();
  const duplicateCounts = new Map<string, Map<string, number>>();
  const numericSummaries = new Map<string, NumericSummary | undefined>();
  let sparseAddresses: CellAddress[] | undefined;
  const getNumericSummary = (rule: SheetConditionalFormatRule): NumericSummary | undefined => {
    if (numericSummaries.has(rule.id)) return numericSummaries.get(rule.id);
    sparseAddresses ??= collectSparseAddresses(sheet, evaluator);
    const summary = createNumericSummary(numericValuesForRule(rule, sparseAddresses, evaluator));
    numericSummaries.set(rule.id, summary);
    return summary;
  };
  const getDuplicateCounts = (rule: SheetConditionalFormatRule): Map<string, number> => {
    const cached = duplicateCounts.get(rule.id);
    if (cached) return cached;
    const counts = new Map<string, number>();
    sparseAddresses ??= collectSparseAddresses(sheet, evaluator);
    for (const candidate of sparseAddresses) {
      if (!isInRule(candidate, rule)) continue;
      const key = formulaValueKey(evaluator.getComputedValue(candidate));
      if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    duplicateCounts.set(rule.id, counts);
    return counts;
  };
  return (address) => {
    const key = createCellKey(address);
    if (overlays.has(key)) return overlays.get(key);
    let fillColor: string | undefined,
      textColor: string | undefined,
      bold: boolean | undefined,
      italic: boolean | undefined;
    for (const rule of rules) {
      if (!isInRule(address, rule)) continue;
      const value = evaluator.getComputedValue(address);
      const matches =
        rule.condition.kind === "cellValue"
          ? cellValueMatches(value, rule.condition)
          : rule.condition.kind === "text"
            ? textMatches(value, rule.condition)
            : rule.condition.kind === "blank"
              ? isFormulaError(value)
                ? false
                : (value === null || (typeof value === "string" && /^[ ]*$/.test(value))) ===
                  rule.condition.blank
              : rule.condition.kind === "duplicate"
                ? (() => {
                    const duplicateKey = formulaValueKey(value);
                    const count =
                      duplicateKey === undefined
                        ? 0
                        : (getDuplicateCounts(rule).get(duplicateKey) ?? 0);
                    return rule.condition.unique ? count === 1 : count > 1;
                  })()
                : rule.condition.kind === "rank"
                  ? rankMatches(value, rule.condition, getNumericSummary(rule))
                  : rule.condition.kind === "average"
                    ? averageMatches(value, rule.condition, getNumericSummary(rule))
                    : rule.condition.kind === "date"
                      ? dateMatches(value, rule.condition.period, options, clock)
                      : rule.condition.kind === "colorScale"
                        ? colorScaleColor(value, rule.condition, getNumericSummary(rule)) !==
                          undefined
                        : rule.condition.kind === "formula"
                          ? formulaMatches(rule, address, evaluator)
                          : rule.condition.kind === "dataBar" || rule.condition.kind === "iconSet"
                            ? typeof value === "number" && Number.isFinite(value)
                            : false;
      if (!matches) continue;
      const calculatedFill =
        rule.condition.kind === "colorScale"
          ? colorScaleColor(value, rule.condition, getNumericSummary(rule))
          : undefined;
      if (fillColor === undefined && (calculatedFill ?? rule.style.fillColor) !== undefined)
        fillColor = calculatedFill ?? rule.style.fillColor;
      if (textColor === undefined && rule.style.textColor !== undefined)
        textColor = rule.style.textColor;
      if (bold === undefined && rule.style.bold !== undefined) bold = rule.style.bold;
      if (italic === undefined && rule.style.italic !== undefined) italic = rule.style.italic;
      if (rule.stopIfTrue) break;
    }
    const result =
      fillColor === undefined &&
      textColor === undefined &&
      bold === undefined &&
      italic === undefined
        ? undefined
        : {
            ...(fillColor === undefined ? {} : { fillColor }),
            ...(textColor === undefined ? {} : { textColor }),
            ...(bold === undefined ? {} : { bold }),
            ...(italic === undefined ? {} : { italic }),
          };
    overlays.set(key, result);
    return result;
  };
}

/** Resolves display-only data bars and icon sets; color scales are regular fill overlays. */
export function createConditionalFormatVisualResolver(
  sheet: Sheet,
  evaluator: ConditionalFormulaEvaluator,
  options: ConditionalFormatResolverOptions = {},
): (address: CellAddress) => ConditionalFormatVisual | undefined {
  const rules = normalizeConditionalFormatRules(sheet.conditionalFormats ?? []);
  const clock = options.now?.() ?? new Date();
  const visuals = new Map<string, ConditionalFormatVisual | undefined>();
  const numericSummaries = new Map<string, NumericSummary | undefined>();
  const duplicateCounts = new Map<string, Map<string, number>>();
  let sparseAddresses: CellAddress[] | undefined;
  const sparse = () => (sparseAddresses ??= collectSparseAddresses(sheet, evaluator));
  const summaryFor = (rule: SheetConditionalFormatRule) => {
    if (numericSummaries.has(rule.id)) return numericSummaries.get(rule.id);
    const summary = createNumericSummary(numericValuesForRule(rule, sparse(), evaluator));
    numericSummaries.set(rule.id, summary);
    return summary;
  };
  const duplicatesFor = (rule: SheetConditionalFormatRule) => {
    const cached = duplicateCounts.get(rule.id);
    if (cached) return cached;
    const counts = new Map<string, number>();
    for (const candidate of sparse()) {
      if (!isInRule(candidate, rule)) continue;
      const duplicateKey = formulaValueKey(evaluator.getComputedValue(candidate));
      if (duplicateKey !== undefined) counts.set(duplicateKey, (counts.get(duplicateKey) ?? 0) + 1);
    }
    duplicateCounts.set(rule.id, counts);
    return counts;
  };
  const matches = (
    rule: SheetConditionalFormatRule,
    address: CellAddress,
    value: FormulaValue,
  ): boolean => {
    const condition = rule.condition;
    if (condition.kind === "cellValue") return cellValueMatches(value, condition);
    if (condition.kind === "text") return textMatches(value, condition);
    if (condition.kind === "blank")
      return (
        !isFormulaError(value) &&
        (value === null || (typeof value === "string" && /^[ ]*$/.test(value))) === condition.blank
      );
    if (condition.kind === "duplicate") {
      const duplicateKey = formulaValueKey(value);
      const count = duplicateKey === undefined ? 0 : (duplicatesFor(rule).get(duplicateKey) ?? 0);
      return condition.unique ? count === 1 : count > 1;
    }
    if (condition.kind === "formula") return formulaMatches(rule, address, evaluator);
    if (condition.kind === "rank") return rankMatches(value, condition, summaryFor(rule));
    if (condition.kind === "average") return averageMatches(value, condition, summaryFor(rule));
    if (condition.kind === "date") return dateMatches(value, condition.period, options, clock);
    return typeof value === "number" && Number.isFinite(value);
  };
  return (address) => {
    const key = createCellKey(address);
    if (visuals.has(key)) return visuals.get(key);
    let dataBar: ConditionalFormatVisual["dataBar"];
    let iconSet: ConditionalFormatVisual["iconSet"];
    for (const rule of rules) {
      if (!isInRule(address, rule)) continue;
      const value = evaluator.getComputedValue(address);
      if (!matches(rule, address, value)) continue;
      if (rule.condition.kind === "dataBar" && dataBar === undefined && typeof value === "number") {
        const summary = summaryFor(rule);
        const minimum = resolveThreshold(rule.condition.minimum, summary);
        const maximum = resolveThreshold(rule.condition.maximum, summary);
        if (minimum !== undefined && maximum !== undefined && maximum >= minimum) {
          const width = maximum - minimum;
          const position =
            width === 0 ? (value < 0 ? 0 : 1) : Math.max(0, Math.min(1, (value - minimum) / width));
          const axis =
            width === 0 ? (value < 0 ? 1 : 0) : Math.max(0, Math.min(1, -minimum / width));
          dataBar =
            value < 0
              ? {
                  start: Math.min(position, axis),
                  end: Math.max(position, axis),
                  axis,
                  color: rule.condition.negativeColor ?? rule.condition.color,
                  ...(rule.condition.negativeColor === undefined
                    ? {}
                    : { negativeColor: rule.condition.negativeColor }),
                  gradient: rule.condition.gradient !== false,
                  showValue: rule.condition.showValue !== false,
                }
              : {
                  start: Math.min(axis, position),
                  end: Math.max(axis, position),
                  axis,
                  color: rule.condition.color,
                  ...(rule.condition.negativeColor === undefined
                    ? {}
                    : { negativeColor: rule.condition.negativeColor }),
                  gradient: rule.condition.gradient !== false,
                  showValue: rule.condition.showValue !== false,
                };
        }
      }
      if (rule.condition.kind === "iconSet" && iconSet === undefined && typeof value === "number") {
        const thresholds = rule.condition.thresholds.map((threshold) =>
          resolveThreshold(threshold, summaryFor(rule)),
        );
        if (
          thresholds.every((threshold) => threshold !== undefined) &&
          !thresholds.some((threshold, index) => index > 0 && threshold! < thresholds[index - 1]!)
        ) {
          let iconIndex = 0;
          for (let index = 0; index < thresholds.length; index += 1)
            if (value >= thresholds[index]!) iconIndex = index;
          if (rule.condition.reverse) iconIndex = thresholds.length - 1 - iconIndex;
          iconSet = {
            iconSet: rule.condition.iconSet,
            iconIndex,
            showValue: rule.condition.showValue !== false,
          };
        }
      }
      if (rule.stopIfTrue) break;
    }
    const result =
      dataBar === undefined && iconSet === undefined
        ? undefined
        : {
            ...(dataBar === undefined ? {} : { dataBar }),
            ...(iconSet === undefined ? {} : { iconSet }),
          };
    visuals.set(key, result);
    return result;
  };
}

/** Applies the display-only condition overlay without mutating the persisted style. */
export function applyConditionalFormatStyle(
  base: Readonly<CellStyle> | undefined,
  overlay: ConditionalFormatStyle | undefined,
): Readonly<CellStyle> | undefined {
  if (!overlay) return base;
  const result: CellStyle = { ...base };
  if (overlay.fillColor !== undefined) {
    result.fillColor = overlay.fillColor;
    delete result.fillPattern;
    delete result.fillPatternColor;
    delete result.fillGradient;
  }
  if (overlay.textColor !== undefined) result.textColor = overlay.textColor;
  if (overlay.bold === true) result.bold = true;
  if (overlay.bold === false) delete result.bold;
  if (overlay.italic === true) result.italic = true;
  if (overlay.italic === false) delete result.italic;
  return normalizeCellStyle(result);
}
