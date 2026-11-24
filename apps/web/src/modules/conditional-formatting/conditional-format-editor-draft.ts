import {
  mapConditionalFormatFormulas,
  type ConditionalFormatIconSet,
  type ConditionalFormatIconThreshold,
  type ConditionalFormatThreshold,
  type SheetConditionalFormatRule,
} from "@sheetcraft/core/conditional-formatting";
import { translateFormulaForCopy } from "@sheetcraft/core/formula";
import type { MessageKey } from "../../shared/i18n";
import {
  getConditionalFormatPreset,
  type ConditionalFormatPresetKind,
} from "./conditional-format-presets";
import {
  createConditionalFormatRuleId,
  formatConditionalFormatRanges,
  formatConditionalFormatValueOperand,
  parseConditionalFormatTextOperand,
  parseConditionalFormatValueOperand,
} from "./conditional-formatting-ui";

export type ConditionalFormatConditionKind = SheetConditionalFormatRule["condition"]["kind"];

export type ConditionalFormatEditorKind =
  | ConditionalFormatConditionKind
  | "greaterThan"
  | "lessThan"
  | "between"
  | "equal"
  | "contains"
  | "top10Items"
  | "top10Percent"
  | "bottom10Items"
  | "bottom10Percent"
  | "aboveAverage"
  | "belowAverage"
  | "yesterday"
  | "today"
  | "tomorrow"
  | "last7Days"
  | "lastWeek"
  | "thisWeek"
  | "nextWeek"
  | "lastMonth"
  | "thisMonth"
  | "nextMonth"
  | ConditionalFormatPresetKind;

export type ConditionalFormatThresholdKind = ConditionalFormatThreshold["kind"];

export type ConditionalFormatEditorDraft = {
  id: string;
  ranges: string;
  kind: ConditionalFormatConditionKind;
  operator: string;
  value: string;
  valueIsString: boolean;
  secondValue: string;
  secondValueIsString: boolean;
  blank: boolean;
  hasError: boolean;
  unique: boolean;
  formula: string;
  count: number;
  percent: boolean;
  bottom: boolean;
  above: boolean;
  equalAverage?: boolean;
  stdDev?: number;
  datePeriod: string;
  minimumKind: ConditionalFormatThresholdKind;
  minimumValue: string;
  maximumKind: ConditionalFormatThresholdKind;
  maximumValue: string;
  barColor: string;
  negativeColor: string | undefined;
  borderColor: string | undefined;
  negativeBorderColor: string | undefined;
  gradient: boolean;
  showValue: boolean;
  direction: "context" | "leftToRight" | "rightToLeft";
  axisPosition: "automatic" | "middle" | "none";
  axisColor: string;
  scaleStops: 2 | 3;
  middleKind: ConditionalFormatThresholdKind;
  middleValue: string;
  minColor: string;
  midColor: string;
  maxColor: string;
  iconSet: ConditionalFormatIconSet;
  iconThresholds: ConditionalFormatIconThreshold[];
  iconIcons: ({ iconSet: ConditionalFormatIconSet; iconIndex: number } | null)[] | undefined;
  reverse: boolean;
};

const DATE_QUICK_KINDS = [
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
];

export function thresholdFromDraft(
  kind: ConditionalFormatThresholdKind,
  value: string,
): ConditionalFormatThreshold {
  if (kind === "min" || kind === "max" || kind === "autoMin" || kind === "autoMax") return { kind };
  if (kind === "formula") return { kind, formula: value };
  return { kind, value: value.trim() === "" ? Number.NaN : Number(value) };
}

export function iconOptionCondition(
  iconSet: ConditionalFormatIconSet,
): SheetConditionalFormatRule["condition"] {
  const count = iconSet.startsWith("three") ? 3 : iconSet.startsWith("four") ? 4 : 5;
  return {
    kind: "iconSet",
    iconSet,
    thresholds: Array.from({ length: count }, (_, index) => ({
      kind: "percent",
      value: (index * 100) / count,
    })),
  };
}

function quickKind(kind: ConditionalFormatEditorKind | undefined): ConditionalFormatConditionKind {
  if (["greaterThan", "lessThan", "between", "equal"].includes(kind ?? "")) return "cellValue";
  if (kind === "contains") return "text";
  if (["top10Items", "top10Percent", "bottom10Items", "bottom10Percent"].includes(kind ?? ""))
    return "rank";
  if (["aboveAverage", "belowAverage"].includes(kind ?? "")) return "average";
  if (DATE_QUICK_KINDS.includes(kind ?? "")) return "date";
  return (kind ?? "colorScale") as ConditionalFormatConditionKind;
}

export function createConditionalFormatEditorDraft(input: {
  rule?: SheetConditionalFormatRule;
  ranges: string;
  initialKind?: ConditionalFormatEditorKind;
}): ConditionalFormatEditorDraft {
  const { rule, ranges, initialKind } = input;
  const displayedRule =
    rule &&
    mapConditionalFormatFormulas(rule, (formula) =>
      translateFormulaForCopy(formula, {
        row: rule.ranges[0]!.start.row - rule.anchor.row,
        column: rule.ranges[0]!.start.column - rule.anchor.column,
      }),
    );
  const c = displayedRule?.condition ?? getConditionalFormatPreset(initialKind ?? "");
  const draftKind = c?.kind ?? quickKind(initialKind);
  const scale = c?.kind === "colorScale" ? c : undefined;
  const stop = (i: number) => scale?.stops[i];
  const min = c?.kind === "dataBar" ? c.minimum : stop(0)?.threshold;
  const max =
    c?.kind === "dataBar" ? c.maximum : stop(scale ? scale.stops.length - 1 : 2)?.threshold;
  const middle = stop(1)?.threshold;
  const minValue =
    min && "value" in min ? String(min.value) : min?.kind === "formula" ? min.formula : "0";
  const maxValue =
    max && "value" in max ? String(max.value) : max?.kind === "formula" ? max.formula : "100";
  const middleValue =
    middle && "value" in middle
      ? String(middle.value)
      : middle?.kind === "formula"
        ? middle.formula
        : "50";
  const valueOperand =
    c?.kind === "cellValue"
      ? formatConditionalFormatValueOperand(c.value)
      : c?.kind === "text"
        ? formatConditionalFormatValueOperand(c.text)
        : undefined;
  const secondValueOperand =
    c?.kind === "cellValue" && c.secondValue !== undefined
      ? formatConditionalFormatValueOperand(c.secondValue)
      : undefined;

  return {
    id: rule?.id ?? createConditionalFormatRuleId(),
    ranges: rule ? formatConditionalFormatRanges(rule.ranges) : ranges,
    kind: draftKind,
    operator:
      c?.kind === "cellValue" || c?.kind === "text"
        ? c.operator
        : initialKind === "contains"
          ? "contains"
          : ["lessThan", "between", "equal"].includes(initialKind ?? "")
            ? initialKind!
            : "greaterThan",
    value: valueOperand?.value ?? "",
    valueIsString: valueOperand?.literal ?? false,
    secondValue: c?.kind === "cellValue" && secondValueOperand ? secondValueOperand.value : "",
    secondValueIsString: secondValueOperand?.literal ?? false,
    blank: c?.kind === "blank" ? c.blank : true,
    hasError: c?.kind === "error" ? c.error : true,
    unique: c?.kind === "duplicate" ? c.unique : false,
    formula: c?.kind === "formula" ? c.formula : "",
    count: c?.kind === "rank" ? c.count : 10,
    percent:
      c?.kind === "rank"
        ? Boolean(c.percent)
        : initialKind === "top10Percent" || initialKind === "bottom10Percent",
    bottom:
      c?.kind === "rank"
        ? Boolean(c.bottom)
        : initialKind === "bottom10Items" || initialKind === "bottom10Percent",
    above: c?.kind === "average" ? c.above : initialKind !== "belowAverage",
    equalAverage: c?.kind === "average" ? c.equalAverage : undefined,
    stdDev: c?.kind === "average" ? c.stdDev : undefined,
    datePeriod:
      c?.kind === "date"
        ? c.period
        : ((DATE_QUICK_KINDS.includes(initialKind ?? "") ? initialKind : "today") as string),
    minimumKind: min?.kind ?? (draftKind === "dataBar" ? "autoMin" : "min"),
    minimumValue: minValue,
    maximumKind: max?.kind ?? (draftKind === "dataBar" ? "autoMax" : "max"),
    maximumValue: maxValue,
    barColor: c?.kind === "dataBar" ? c.color : "#638EC6",
    negativeColor: c?.kind === "dataBar" ? c.negativeColor : undefined,
    borderColor: c?.kind === "dataBar" ? c.borderColor : undefined,
    negativeBorderColor: c?.kind === "dataBar" ? c.negativeBorderColor : undefined,
    gradient: c?.kind === "dataBar" ? c.gradient !== false : true,
    showValue:
      c?.kind === "dataBar"
        ? c.showValue !== false
        : c?.kind === "iconSet"
          ? c.showValue !== false
          : true,
    direction: c?.kind === "dataBar" ? (c.direction ?? "context") : "context",
    axisPosition: c?.kind === "dataBar" ? (c.axisPosition ?? "automatic") : "automatic",
    axisColor: c?.kind === "dataBar" ? (c.axisColor ?? "#000000") : "#000000",
    scaleStops: c?.kind === "colorScale" ? (c.stops.length as 2 | 3) : 3,
    middleKind: middle?.kind ?? "percentile",
    middleValue,
    minColor: stop(0)?.color ?? "#F8696B",
    midColor: stop(1)?.color ?? "#FFEB84",
    maxColor: stop(c?.kind === "colorScale" ? c.stops.length - 1 : 2)?.color ?? "#63BE7B",
    iconSet: c?.kind === "iconSet" ? c.iconSet : "threeTrafficLights",
    iconThresholds:
      c?.kind === "iconSet"
        ? c.thresholds.map((item) => ({ ...item }))
        : [
            { kind: "percent", value: 0 },
            { kind: "percent", value: 33 },
            { kind: "percent", value: 67 },
          ],
    iconIcons:
      c?.kind === "iconSet" ? c.icons?.map((icon) => (icon ? { ...icon } : null)) : undefined,
    reverse: c?.kind === "iconSet" ? Boolean(c.reverse) : false,
  };
}

export function buildVisualConditionFromDraft(
  draft: ConditionalFormatEditorDraft,
): SheetConditionalFormatRule["condition"] | undefined {
  if (draft.kind === "dataBar")
    return {
      kind: "dataBar",
      minimum: thresholdFromDraft(draft.minimumKind, draft.minimumValue),
      maximum: thresholdFromDraft(draft.maximumKind, draft.maximumValue),
      color: draft.barColor,
      ...(draft.negativeColor === undefined ? {} : { negativeColor: draft.negativeColor }),
      ...(draft.borderColor === undefined ? {} : { borderColor: draft.borderColor }),
      ...(draft.negativeBorderColor === undefined
        ? {}
        : { negativeBorderColor: draft.negativeBorderColor }),
      gradient: draft.gradient,
      showValue: draft.showValue,
      direction: draft.direction,
      axisPosition: draft.axisPosition,
      axisColor: draft.axisColor,
    };
  if (draft.kind === "colorScale") {
    const stops = [
      {
        threshold: thresholdFromDraft(draft.minimumKind, draft.minimumValue),
        color: draft.minColor,
      },
      {
        threshold: thresholdFromDraft(draft.middleKind, draft.middleValue),
        color: draft.midColor,
      },
      {
        threshold: thresholdFromDraft(draft.maximumKind, draft.maximumValue),
        color: draft.maxColor,
      },
    ];
    return {
      kind: "colorScale",
      stops: (draft.scaleStops === 2 ? [stops[0], stops[2]] : stops) as never,
    };
  }
  if (draft.kind === "iconSet") {
    const n = draft.iconSet.startsWith("three") ? 3 : draft.iconSet.startsWith("four") ? 4 : 5;
    const thresholds =
      draft.iconThresholds.length === n
        ? draft.iconThresholds.map((item) => ({ ...item }))
        : Array.from({ length: n }, (_, i) =>
            thresholdFromDraft("percent", String(Math.round((i / n) * 100))),
          );
    return {
      kind: "iconSet",
      iconSet: draft.iconSet,
      thresholds,
      ...(draft.iconIcons === undefined
        ? {}
        : { icons: draft.iconIcons.map((icon) => (icon ? { ...icon } : null)) }),
      reverse: draft.reverse || undefined,
      showValue: draft.showValue,
    };
  }
  return undefined;
}

export type BuildConditionResult =
  | Readonly<{ ok: true; condition: SheetConditionalFormatRule["condition"] }>
  | Readonly<{ ok: false; field: "value" | "formula"; message: string }>;

export function buildConditionFromDraft(
  draft: ConditionalFormatEditorDraft,
  t: (key: MessageKey) => string,
): BuildConditionResult {
  if (draft.kind === "blank") return { ok: true, condition: { kind: "blank", blank: draft.blank } };
  if (draft.kind === "error")
    return { ok: true, condition: { kind: "error", error: draft.hasError } };
  if (draft.kind === "duplicate")
    return { ok: true, condition: { kind: "duplicate", unique: draft.unique } };
  if (draft.kind === "rank") {
    if (
      !Number.isInteger(draft.count) ||
      draft.count < 1 ||
      draft.count > (draft.percent ? 100 : 1000)
    ) {
      return { ok: false, field: "value", message: t("conditionalFormatting.invalidCount") };
    }
    return {
      ok: true,
      condition: {
        kind: "rank",
        count: draft.count,
        percent: draft.percent || undefined,
        bottom: draft.bottom || undefined,
      },
    };
  }
  if (draft.kind === "average")
    return {
      ok: true,
      condition: {
        kind: "average",
        above: draft.above,
        ...(draft.equalAverage === undefined ? {} : { equalAverage: draft.equalAverage }),
        ...(draft.stdDev === undefined ? {} : { stdDev: draft.stdDev }),
      },
    };
  if (draft.kind === "date")
    return { ok: true, condition: { kind: "date", period: draft.datePeriod as never } };
  const visual = buildVisualConditionFromDraft(draft);
  if (visual) return { ok: true, condition: visual };
  if (draft.kind === "formula") {
    if (!draft.formula.trim().startsWith("=")) {
      return { ok: false, field: "formula", message: t("conditionalFormatting.invalidFormula") };
    }
    return { ok: true, condition: { kind: "formula", formula: draft.formula.trim() } };
  }
  if (!draft.value.trim()) {
    return { ok: false, field: "value", message: t("conditionalFormatting.invalidValue") };
  }
  if (draft.kind === "text")
    return {
      ok: true,
      condition: {
        kind: "text",
        operator: draft.operator as never,
        text: parseConditionalFormatTextOperand(draft.value, draft.valueIsString),
      },
    };
  const needsSecondValue =
    draft.kind === "cellValue" && ["between", "notBetween"].includes(draft.operator);
  const value = parseConditionalFormatValueOperand(draft.value, draft.valueIsString);
  const secondValue = parseConditionalFormatValueOperand(
    draft.secondValue,
    draft.secondValueIsString,
  );
  if (needsSecondValue && !draft.secondValue.trim()) {
    return { ok: false, field: "value", message: t("conditionalFormatting.invalidValue") };
  }
  return {
    ok: true,
    condition: {
      kind: "cellValue",
      operator: draft.operator as never,
      value,
      ...(needsSecondValue ? { secondValue } : {}),
    },
  };
}
