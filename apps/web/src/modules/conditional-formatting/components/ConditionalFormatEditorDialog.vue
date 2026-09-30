<script setup lang="ts">
import {
  normalizeConditionalFormatRules,
  cloneConditionalFormatRule,
  mapConditionalFormatFormulas,
  type ConditionalFormatStyle,
  type ConditionalFormatIconSet,
  type ConditionalFormatIconThreshold,
  type ConditionalFormatThreshold,
  type SheetConditionalFormatRule,
} from "@idea10/core/conditional-formatting";
import { translateFormulaForCopy } from "@idea10/core/formula";
import { toWorkbookErrorData } from "@idea10/core/errors";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect, Option as TOption } from "tdesign-vue-next/es/select";
import { computed, reactive, ref, watch } from "vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import ConditionalFormatStyleSelect from "./ConditionalFormatStyleSelect.vue";
import ConditionalFormatStyleDialog from "./ConditionalFormatStyleDialog.vue";
import ConditionalFormatRankCriteria from "./ConditionalFormatRankCriteria.vue";
import ConditionalFormatAverageCriteria from "./ConditionalFormatAverageCriteria.vue";
import ConditionalFormatDuplicateCriteria from "./ConditionalFormatDuplicateCriteria.vue";
import ConditionalFormatContainingCriteria, {
  type ContainingRuleType,
} from "./ConditionalFormatContainingCriteria.vue";
import { conditionalFormatPresetStyle } from "../conditional-format-quick-rules";
import ConditionalFormatPreview from "./ConditionalFormatPreview.vue";
import ConditionalFormatThresholdField from "./ConditionalFormatThresholdField.vue";
import ConditionalFormatIconRules from "./ConditionalFormatIconRules.vue";
import DataBarAdvancedSettingsDialog, {
  type DataBarAdvancedSettings,
} from "./DataBarAdvancedSettingsDialog.vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import {
  getConditionalFormatPreset,
  iconSetPresetTiles,
  type ConditionalFormatPresetKind,
} from "../conditional-format-presets";
import {
  createConditionalFormatRuleId,
  formatConditionalFormatValueOperand,
  formatConditionalFormatRanges,
  parseConditionalFormatValueOperand,
  parseConditionalFormatTextOperand,
  parseConditionalFormatRanges,
} from "../conditional-formatting-ui";

type ConditionKind = SheetConditionalFormatRule["condition"]["kind"];
export type ConditionalFormatEditorKind =
  | ConditionKind
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
type ThresholdKind = ConditionalFormatThreshold["kind"];
type EditorDraft = {
  id: string;
  ranges: string;
  kind: ConditionKind;
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
  minimumKind: ThresholdKind;
  minimumValue: string;
  maximumKind: ThresholdKind;
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
  middleKind: ThresholdKind;
  middleValue: string;
  minColor: string;
  midColor: string;
  maxColor: string;
  iconSet: ConditionalFormatIconSet;
  iconThresholds: ConditionalFormatIconThreshold[];
  iconIcons: ({ iconSet: ConditionalFormatIconSet; iconIndex: number } | null)[] | undefined;
  reverse: boolean;
};
const props = defineProps<{
  visible: boolean;
  rule?: SheetConditionalFormatRule;
  ranges: string;
  initialKind?: ConditionalFormatEditorKind;
  sampleValue?: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
  selectReference?: (current: string) => Promise<string | undefined>;
  selectValueReference?: (current: string) => Promise<string | undefined>;
}>();
const emit = defineEmits<{
  close: [];
  save: [rule: SheetConditionalFormatRule];
}>();
const { t } = useAppI18n();
const iconSets = iconSetPresetTiles;
const draft = reactive<EditorDraft>(createDraft());
const format = ref<ConditionalFormatStyle>(
  props.rule
    ? cloneConditionalFormatRule(props.rule).style
    : conditionalFormatPresetStyle("redFillText"),
);
const customVisible = ref(false);
const dataBarAdvancedVisible = ref(false);
const pickingRange = ref(false);
async function selectRange(current: string): Promise<string | undefined> {
  pickingRange.value = true;
  try {
    return await props.selectReference?.(current);
  } finally {
    pickingRange.value = false;
  }
}
async function selectValueReference(current: string): Promise<string | undefined> {
  pickingRange.value = true;
  try {
    return await props.selectValueReference?.(current);
  } finally {
    pickingRange.value = false;
  }
}
const showVisualOnly = computed({
  get: () => !draft.showValue,
  set: (value: boolean) => {
    draft.showValue = !value;
  },
});
function iconOptionCondition(
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
const error = reactive({ ranges: "", value: "", formula: "", format: "" });
type RuleCategory = "visual" | "containing" | "rank" | "average" | "duplicate" | "formula";
const categoryOptions = computed(
  () =>
    [
      { value: "visual", label: t("conditionalFormatting.ruleAllValues") },
      { value: "containing", label: t("conditionalFormatting.ruleContaining") },
      { value: "rank", label: t("conditionalFormatting.ruleRank") },
      { value: "average", label: t("conditionalFormatting.ruleAverage") },
      { value: "duplicate", label: t("conditionalFormatting.ruleDuplicate") },
      { value: "formula", label: t("conditionalFormatting.formula") },
    ] as const,
);
const category = computed<RuleCategory>(() =>
  ["dataBar", "colorScale", "iconSet"].includes(draft.kind)
    ? "visual"
    : ["cellValue", "text", "blank", "date", "error"].includes(draft.kind)
      ? "containing"
      : (draft.kind as RuleCategory),
);
const hasInlineFormat = computed(() => category.value !== "visual" && category.value !== "formula");
const ruleDescription = computed(() => {
  switch (category.value) {
    case "containing":
      return t("conditionalFormatting.containingDescription");
    case "rank":
      return t("conditionalFormatting.rankDescription");
    case "average":
      return t("conditionalFormatting.averageDescription");
    case "duplicate":
      return t("conditionalFormatting.duplicateDescription");
    default:
      return categoryOptions.value.find((option) => option.value === category.value)?.label;
  }
});
function selectCategory(value: RuleCategory) {
  if (value === category.value) return;
  updateKind(value === "visual" ? "colorScale" : value === "containing" ? "cellValue" : value);
}
const containingType = computed<ContainingRuleType>({
  get: () =>
    draft.kind === "blank"
      ? draft.blank
        ? "blank"
        : "nonBlank"
      : draft.kind === "error"
        ? draft.hasError
          ? "error"
          : "nonError"
        : (draft.kind as ContainingRuleType),
  set: (value) => {
    if (value === containingType.value) return;
    if (value === "blank" || value === "nonBlank") {
      updateKind("blank");
      draft.blank = value === "blank";
    } else if (value === "error" || value === "nonError") {
      updateKind("error");
      draft.hasError = value === "error";
    } else updateKind(value);
    error.value = "";
  },
});
const visualStyle = computed({
  get: () => (draft.kind === "colorScale" ? `scale${draft.scaleStops}` : draft.kind),
  set: (value: string) => {
    if (value === "scale2" || value === "scale3") {
      updateKind("colorScale");
      draft.scaleStops = value === "scale2" ? 2 : 3;
    } else updateKind(value as ConditionKind);
  },
});
const visualOptions = computed(() => [
  { value: "scale2", label: t("conditionalFormatting.twoColorScale") },
  { value: "scale3", label: t("conditionalFormatting.threeColorScale") },
  { value: "dataBar", label: t("conditionalFormatting.dataBars") },
  { value: "iconSet", label: t("conditionalFormatting.iconSets") },
]);
const iconOptions = computed(() =>
  iconSets.map((value) => ({
    value,
    label: t(`conditionalFormatting.${value}` as MessageKey),
  })),
);
const needsSecondValue = computed(
  () => draft.kind === "cellValue" && ["between", "notBetween"].includes(draft.operator),
);
const formulaPlaceholder = '=$D2="Overdue"';
function threshold(kind: ThresholdKind, value: string): ConditionalFormatThreshold {
  if (kind === "min" || kind === "max" || kind === "autoMin" || kind === "autoMax") return { kind };
  if (kind === "formula") return { kind, formula: value };
  return { kind, value: value.trim() === "" ? Number.NaN : Number(value) };
}
function quickKind(kind: ConditionalFormatEditorKind | undefined): ConditionKind {
  if (["greaterThan", "lessThan", "between", "equal"].includes(kind ?? "")) return "cellValue";
  if (kind === "contains") return "text";
  if (["top10Items", "top10Percent", "bottom10Items", "bottom10Percent"].includes(kind ?? ""))
    return "rank";
  if (["aboveAverage", "belowAverage"].includes(kind ?? "")) return "average";
  if (
    [
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
    ].includes(kind ?? "")
  )
    return "date";
  return (kind ?? "colorScale") as ConditionKind;
}

function createDraft(rule = props.rule): EditorDraft {
  const displayedRule =
    rule &&
    mapConditionalFormatFormulas(rule, (formula) =>
      translateFormulaForCopy(formula, {
        row: rule.ranges[0]!.start.row - rule.anchor.row,
        column: rule.ranges[0]!.start.column - rule.anchor.column,
      }),
    );
  const c = displayedRule?.condition ?? getConditionalFormatPreset(props.initialKind ?? "");
  const draftKind = c?.kind ?? quickKind(props.initialKind);
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
    ranges: rule ? formatConditionalFormatRanges(rule.ranges) : props.ranges,
    kind: draftKind,
    operator:
      c?.kind === "cellValue" || c?.kind === "text"
        ? c.operator
        : props.initialKind === "contains"
          ? "contains"
          : ["lessThan", "between", "equal"].includes(props.initialKind ?? "")
            ? props.initialKind!
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
        : props.initialKind === "top10Percent" || props.initialKind === "bottom10Percent",
    bottom:
      c?.kind === "rank"
        ? Boolean(c.bottom)
        : props.initialKind === "bottom10Items" || props.initialKind === "bottom10Percent",
    above: c?.kind === "average" ? c.above : props.initialKind !== "belowAverage",
    equalAverage: c?.kind === "average" ? c.equalAverage : undefined,
    stdDev: c?.kind === "average" ? c.stdDev : undefined,
    datePeriod:
      c?.kind === "date"
        ? c.period
        : (([
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
          ].includes(props.initialKind ?? "")
            ? props.initialKind
            : "today") as string),
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
    middleValue: middleValue,
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
function resetDraft() {
  format.value = props.rule
    ? cloneConditionalFormatRule(props.rule).style
    : conditionalFormatPresetStyle("redFillText");
  customVisible.value = false;
  dataBarAdvancedVisible.value = false;
  Object.assign(draft, createDraft());
  Object.assign(error, { ranges: "", value: "", formula: "", format: "" });
}
function updateKind(kind: ConditionKind) {
  const wasDataBar = draft.kind === "dataBar";
  draft.kind = kind;
  if (kind === "text") draft.operator = "contains";
  if (kind === "cellValue") draft.operator = "between";
  if (kind === "dataBar") {
    draft.minimumKind = "autoMin";
    draft.maximumKind = "autoMax";
  }
  if (wasDataBar && kind !== "dataBar") {
    if (draft.minimumKind === "autoMin") draft.minimumKind = "min";
    if (draft.maximumKind === "autoMax") draft.maximumKind = "max";
  }
}
function updateOperand(value: string, second = false): void {
  if (second) {
    draft.secondValue = value;
    draft.secondValueIsString = false;
  } else {
    draft.value = value;
    draft.valueIsString = false;
  }
}
function setIconThresholdKind(index: number, kind: ThresholdKind): void {
  const previous = draft.iconThresholds[index];
  const next = threshold(
    kind,
    previous && "value" in previous
      ? String(previous.value)
      : previous?.kind === "formula"
        ? previous.formula
        : String(Math.round((index / draft.iconThresholds.length) * 100)),
  );
  draft.iconThresholds[index] = {
    ...next,
    ...(previous?.inclusive === false ? { inclusive: false } : {}),
  };
}
function setIconThresholdValue(index: number, value: string): void {
  const previous = draft.iconThresholds[index];
  if (!previous) return;
  const kind = value.trim().startsWith("=") ? "formula" : previous.kind;
  draft.iconThresholds[index] = {
    ...threshold(kind, value),
    ...(previous.inclusive === false ? { inclusive: false } : {}),
  };
}
function setIconThresholdInclusive(index: number, inclusive: boolean): void {
  const previous = draft.iconThresholds[index];
  if (!previous) return;
  draft.iconThresholds[index] = { ...previous, inclusive: inclusive ? undefined : false };
}
function setIconSet(iconSet: ConditionalFormatIconSet): void {
  if (draft.iconSet === iconSet) return;
  draft.iconSet = iconSet;
  draft.iconIcons = undefined;
}
function setIcon(
  index: number,
  icon: { iconSet: ConditionalFormatIconSet; iconIndex: number } | null,
): void {
  const length = draft.iconThresholds.length;
  const rawIndex = draft.reverse ? length - index - 1 : index;
  const icons =
    draft.iconIcons ??
    Array.from({ length }, (_, iconIndex) => ({
      iconSet: draft.iconSet,
      iconIndex,
    }));
  icons[rawIndex] = icon;
  draft.iconIcons = icons;
}
watch(
  () => draft.iconSet,
  (kind) => {
    const count = kind.startsWith("three") ? 3 : kind.startsWith("four") ? 4 : 5;
    if (draft.iconThresholds.length !== count)
      draft.iconThresholds = Array.from({ length: count }, (_, index) =>
        threshold("percent", String(Math.round((index / count) * 100))),
      );
    if (draft.iconIcons && draft.iconIcons.length !== count) draft.iconIcons = undefined;
  },
);
function buildVisualCondition(): SheetConditionalFormatRule["condition"] | undefined {
  if (draft.kind === "dataBar")
    return {
      kind: "dataBar",
      minimum: threshold(draft.minimumKind, draft.minimumValue),
      maximum: threshold(draft.maximumKind, draft.maximumValue),
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
        threshold: threshold(draft.minimumKind, draft.minimumValue),
        color: draft.minColor,
      },
      {
        threshold: threshold(draft.middleKind, draft.middleValue),
        color: draft.midColor,
      },
      {
        threshold: threshold(draft.maximumKind, draft.maximumValue),
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
        ? draft.iconThresholds.map((threshold) => ({ ...threshold }))
        : Array.from({ length: n }, (_, i) =>
            threshold("percent", String(Math.round((i / n) * 100))),
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
const previewCondition = computed(buildVisualCondition);
function buildCondition(): SheetConditionalFormatRule["condition"] | null {
  if (draft.kind === "blank") return { kind: "blank", blank: draft.blank };
  if (draft.kind === "error") return { kind: "error", error: draft.hasError };
  if (draft.kind === "duplicate") return { kind: "duplicate", unique: draft.unique };
  if (draft.kind === "rank") {
    if (
      !Number.isInteger(draft.count) ||
      draft.count < 1 ||
      draft.count > (draft.percent ? 100 : 1000)
    ) {
      error.value = t("conditionalFormatting.invalidCount");
      return null;
    }
    return {
      kind: "rank",
      count: draft.count,
      percent: draft.percent || undefined,
      bottom: draft.bottom || undefined,
    };
  }
  if (draft.kind === "average")
    return {
      kind: "average",
      above: draft.above,
      ...(draft.equalAverage === undefined ? {} : { equalAverage: draft.equalAverage }),
      ...(draft.stdDev === undefined ? {} : { stdDev: draft.stdDev }),
    };
  if (draft.kind === "date") return { kind: "date", period: draft.datePeriod as never };
  const visual = buildVisualCondition();
  if (visual) return visual;
  if (draft.kind === "formula") {
    if (!draft.formula.trim().startsWith("=")) {
      error.formula = t("conditionalFormatting.invalidFormula");
      return null;
    }
    return { kind: "formula", formula: draft.formula.trim() };
  }
  if (!draft.value.trim()) {
    error.value = t("conditionalFormatting.invalidValue");
    return null;
  }
  if (draft.kind === "text")
    return {
      kind: "text",
      operator: draft.operator as never,
      text: parseConditionalFormatTextOperand(draft.value, draft.valueIsString),
    };
  const value = parseConditionalFormatValueOperand(draft.value, draft.valueIsString);
  const secondValue = parseConditionalFormatValueOperand(
    draft.secondValue,
    draft.secondValueIsString,
  );
  if (needsSecondValue.value && !draft.secondValue.trim()) {
    error.value = t("conditionalFormatting.invalidValue");
    return null;
  }
  return {
    kind: "cellValue",
    operator: draft.operator as never,
    value,
    ...(needsSecondValue.value ? { secondValue } : {}),
  };
}
function save() {
  Object.assign(error, { ranges: "", value: "", formula: "", format: "" });
  const ranges = parseConditionalFormatRanges(draft.ranges);
  if (!ranges) {
    error.ranges = t("conditionalFormatting.invalidRange");
    return;
  }
  const condition = buildCondition();
  if (!condition) return;
  const candidate: SheetConditionalFormatRule = {
    id: draft.id,
    ranges,
    anchor: { ...ranges[0]!.start },
    condition,
    style:
      draft.kind === "dataBar" || draft.kind === "colorScale" || draft.kind === "iconSet"
        ? {}
        : format.value,
    ...(props.rule?.stopIfTrue && category.value !== "visual" ? { stopIfTrue: true } : {}),
  };
  try {
    emit("save", normalizeConditionalFormatRules([candidate])[0]!);
  } catch (cause) {
    const field = toWorkbookErrorData(cause).details?.field;
    if (typeof field === "string" && field.endsWith(".range")) {
      const message = t("conditionalFormatting.singleValueRequired");
      if (category.value === "visual") error.format = message;
      else if (draft.kind === "formula") error.formula = message;
      else error.value = message;
      return;
    }
    if (typeof field === "string" && field.endsWith(".formula")) {
      if (category.value === "visual")
        error.format = t("conditionalFormatting.invalidThresholdFormula");
      else error.formula = t("conditionalFormatting.invalidFormula");
      return;
    }
    if (
      field === "condition.value" ||
      field === "condition.secondValue" ||
      field === "condition.text"
    ) {
      error.value = t("conditionalFormatting.invalidFormula");
      return;
    }
    error.format = t(
      ["dataBar", "colorScale", "iconSet"].includes(draft.kind)
        ? "conditionalFormatting.invalidThresholds"
        : "conditionalFormatting.invalidFormat",
    );
  }
}
function updateDataBarAdvancedSettings(settings: DataBarAdvancedSettings): void {
  draft.negativeColor = settings.negativeColor;
  draft.negativeBorderColor = settings.negativeBorderColor;
  draft.axisPosition = settings.axisPosition;
  draft.axisColor = settings.axisColor;
  dataBarAdvancedVisible.value = false;
}
watch(() => [props.visible, props.rule, props.ranges], resetDraft, {
  deep: true,
});
</script>
<template>
  <Dialog
    :visible="visible && !customVisible && !pickingRange && !dataBarAdvancedVisible"
    :header="rule ? t('conditionalFormatting.editRule') : t('conditionalFormatting.newRule')"
    :confirm-btn="{ content: t('conditionalFormatting.save') }"
    :cancel-btn="t('conditionalFormatting.cancel')"
    :close-on-overlay-click="false"
    width="min(640px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="emit('close')"
  >
    <TForm
      class="conditional-format-editor idea-form-grid"
      layout="vertical"
      label-align="right"
      :label-width="88"
    >
      <section class="conditional-format-editor__section">
        <h3>{{ t("conditionalFormatting.selectRuleType") }}</h3>
        <OptionList
          :model-value="category"
          :options="categoryOptions"
          :label="t('conditionalFormatting.selectRuleType')"
          variant="compact"
          @select="selectCategory"
        />
      </section>
      <TFormItem
        :label="t('conditionalFormatting.appliesTo')"
        :tips="error.ranges"
        label-align="left"
      >
        <RangeReferenceInput
          v-model="draft.ranges"
          :label="t('conditionalFormatting.appliesTo')"
          class="conditional-format-editor__range"
          :show-picker="true"
          :select-reference="selectReference ? selectRange : undefined"
        />
      </TFormItem>
      <section class="conditional-format-editor__section">
        <h3>{{ t("conditionalFormatting.editRuleDescription") }}</h3>
        <p class="conditional-format-editor__description">
          {{ ruleDescription }}
        </p>
        <div v-if="category === 'visual'" class="conditional-format-editor__visual-settings">
          <TFormItem :label="t('conditionalFormatting.formatStyle')">
            <TSelect v-model="visualStyle" :options="visualOptions" />
          </TFormItem>
          <TCheckbox v-if="draft.kind === 'dataBar'" v-model="showVisualOnly">{{
            t("conditionalFormatting.showBarOnly")
          }}</TCheckbox>
          <TButton
            v-if="draft.kind === 'iconSet'"
            variant="outline"
            :aria-pressed="draft.reverse"
            @click="draft.reverse = !draft.reverse"
            >{{ t("conditionalFormatting.reverse") }}</TButton
          >
          <template v-if="draft.kind === 'iconSet'">
            <TFormItem :label="t('conditionalFormatting.iconStyle')">
              <TSelect
                :model-value="draft.iconSet"
                :aria-label="t('conditionalFormatting.iconSet')"
                @update:model-value="setIconSet($event as ConditionalFormatIconSet)"
              >
                <template #valueDisplay>
                  <ConditionalFormatPreview
                    compact
                    :condition="iconOptionCondition(draft.iconSet)"
                  />
                </template>
                <TOption
                  v-for="option in iconOptions"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                >
                  <ConditionalFormatPreview
                    compact
                    :condition="iconOptionCondition(option.value)"
                  />
                </TOption>
              </TSelect>
            </TFormItem>
            <TCheckbox v-model="showVisualOnly">{{
              t("conditionalFormatting.showIconsOnly")
            }}</TCheckbox>
          </template>
        </div>
        <ConditionalFormatContainingCriteria
          v-if="category === 'containing'"
          v-model:type="containingType"
          v-model:operator="draft.operator"
          v-model:date-period="draft.datePeriod"
          :value="draft.value"
          :second-value="draft.secondValue"
          :error="error.value"
          :select-value-reference="props.selectValueReference ? selectValueReference : undefined"
          @update:value="updateOperand($event)"
          @update:second-value="updateOperand($event, true)"
        />
        <ConditionalFormatRankCriteria
          v-else-if="draft.kind === 'rank'"
          v-model:bottom="draft.bottom"
          v-model:count="draft.count"
          v-model:percent="draft.percent"
          :error="error.value"
        />
        <ConditionalFormatAverageCriteria
          v-else-if="draft.kind === 'average'"
          v-model:above="draft.above"
          v-model:equal-average="draft.equalAverage"
          v-model:std-dev="draft.stdDev"
        />
        <template v-else-if="draft.kind === 'dataBar' || draft.kind === 'colorScale'">
          <div
            class="conditional-format-editor__thresholds"
            :class="{
              'has-midpoint': draft.kind === 'colorScale' && draft.scaleStops === 3,
              'is-data-bar': draft.kind === 'dataBar',
            }"
          >
            <div class="conditional-format-editor__row-labels" aria-hidden="true">
              <span></span><span>{{ t("conditionalFormatting.thresholdType") }}</span
              ><span>{{ t("conditionalFormatting.value") }}</span
              ><span v-if="draft.kind === 'colorScale'">{{
                t("conditionalFormatting.color")
              }}</span>
            </div>
            <div
              class="conditional-format-editor__threshold-column"
              role="group"
              :aria-label="t('conditionalFormatting.minimum')"
            >
              <span>{{ t("conditionalFormatting.minimum") }}</span>
              <ConditionalFormatThresholdField
                v-model:kind="draft.minimumKind"
                v-model:value="draft.minimumValue"
                stacked
                :data-bar-bound="draft.kind === 'dataBar' ? 'minimum' : undefined"
                :label="t('conditionalFormatting.minimum')"
                :select-value-reference="
                  props.selectValueReference ? selectValueReference : undefined
                "
              />
              <ColorPaletteSelect
                v-if="draft.kind === 'colorScale'"
                :model-value="draft.minColor"
                :label="t('conditionalFormatting.minimum')"
                default-color="#F8696B"
                :default-label="t('conditionalFormatting.automatic')"
                @select="draft.minColor = $event ?? '#F8696B'"
              />
            </div>
            <div
              v-if="draft.kind === 'colorScale' && draft.scaleStops === 3"
              class="conditional-format-editor__threshold-column"
              role="group"
              :aria-label="t('conditionalFormatting.midpoint')"
            >
              <span>{{ t("conditionalFormatting.midpoint") }}</span>
              <ConditionalFormatThresholdField
                v-model:kind="draft.middleKind"
                v-model:value="draft.middleValue"
                stacked
                :label="t('conditionalFormatting.midpoint')"
                :select-value-reference="
                  props.selectValueReference ? selectValueReference : undefined
                "
              />
              <ColorPaletteSelect
                :model-value="draft.midColor"
                :label="t('conditionalFormatting.midpoint')"
                default-color="#FFEB84"
                :default-label="t('conditionalFormatting.automatic')"
                @select="draft.midColor = $event ?? '#FFEB84'"
              />
            </div>
            <div
              class="conditional-format-editor__threshold-column"
              role="group"
              :aria-label="t('conditionalFormatting.maximum')"
            >
              <span>{{ t("conditionalFormatting.maximum") }}</span>
              <ConditionalFormatThresholdField
                v-model:kind="draft.maximumKind"
                v-model:value="draft.maximumValue"
                stacked
                :data-bar-bound="draft.kind === 'dataBar' ? 'maximum' : undefined"
                :label="t('conditionalFormatting.maximum')"
                :select-value-reference="
                  props.selectValueReference ? selectValueReference : undefined
                "
              />
              <ColorPaletteSelect
                v-if="draft.kind === 'colorScale'"
                :model-value="draft.maxColor"
                :label="t('conditionalFormatting.maximum')"
                default-color="#63BE7B"
                :default-label="t('conditionalFormatting.automatic')"
                @select="draft.maxColor = $event ?? '#63BE7B'"
              />
            </div>
          </div>
          <section v-if="draft.kind === 'dataBar'" class="conditional-format-editor__section">
            <h3>{{ t("conditionalFormatting.barAppearance") }}</h3>
            <div class="conditional-format-editor__bar-appearance">
              <TFormItem label-align="top" :label="t('conditionalFormatting.barFill')">
                <TSelect
                  v-model="draft.gradient"
                  :aria-label="t('conditionalFormatting.barFill')"
                  :options="[
                    { value: false, label: t('conditionalFormatting.solid') },
                    { value: true, label: t('conditionalFormatting.gradient') },
                  ]"
                />
              </TFormItem>
              <TFormItem label-align="top" :label="t('conditionalFormatting.color')">
                <ColorPaletteSelect
                  :model-value="draft.barColor"
                  :label="t('conditionalFormatting.barColor')"
                  default-color="#638EC6"
                  :default-label="t('conditionalFormatting.automatic')"
                  @select="draft.barColor = $event ?? '#638EC6'"
                />
              </TFormItem>
              <TFormItem label-align="top" :label="t('conditionalFormatting.border')">
                <TSelect
                  :model-value="draft.borderColor !== undefined"
                  :aria-label="t('conditionalFormatting.border')"
                  :options="[
                    { value: false, label: t('conditionalFormatting.noBorder') },
                    { value: true, label: t('conditionalFormatting.solidBorder') },
                  ]"
                  @update:model-value="
                    draft.borderColor = $event ? (draft.borderColor ?? draft.barColor) : undefined
                  "
                />
              </TFormItem>
              <TFormItem label-align="top" :label="t('conditionalFormatting.borderColor')">
                <ColorPaletteSelect
                  :model-value="draft.borderColor"
                  :label="t('conditionalFormatting.borderColor')"
                  :default-color="draft.barColor"
                  :default-label="t('conditionalFormatting.sameAsBar')"
                  :disabled="draft.borderColor === undefined"
                  @select="draft.borderColor = $event ?? draft.barColor"
                />
              </TFormItem>
            </div>
            <div class="conditional-format-editor__bar-actions">
              <TButton variant="outline" @click="dataBarAdvancedVisible = true">{{
                t("conditionalFormatting.negativeAndAxis")
              }}</TButton>
              <TFormItem :label="t('conditionalFormatting.barDirection')">
                <TSelect
                  v-model="draft.direction"
                  :aria-label="t('conditionalFormatting.barDirection')"
                  :options="[
                    { value: 'context', label: t('conditionalFormatting.directionContext') },
                    {
                      value: 'leftToRight',
                      label: t('conditionalFormatting.directionLeftToRight'),
                    },
                    {
                      value: 'rightToLeft',
                      label: t('conditionalFormatting.directionRightToLeft'),
                    },
                  ]"
                />
              </TFormItem>
            </div>
          </section>
        </template>
        <ConditionalFormatIconRules
          v-else-if="draft.kind === 'iconSet' && previewCondition?.kind === 'iconSet'"
          :condition="previewCondition"
          :select-value-reference="props.selectValueReference ? selectValueReference : undefined"
          @update-kind="setIconThresholdKind"
          @update-value="setIconThresholdValue"
          @update-inclusive="setIconThresholdInclusive"
          @update-icon="setIcon"
        />
        <ConditionalFormatDuplicateCriteria
          v-else-if="draft.kind === 'duplicate'"
          v-model:unique="draft.unique"
        />
        <TFormItem
          v-else-if="draft.kind === 'formula'"
          :label="t('conditionalFormatting.formula')"
          label-align="top"
          :tips="error.formula || t('conditionalFormatting.formulaHint')"
          ><TInput v-model="draft.formula" :placeholder="formulaPlaceholder"
        /></TFormItem>
        <div v-if="hasInlineFormat" class="conditional-format-editor__rule-format">
          <span>{{ t("conditionalFormatting.preview") }}</span>
          <ConditionalFormatPreview
            wide
            control
            :format="format"
            :text="Object.keys(format).length ? undefined : t('conditionalFormatting.noFormat')"
          />
          <TButton variant="outline" @click="customVisible = true">{{
            t("conditionalFormatting.editFormat")
          }}</TButton>
        </div>
        <TFormItem v-else-if="category !== 'visual'" :label="t('conditionalFormatting.format')">
          <ConditionalFormatStyleSelect
            v-model="format"
            :sample-value="sampleValue"
            :date-system="dateSystem"
            @custom-visible="customVisible = $event"
          />
        </TFormItem>
        <div
          v-if="draft.kind !== 'iconSet' && !hasInlineFormat"
          class="conditional-format-editor__preview"
        >
          <span>{{ t("conditionalFormatting.preview") }}</span
          ><ConditionalFormatPreview
            wide
            :condition="previewCondition"
            :format="category === 'visual' ? undefined : format"
          />
        </div>
      </section>
      <p v-if="error.format" class="conditional-format-editor__error" role="alert">
        {{ error.format }}
      </p>
    </TForm>
  </Dialog>
  <ConditionalFormatStyleDialog
    v-if="hasInlineFormat && customVisible"
    :style="format"
    :sample-value="sampleValue"
    :date-system="dateSystem"
    @confirm="
      format = $event;
      customVisible = false;
    "
    @cancel="customVisible = false"
  />
  <DataBarAdvancedSettingsDialog
    :visible="dataBarAdvancedVisible"
    :settings="{
      negativeColor: draft.negativeColor,
      negativeBorderColor: draft.negativeBorderColor,
      axisPosition: draft.axisPosition,
      axisColor: draft.axisColor,
    }"
    :positive-border-color="draft.borderColor"
    @close="dataBarAdvancedVisible = false"
    @save="updateDataBarAdvancedSettings"
  />
</template>
<style scoped lang="scss">
.conditional-format-editor {
  display: grid;
  gap: 12px;
  max-height: calc(100vh - 172px);
  overflow: auto;
  &__section {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    font-weight: var(--idea-font-weight-semibold);
  }
  &__description {
    margin: 0;
    color: var(--idea-text-secondary);
  }
  &__range {
    width: 100%;
  }
  &__visual-settings {
    display: grid;
    grid-template-columns: minmax(0, 320px) auto;
    align-items: center;
    justify-content: start;
    gap: 8px 12px;
    > * {
      min-width: 0;
    }
    > button {
      justify-self: start;
    }
  }
  &__rule-format {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    > span:first-child {
      text-align: right;
      color: var(--idea-text-secondary);
    }
  }
  &__thresholds {
    display: grid;
    grid-template-columns: 80px repeat(2, minmax(0, 1fr));
    gap: 8px;
    &.has-midpoint {
      grid-template-columns: 80px repeat(3, minmax(0, 1fr));
    }
    &.is-data-bar {
      .conditional-format-editor__row-labels {
        grid-template-rows: 20px repeat(2, 28px);
      }
      .conditional-format-editor__threshold-column {
        grid-template-rows: 20px 64px;
      }
    }
  }
  &__row-labels {
    display: grid;
    grid-template-rows: 20px repeat(3, 28px);
    gap: 8px;
    align-items: center;
    text-align: right;
    color: var(--idea-text-secondary);
  }
  &__threshold-column {
    display: grid;
    grid-template-rows: 20px 64px 28px;
    gap: 8px;
    min-width: 0;
  }
  &__bar-appearance,
  &__bar-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  &__bar-actions {
    align-items: center;
    > :last-child {
      grid-column: span 3;
      min-width: 0;
    }
  }
  &__preview {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    > span {
      text-align: right;
    }
  }
  @media (max-width: 560px) {
    &__visual-settings {
      grid-template-columns: minmax(0, 1fr);
    }
    &__bar-appearance {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    &__bar-actions {
      grid-template-columns: 1fr;
      > :last-child {
        grid-column: auto;
      }
    }
  }
  &__error {
    color: var(--idea-status-error);
    margin: 0;
  }
}
</style>
