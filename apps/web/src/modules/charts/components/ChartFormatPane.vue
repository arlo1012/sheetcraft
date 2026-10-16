<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { ChartNoAxesColumn, RotateCcw, X } from "lucide-vue-next";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import type {
  ChartAxisLineFormat,
  ChartCategoryAxisFormat,
  ChartTextFormat,
  ChartSeriesFormat,
  ChartValueAxisFormat,
} from "@sheetcraft/core/chart-format";
import {
  formatCellNumberValue,
  validateCellNumberFormatCode,
} from "@sheetcraft/core/number-format";
import type { CellNumberFormat, CellNumberFormatNegativeStyle } from "@sheetcraft/core/style";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import OptionList from "../../../shared/option-list/OptionList.vue";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import FormatSection from "../../../shared/format-pane/FormatSection.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
  NumericValue,
} from "../../../shared/numeric-field/types";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import FontSettingsAction from "../../../shared/cell-text/FontSettingsAction.vue";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import { useAppI18n } from "../../../shared/i18n";
import type { MessageKey } from "../../../shared/i18n";
import { getChartElementSettings } from "../chart-elements";
import { chartMinorGridlinesForAxis } from "../chart-axis-state";
import type { ChartElementPatch } from "../chart-element-controls";
import {
  chartFormatTargetKey,
  chartFormatTargetLabelKeys,
  compactChartAxis,
  createChartFormatDraft,
  editChartFormatDraft,
  getChartFormatCapabilities,
  getChartFormatSeries,
  getChartFormatTargets,
  getChartSeriesFormat,
  resolveChartFormatSeriesId,
  getChartValueAxisDraftError,
  type ChartValueAxisDraftError,
  setChartFormatField,
  syncChartFormatDraft,
  type ChartFormatDraft,
  type ChartFormatDraftError,
  type ChartFormatIntent,
  type ChartFormatIntentHandler,
  type ChartFormatNumericField,
  type ChartFormatTarget,
} from "../chart-format-pane";

const props = defineProps<{
  drawing: SheetChartDrawing;
  data: ChartData;
  visibleData?: ChartData;
  target: ChartFormatTarget;
  disabled: boolean;
  error?: string;
  apply: ChartFormatIntentHandler;
}>();
const emit = defineEmits<{ "update:target": [target: ChartFormatTarget]; close: [] }>();
const { t, locale } = useAppI18n();
const paneId = `chart-format-${useId()}`;
const popupProps = { overlayClassName: "chart-format-options-popup" };
const root = ref<HTMLElement>();
const chart = computed(() => props.drawing.chart);
const capabilities = computed(() =>
  getChartFormatCapabilities(
    chart.value,
    props.target.kind === "series" ? props.data : (props.visibleData ?? props.data),
    props.target,
  ),
);
const targets = computed(() =>
  getChartFormatTargets(chart.value, props.data, props.visibleData ?? props.data),
);
const targetKey = computed(() => chartFormatTargetKey(props.target));
const ownerKey = computed(() => `${props.drawing.id}/${targetKey.value}`);
let live = true;
let activeHandler: ChartFormatIntentHandler | undefined;
onBeforeUnmount(() => {
  live = false;
});
/** Event bindings retain the callback and owner of their actual render. */
function captureAction<Args extends unknown[], Result>(action: (...args: Args) => Result) {
  const handler = props.apply,
    owner = ownerKey.value;
  return (...args: Args): Result | false => {
    if (!live || handler !== props.apply || owner !== ownerKey.value) {
      fieldError.value = "rejected";
      return false;
    }
    const previous = activeHandler;
    activeHandler = handler;
    try {
      return action(...args);
    } finally {
      activeHandler = previous;
    }
  };
}
function textAction(field: "title" | "axisTitle" | "formatCode") {
  return captureAction((value: string | number, context: { e: KeyboardEvent | FocusEvent }) =>
    commitText(field, value, context),
  );
}
function editAction(field: string) {
  return captureAction((value: string | number) => edit(field, value));
}
function compositionStartAction(field: string) {
  return captureAction(() => startComposition(field));
}
function compositionEndAction(field: string) {
  return captureAction((value: string, context: { e: CompositionEvent }) =>
    endComposition(field, value, context),
  );
}
const available = computed(() =>
  targets.value.some((target) => chartFormatTargetKey(target) === targetKey.value),
);
const kind = computed(() => (available.value ? props.target.kind : "chart"));
const isValueAxis = computed(
  () => kind.value === "valueAxis" || kind.value === "secondaryValueAxis",
);
const percentageAxis = computed(() => !!chart.value.presentation?.percentStacked);
const isAxis = computed(() => kind.value === "categoryAxis" || isValueAxis.value);
const valueAxis = computed<ChartValueAxisFormat>(() =>
  kind.value === "secondaryValueAxis"
    ? (chart.value.format?.secondaryValueAxis ?? {})
    : (chart.value.format?.valueAxis ?? {}),
);
const minorGridlinesState = computed(() => {
  if (!isValueAxis.value) return { checked: false, invalid: false };
  try {
    return {
      checked: chartMinorGridlinesForAxis(
        chart.value,
        props.visibleData ?? props.data,
        kind.value === "secondaryValueAxis",
      ),
      invalid: false,
    };
  } catch {
    return { checked: false, invalid: true };
  }
});
const categoryAxis = computed(() => chart.value.format?.categoryAxis ?? {});
const axis = computed<ChartCategoryAxisFormat | ChartValueAxisFormat>(() =>
  kind.value === "categoryAxis" ? categoryAxis.value : valueAxis.value,
);
const series = computed(() => {
  if (props.target.kind !== "series") return {};
  const id = resolveChartFormatSeriesId(chart.value, props.target);
  return id ? getChartSeriesFormat(chart.value, id) : {};
});
const textFormat = computed<ChartTextFormat>(() =>
  kind.value === "title" ? (chart.value.format?.title ?? {}) : (axis.value.text ?? {}),
);
const lineFormat = computed<ChartAxisLineFormat>(() =>
  kind.value === "plot" ? (chart.value.format?.plot ?? {}) : (axis.value.line ?? {}),
);
const elementSettings = computed(() => getChartElementSettings(chart.value));
const barFormat = computed(() => chart.value.format?.bar ?? {});
const fieldError = ref<ChartFormatDraftError>();
let titleLayoutInteraction = false;
let pendingResetField: string | undefined;
const drafts = reactive<Record<string, ChartFormatDraft>>({});
// A dirty draft belongs to the callback that was rendered when editing began.
const draftHandlers = new Map<string, ChartFormatIntentHandler>();
const numericFields: ChartFormatNumericField[] = [
  "min",
  "max",
  "majorUnit",
  "minorUnit",
  "labelAngle",
  "fontSize",
  "strokeWidth",
  "gapWidth",
  "overlap",
];
type SharedNumericField =
  | "min"
  | "max"
  | "majorUnit"
  | "minorUnit"
  | "fontSize"
  | "strokeWidth"
  | "labelAngle"
  | "gapWidth"
  | "overlap"
  | "decimals";
const sharedNumericFields: SharedNumericField[] = [
  "min",
  "max",
  "majorUnit",
  "minorUnit",
  "fontSize",
  "strokeWidth",
  "labelAngle",
  "gapWidth",
  "overlap",
  "decimals",
];
function isSharedNumericField(field: string): field is SharedNumericField {
  return sharedNumericFields.includes(field as SharedNumericField);
}
const minControl = ref<InstanceType<typeof NumericField>>();
const maxControl = ref<InstanceType<typeof NumericField>>();
const majorUnitControl = ref<InstanceType<typeof NumericField>>();
const minorUnitControl = ref<InstanceType<typeof NumericField>>();
const labelAngleControl = ref<InstanceType<typeof NumericField>>();
const gapWidthControl = ref<InstanceType<typeof NumericField>>();
const overlapControl = ref<InstanceType<typeof NumericField>>();
const decimalsControl = ref<InstanceType<typeof NumericField>>();
const acceptedCategoryDecimals = ref<{ owner: string; value: number }>();
const fontSizeControl = ref<InstanceType<typeof NumericField>>();
const strokeWidthControl = ref<InstanceType<typeof NumericField>>();
// NumericField owns these drafts. The pane only mirrors their interaction state
// for its existing composition guard and reset action availability.
const sharedNumericDrafts = reactive<Partial<Record<SharedNumericField, NumericDraftChange>>>({});
const sharedNumericResetErrors = reactive<Partial<Record<SharedNumericField, string>>>({});
// Echo an acknowledged Reset until the next source snapshot arrives. This is
// committed presentation state, never a second editable draft or document writer.
const sharedNumericResets = reactive<Partial<Record<SharedNumericField, string>>>({});
const draftFields = [
  ...numericFields.filter((field) => !isSharedNumericField(field)),
  "title",
  "axisTitle",
  "formatCode",
];
const axisBoundSpec: NumericFieldSpec = {
  displayStep: 1,
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const axisUnitSpec: NumericFieldSpec = {
  ...axisBoundSpec,
  canonicalBounds: { min: 0, minExclusive: true },
};
const fontSizeSpec: NumericFieldSpec = {
  displayUnit: "px",
  displayStep: 1,
  canonicalBounds: { min: 1, max: 256 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const strokeWidthSpec: NumericFieldSpec = {
  displayUnit: "px",
  displayStep: 0.25,
  canonicalBounds: { min: 0, max: 32 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const labelAngleSpec: NumericFieldSpec = {
  displayUnit: "°",
  displayStep: 1,
  canonicalBounds: { min: -90, max: 90 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const gapWidthSpec: NumericFieldSpec = {
  displayUnit: "%",
  displayStep: 1,
  canonicalBounds: { min: 0, max: 500 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const overlapSpec: NumericFieldSpec = {
  displayUnit: "%",
  displayStep: 1,
  canonicalBounds: { min: -100, max: 100 },
  allowAuto: true,
  parsePolicy: { scientific: true },
};
const decimalsSpec: NumericFieldSpec = {
  displayStep: 1,
  canonicalBounds: { min: 0, max: 20 },
  integer: true,
};
function sharedNumericValue(field: SharedNumericField, previous?: NumericValue): NumericValue {
  const value = sharedNumericResets[field] === ownerKey.value ? undefined : numericValue(field);
  if (value === undefined) return previous?.kind === "auto" ? previous : { kind: "auto" };
  return previous?.kind === "value" && previous.value === value
    ? previous
    : { kind: "value", value };
}
const minNumericValue = computed<NumericValue>((previous) => sharedNumericValue("min", previous));
const minCommit = computed(() => sharedNumericCommit("min"));
const maxNumericValue = computed<NumericValue>((previous) => sharedNumericValue("max", previous));
const maxCommit = computed(() => sharedNumericCommit("max"));
const majorUnitNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("majorUnit", previous),
);
const majorUnitCommit = computed(() => sharedNumericCommit("majorUnit"));
const minorUnitNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("minorUnit", previous),
);
const minorUnitCommit = computed(() => sharedNumericCommit("minorUnit"));
const fontSizeNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("fontSize", previous),
);
const strokeWidthNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("strokeWidth", previous),
);
const labelAngleNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("labelAngle", previous),
);
const labelAngleCommit = computed(() => sharedNumericCommit("labelAngle"));
const gapWidthNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("gapWidth", previous),
);
const gapWidthCommit = computed(() => sharedNumericCommit("gapWidth"));
const overlapNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("overlap", previous),
);
const overlapCommit = computed(() => sharedNumericCommit("overlap"));
const decimalsNumericValue = computed<NumericValue>((previous) =>
  sharedNumericValue("decimals", previous),
);
const decimalsCommit = computed(() => sharedNumericCommit("decimals"));
const fontSizeCommit = computed(() => sharedNumericCommit("fontSize"));
const strokeWidthCommit = computed(() => sharedNumericCommit("strokeWidth"));
const axisDraftErrorKeys: Record<ChartValueAxisDraftError, MessageKey> = {
  number: "chart.formatInvalidNumber",
  bounds: "chart.formatAxisBoundsOrder",
  positiveUnit: "chart.formatAxisPositiveUnit",
  minorTooLarge: "chart.formatAxisMinorTooLarge",
  divisionLimit: "chart.formatAxisDivisionLimit",
  unevenDivision: "chart.formatAxisUnevenDivision",
};
function sharedNumericCommit(field: SharedNumericField) {
  const owner = ownerKey.value,
    handler = props.apply,
    category = field === "decimals" ? numberCategory.value : undefined;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (
      !live ||
      owner !== ownerKey.value ||
      handler !== props.apply ||
      (field === "decimals" && category !== numberCategory.value) ||
      candidate.kind === "empty" ||
      (field === "decimals" && candidate.kind !== "value")
    )
      return { accepted: false, error: t("chart.formatApplyFailed") };
    const value = candidate.kind === "auto" ? undefined : candidate.value;
    if (field === "min" || field === "max" || field === "majorUnit" || field === "minorUnit") {
      const error = getChartValueAxisDraftError(
        setChartFormatField(valueAxis.value, field, value) ?? {},
      );
      if (error) return { accepted: false, error: t(axisDraftErrorKeys[error]) };
    }
    const intent = numericIntent(field, value);
    const accepted = !!intent && submit(intent, handler);
    if (accepted) delete sharedNumericResetErrors[field];
    return accepted ? { accepted: true } : { accepted: false, error: t("chart.formatApplyFailed") };
  };
}
function sharedNumericDraftChange(field: SharedNumericField, draft: NumericDraftChange): void {
  if (draft.ownerKey !== `${ownerKey.value}/${field}`) return;
  const previous = sharedNumericDrafts[field];
  sharedNumericDrafts[field] = draft;
  if (draft.text !== previous?.text || !draft.dirty || (previous?.composing && !draft.composing)) {
    delete sharedNumericResetErrors[field];
    fieldError.value = undefined;
  }
}
function sharedNumericFocusBoundary(field: SharedNumericField): Element[] {
  return [
    ...(root.value?.querySelectorAll(
      `[data-chart-format-reset="${field}"], [data-chart-format-reset="element"]`,
    ) ?? []),
  ];
}
function sharedNumericControl(field: SharedNumericField) {
  switch (field) {
    case "min":
      return minControl.value;
    case "max":
      return maxControl.value;
    case "majorUnit":
      return majorUnitControl.value;
    case "minorUnit":
      return minorUnitControl.value;
    case "fontSize":
      return fontSizeControl.value;
    case "strokeWidth":
      return strokeWidthControl.value;
    case "labelAngle":
      return labelAngleControl.value;
    case "gapWidth":
      return gapWidthControl.value;
    case "overlap":
      return overlapControl.value;
    case "decimals":
      return decimalsControl.value;
  }
}
function numericValue(field: ChartFormatNumericField | "decimals"): number | undefined {
  switch (field) {
    case "decimals":
      return acceptedCategoryDecimals.value?.owner === ownerKey.value
        ? acceptedCategoryDecimals.value.value
        : decimals.value;
    case "min":
    case "max":
    case "majorUnit":
    case "minorUnit":
      return valueAxis.value[field];
    case "labelAngle":
      return categoryAxis.value.labelAngle;
    case "fontSize":
      return textFormat.value.fontSize;
    case "strokeWidth":
      return kind.value === "series" ? series.value.strokeWidth : lineFormat.value.strokeWidth;
    case "gapWidth":
    case "overlap":
      return barFormat.value[field];
  }
}
const sourceSeries = computed(() =>
  (chart.value.type === "scatter"
    ? (props.visibleData ?? props.data).series.slice(1)
    : (props.visibleData ?? props.data).series
  ).filter((entry) => {
    const secondary =
      !!entry.id &&
      chart.value.format?.series?.some(
        (format) => format.id === entry.id && format.axis === "secondary",
      );
    return kind.value === "secondaryValueAxis" ? secondary : !secondary;
  }),
);
const linkedToSource = computed(
  () =>
    !percentageAxis.value &&
    (valueAxis.value.linkedToSource ?? valueAxis.value.numberFormat === undefined),
);
const sourceNumberFormat = computed(() => {
  const first = sourceSeries.value[0]?.numberFormat;
  return first &&
    sourceSeries.value.every(
      (entry) => JSON.stringify(entry.numberFormat) === JSON.stringify(first),
    )
    ? first
    : undefined;
});
const numberFormat = computed<CellNumberFormat | undefined>(() =>
  percentageAxis.value
    ? ((valueAxis.value.linkedToSource !== true ? valueAxis.value.numberFormat : undefined) ?? {
        kind: "percent",
        fractionDigits: 0,
      })
    : linkedToSource.value
      ? sourceNumberFormat.value
      : valueAxis.value.numberFormat,
);
const numberCategory = computed(() =>
  percentageAxis.value &&
  numberFormat.value?.kind === "custom" &&
  numberFormat.value.code === "General"
    ? "general"
    : (numberFormat.value?.kind ?? "general"),
);
const numberCode = computed(() =>
  numberFormat.value && "code" in numberFormat.value ? numberFormat.value.code : "",
);
const decimals = computed(() =>
  numberFormat.value && "fractionDigits" in numberFormat.value
    ? (numberFormat.value.fractionDigits ?? 2)
    : 2,
);
function committedValue(field: string): string | number | undefined {
  if (numericFields.includes(field as ChartFormatNumericField))
    return numericValue(field as ChartFormatNumericField);
  if (field === "title") return chart.value.title;
  if (field === "axisTitle") return axis.value.title;
  if (field === "formatCode") return numberCode.value;
  if (field === "decimals") return decimals.value;
  return undefined;
}
function resetDrafts(): void {
  for (const field of draftFields) drafts[field] = createChartFormatDraft(committedValue(field));
  draftHandlers.clear();
  for (const field of sharedNumericFields) {
    sharedNumericControl(field)?.cancel();
    delete sharedNumericDrafts[field];
    delete sharedNumericResetErrors[field];
    delete sharedNumericResets[field];
  }
  acceptedCategoryDecimals.value = undefined;
  pendingResetField = undefined;
  fieldError.value = undefined;
}
watch(() => `${props.drawing.id}/${targetKey.value}`, resetDrafts, { immediate: true });
watch(
  () => [chart.value, props.data] as const,
  () => {
    for (const field of sharedNumericFields) delete sharedNumericResets[field];
    acceptedCategoryDecimals.value = undefined;
    for (const field of draftFields) syncChartFormatDraft(drafts[field]!, committedValue(field));
  },
  { deep: true },
);
watch(
  available,
  (value) => {
    if (!value) emit("update:target", { kind: "chart" });
  },
  { immediate: true },
);
function edit(field: string, value: string | number): void {
  pendingResetField = undefined;
  const draft = drafts[field]!;
  if (!draft.dirty || draftHandlers.get(field) !== props.apply)
    draftHandlers.set(field, activeHandler ?? props.apply);
  editChartFormatDraft(draft, String(value));
  fieldError.value = undefined;
}
function startComposition(field: string): void {
  if (!drafts[field]!.dirty) draftHandlers.set(field, props.apply);
  drafts[field]!.composing = true;
}
function endComposition(field: string, _value: string, context: { e: CompositionEvent }): void {
  const input = context.e.target;
  if (input instanceof HTMLInputElement) edit(field, input.value);
  drafts[field]!.composing = false;
  delete drafts[field]!.error;
}
function composing(): boolean {
  const styledField = sharedNumericFields.find((field) => sharedNumericDrafts[field]?.composing);
  const field = styledField ?? Object.keys(drafts).find((key) => drafts[key]!.composing);
  if (!field) return false;
  if (styledField) fieldError.value = "composition";
  else drafts[field]!.error = "composition";
  root.value
    ?.querySelector<HTMLInputElement>(`[data-chart-format-field="${field}"] input`)
    ?.focus();
  return true;
}
defineExpose({
  canChangeTarget: () => live && !composing(),
  getHistoryElement: () => (live ? root.value : undefined),
});
function submit(intent: ChartFormatIntent, handler = activeHandler ?? props.apply): boolean {
  if (!live || handler !== props.apply) {
    fieldError.value = "rejected";
    return false;
  }
  if (props.disabled || !available.value || composing()) return false;
  let accepted = false;
  try {
    accepted = handler(intent);
  } catch {
    /* Keep draft and report failure. */
  }
  fieldError.value = accepted ? undefined : "rejected";
  return accepted;
}
function targetLabel(target: ChartFormatTarget): string {
  if (target.kind !== "series") return t(chartFormatTargetLabelKeys[target.kind]);
  return t("chart.formatSeriesName", {
    name:
      getChartFormatSeries(chart.value, props.data).find((entry) =>
        target.rangeBand
          ? entry.rangeBand?.seriesBy === target.rangeBand.seriesBy &&
            entry.rangeBand.index === target.rangeBand.index
          : entry.id === target.seriesId,
      )?.name ?? target.seriesId,
  });
}
const targetOptions = computed(() =>
  targets.value.map((target) => ({
    value: chartFormatTargetKey(target),
    label: targetLabel(target),
  })),
);
function changeTarget(value: unknown): void {
  if (composing()) return;
  const target = targets.value.find((entry) => chartFormatTargetKey(entry) === value);
  if (target) emit("update:target", target);
}
function axisIntent(
  next: ChartCategoryAxisFormat | ChartValueAxisFormat,
): ChartFormatIntent | undefined {
  if (kind.value === "categoryAxis")
    return { kind: "categoryAxis", format: compactChartAxis(next) };
  if (kind.value === "valueAxis" || kind.value === "secondaryValueAxis")
    return { kind: kind.value, format: compactChartAxis(next) };
  return undefined;
}
function textIntent(next: ChartTextFormat | undefined): ChartFormatIntent | undefined {
  if (kind.value === "title") return { kind: "title", format: next };
  if (isAxis.value) {
    const nextAxis = { ...axis.value };
    if (next) nextAxis.text = next;
    else delete nextAxis.text;
    return axisIntent(nextAxis);
  }
  return undefined;
}
function numericIntent(
  field: ChartFormatNumericField | "decimals",
  value: number | undefined,
): ChartFormatIntent | undefined {
  switch (field) {
    case "decimals": {
      const format = numberFormat.value;
      return value !== undefined &&
        format &&
        (format.kind === "number" ||
          format.kind === "percent" ||
          format.kind === "currency" ||
          format.kind === "accounting" ||
          format.kind === "scientific")
        ? numberIntent({ ...format, fractionDigits: value })
        : undefined;
    }
    case "fontSize":
      return textIntent(setChartFormatField(textFormat.value, "fontSize", value));
    case "min":
    case "max":
    case "majorUnit":
    case "minorUnit":
      if (isValueAxis.value)
        return axisIntent(setChartFormatField(valueAxis.value, field, value) ?? {});
      return undefined;
    case "labelAngle":
      return kind.value === "categoryAxis"
        ? { kind: "categoryAxis", format: setChartFormatField(categoryAxis.value, field, value) }
        : undefined;
    case "gapWidth":
    case "overlap":
      return (kind.value === "chart" || kind.value === "series") && capabilities.value.bar
        ? { kind: "chart", format: setChartFormatField(barFormat.value, field, value) }
        : undefined;
    case "strokeWidth":
      if (props.target.kind === "series" && capabilities.value.seriesStroke)
        return {
          kind: "series",
          seriesId: props.target.seriesId,
          format: setChartFormatField(series.value, "strokeWidth", value),
        };
      if (kind.value === "plot")
        return {
          kind: "plot",
          format: setChartFormatField(chart.value.format?.plot ?? {}, "strokeWidth", value),
        };
      if (isAxis.value) {
        const nextAxis = { ...axis.value };
        const line = setChartFormatField(lineFormat.value, "strokeWidth", value);
        if (line) nextAxis.line = line;
        else delete nextAxis.line;
        return axisIntent(nextAxis);
      }
      return undefined;
  }
}
function resetNumber(field: ChartFormatNumericField): void {
  if (props.disabled || composing()) return;
  pendingResetField = undefined;
  const control = sharedNumericControl(field);
  if (!control) return;
  if (numericValue(field) === undefined) {
    control.cancel();
    delete sharedNumericResetErrors[field];
    fieldError.value = undefined;
    return;
  }
  const intent = numericIntent(field, undefined);
  if (intent && submit(intent)) {
    control.cancel();
    sharedNumericResets[field] = ownerKey.value;
  } else {
    // Reset is a distinct action. A rejection must not edit, rebind, or lose
    // the NumericField's existing draft (including a stale handler lease).
    sharedNumericResetErrors[field] = t("chart.formatApplyFailed");
  }
}
function setText<K extends keyof ChartTextFormat>(
  field: K,
  value: ChartTextFormat[K] | undefined,
): void {
  const intent = textIntent(setChartFormatField(textFormat.value, field, value));
  if (intent) submit(intent);
}
function setLineColor(value: string | null): void {
  if (kind.value === "plot") {
    submit({
      kind: "plot",
      format: setChartFormatField(chart.value.format?.plot ?? {}, "stroke", value ?? undefined),
    });
  } else if (isAxis.value) {
    const nextAxis = { ...axis.value },
      line = setChartFormatField(lineFormat.value, "stroke", value ?? undefined);
    if (line) nextAxis.line = line;
    else delete nextAxis.line;
    const intent = axisIntent(nextAxis);
    if (intent) submit(intent);
  }
}
function setFill(value: string | null): void {
  if (kind.value === "plot")
    submit({
      kind: "plot",
      format: setChartFormatField(chart.value.format?.plot ?? {}, "fill", value ?? undefined),
    });
}
function setAxisBoolean(
  field: "show" | "reverse" | "titleVisible" | "majorGridlines" | "minorGridlines",
  value: unknown,
): void {
  if ((field === "majorGridlines" || field === "minorGridlines") && !isValueAxis.value) return;
  const format = { ...axis.value, [field]: !!value };
  if (field === "titleVisible" && value && !format.title?.trim())
    format.title = t("chart.axisTitlePlaceholder");
  const intent = axisIntent(format);
  if (intent) submit(intent);
}
function commitText(
  field: "title" | "axisTitle" | "formatCode",
  _value?: unknown,
  context?: { e: KeyboardEvent | FocusEvent },
): boolean {
  const draft = drafts[field]!;
  if (context?.e instanceof FocusEvent && pendingResetField === "element") return true;
  if (
    props.disabled ||
    draft.composing ||
    (context?.e instanceof KeyboardEvent && context.e.isComposing)
  ) {
    draft.error = "composition";
    return false;
  }
  if (!draft.dirty) return true;
  let intent: ChartFormatIntent | undefined;
  if (field === "title" && kind.value === "title")
    intent = { kind: "elements", patch: { title: draft.text } };
  if (field === "axisTitle" && isAxis.value)
    intent = axisIntent({
      ...setChartFormatField(axis.value, "title", draft.text || undefined),
      titleVisible: !!draft.text.trim(),
    });
  if (field === "formatCode" && isValueAxis.value) {
    if (!validateCellNumberFormatCode(draft.text)) {
      draft.error = "format";
      return false;
    }
    const category = numberCategory.value;
    if (
      category === "custom" ||
      category === "date" ||
      category === "time" ||
      category === "fraction" ||
      category === "special"
    )
      intent = numberIntent({ kind: category, code: draft.text, locale: locale.value });
  }
  if (!intent || !submit(intent, draftHandlers.get(field) ?? props.apply)) {
    draft.error = "rejected";
    return false;
  }
  draft.dirty = false;
  delete draft.error;
  draftHandlers.delete(field);
  return true;
}
function pointerDown(event: PointerEvent): void {
  pendingResetField =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-chart-format-reset]")?.dataset.chartFormatReset
      : undefined;
  titleLayoutInteraction =
    event.target instanceof Element && !!event.target.closest("[data-chart-format-title-position]");
}
function blurTitle(value: unknown, context: { e: FocusEvent }): void {
  const target = context.e.relatedTarget;
  if (
    pendingResetField === "element" ||
    titleLayoutInteraction ||
    (target instanceof Element && target.closest("[data-chart-format-title-position]"))
  )
    return;
  commitText("title", value, context);
}
function setTitlePosition(value: unknown): void {
  if (
    kind.value !== "title" ||
    (value !== "none" && value !== "above" && value !== "overlay") ||
    composing()
  )
    return;
  const patch: ChartElementPatch = { elements: { titlePosition: value } };
  // A pending complete title is applied with its layout change as one edit.
  const draft = drafts.title!;
  const accepted = submit(
    { kind: "elements", patch: { ...patch, ...(draft.dirty ? { title: draft.text } : {}) } },
    draft.dirty ? (draftHandlers.get("title") ?? props.apply) : props.apply,
  );
  if (accepted) {
    draft.dirty = false;
    delete draft.error;
    draftHandlers.delete("title");
  }
  titleLayoutInteraction = false;
}
function setSeries<K extends keyof Omit<ChartSeriesFormat, "id">>(
  field: K,
  value: Omit<ChartSeriesFormat, "id">[K] | undefined,
): void {
  if (props.target.kind !== "series") return;
  submit({
    kind: "series",
    seriesId: props.target.seriesId,
    format: setChartFormatField(series.value, field, value),
  });
}
function numberIntent(format: CellNumberFormat | undefined): ChartFormatIntent | undefined {
  if (!isValueAxis.value) return undefined;
  const next = { ...valueAxis.value };
  if (format) {
    next.numberFormat = format;
    next.linkedToSource = false;
  } else if (percentageAxis.value) {
    next.numberFormat = { kind: "custom", code: "General" };
    next.linkedToSource = false;
  } else {
    delete next.numberFormat;
    delete next.linkedToSource;
  }
  return axisIntent(next);
}
function applyNumberFormat(format: CellNumberFormat | undefined): boolean {
  const intent = numberIntent(format);
  return !!intent && submit(intent);
}
function toggleSourceLink(value: unknown): void {
  if (percentageAxis.value) return;
  const intent = axisIntent({ ...valueAxis.value, linkedToSource: !!value });
  if (intent) submit(intent);
}
type NumberCategory = CellNumberFormat["kind"] | "general";
const categoryKeys: Record<NumberCategory, MessageKey> = {
  general: "cellFormat.general",
  number: "cellFormat.numeric",
  currency: "cellFormat.currency",
  accounting: "cellFormat.accounting",
  date: "cellFormat.date",
  time: "cellFormat.time",
  percent: "cellFormat.percent",
  fraction: "cellFormat.fraction",
  scientific: "cellFormat.scientific",
  text: "cellFormat.text",
  special: "cellFormat.special",
  custom: "cellFormat.custom",
};
const numberCategoryOptions = computed(() =>
  Object.entries(categoryKeys).map(([value, key]) => ({ value, label: t(key) })),
);
function selectNumberCategory(value: unknown): void {
  if (typeof value !== "string" || !Object.hasOwn(categoryKeys, value)) return;
  const category = value as NumberCategory;
  const defaults: Record<NumberCategory, CellNumberFormat | undefined> = {
    general: undefined,
    number: { kind: "number", fractionDigits: 2 },
    percent: { kind: "percent", fractionDigits: 2 },
    scientific: { kind: "scientific", fractionDigits: 2 },
    currency: {
      kind: "currency",
      currency: locale.value === "zh-CN" ? "CNY" : "USD",
      fractionDigits: 2,
    },
    accounting: {
      kind: "accounting",
      currency: locale.value === "zh-CN" ? "CNY" : "USD",
      fractionDigits: 2,
    },
    date: { kind: "date", code: "yyyy-mm-dd" },
    time: { kind: "time", code: "hh:mm:ss" },
    fraction: { kind: "fraction", code: "# ?/?" },
    text: { kind: "text" },
    special: { kind: "special", code: "00000" },
    custom: { kind: "custom", code: "0.00" },
  };
  const next = defaults[category];
  if (!applyNumberFormat(next)) return;
  // An accepted category replaces both number-format editors, even before the
  // next owner snapshot arrives. Unrelated axis drafts remain untouched.
  acceptedCategoryDecimals.value = {
    owner: ownerKey.value,
    value: next && "fractionDigits" in next ? (next.fractionDigits ?? 2) : 2,
  };
  decimalsControl.value?.cancel();
  delete sharedNumericDrafts.decimals;
  delete sharedNumericResetErrors.decimals;
  drafts.formatCode = createChartFormatDraft(next && "code" in next ? next.code : "");
  draftHandlers.delete("formatCode");
}
const showDecimals = computed(() =>
  ["number", "percent", "currency", "accounting", "scientific"].includes(numberCategory.value),
);
const showCurrency = computed(
  () => numberCategory.value === "currency" || numberCategory.value === "accounting",
);
const showCode = computed(() =>
  ["date", "time", "fraction", "special", "custom"].includes(numberCategory.value),
);
const showNegative = computed(
  () => numberCategory.value === "number" || numberCategory.value === "currency",
);
function setGrouping(value: unknown): void {
  const format = numberFormat.value;
  if (format?.kind === "number") applyNumberFormat({ ...format, useGrouping: !!value });
}
function setCurrency(value: unknown): void {
  const format = numberFormat.value;
  if (typeof value === "string" && (format?.kind === "currency" || format?.kind === "accounting")) {
    const next = { ...format, currency: value };
    delete next.currencySymbol;
    applyNumberFormat(next);
  }
}
function setNegative(value: string): void {
  if (!["minus", "red", "parentheses", "red-parentheses"].includes(value)) return;
  const format = numberFormat.value;
  if (format?.kind === "number" || format?.kind === "currency")
    applyNumberFormat({ ...format, negativeStyle: value as CellNumberFormatNegativeStyle });
}
const negativeOptions = computed(() =>
  (["minus", "red", "parentheses", "red-parentheses"] as const).map((value) => {
    const format = numberFormat.value;
    const presentation = formatCellNumberValue(
      -1234.56,
      format?.kind === "number" || format?.kind === "currency"
        ? { ...format, negativeStyle: value }
        : undefined,
      { locale: locale.value },
    );
    return { value, label: presentation.text, color: presentation.color };
  }),
);
const currencyOptions = computed(() =>
  [
    ...new Set([
      "CNY",
      "USD",
      "EUR",
      "GBP",
      "JPY",
      ...(showCurrency.value && numberFormat.value && "currency" in numberFormat.value
        ? [numberFormat.value.currency]
        : []),
    ]),
  ].map((value) => ({ value, label: value || t("cellFormat.noCurrency") })),
);
const numberPreview = computed(() => {
  const sample = percentageAxis.value
    ? 0.375
    : (sourceSeries.value
        .flatMap((entry) => entry.values)
        .find((value): value is number => value !== null) ?? 1234.56);
  try {
    return formatCellNumberValue(sample, numberFormat.value, { locale: locale.value });
  } catch {
    return { text: "####" };
  }
});
const { fontOptions } = useFontCatalog(() =>
  textFormat.value.fontFamily ? [textFormat.value.fontFamily] : [],
);
const fontFamilyOptions = computed(() => [
  { value: "", label: t("chart.formatDefault") },
  ...fontOptions.value,
]);
const titlePositionOptions = computed(() => [
  { value: "none", label: t("chart.elementNone") },
  { value: "above", label: t("chart.titleAbove") },
  { value: "overlay", label: t("chart.titleOverlay") },
]);
function setLegendPosition(value: unknown): void {
  if (kind.value !== "legend") return;
  if (
    value === "right" ||
    value === "top" ||
    value === "left" ||
    value === "bottom" ||
    value === "topRight"
  ) {
    submit({ kind: "elements", patch: { elements: { legendPosition: value } } });
  }
}
function setLegendNonOverlapping(value: unknown): void {
  if (kind.value === "legend" && typeof value === "boolean")
    submit({ kind: "elements", patch: { elements: { legendOverlay: !value } } });
}
const seriesAxisOptions = computed(() => [
  { value: "primary", label: t("chart.formatPrimaryAxis") },
  { value: "secondary", label: t("chart.formatSecondaryAxis") },
]);
const errorKeys: Record<ChartFormatDraftError, MessageKey> = {
  number: "chart.formatInvalidNumber",
  bounds: "chart.formatInvalidBounds",
  format: "chart.formatInvalidFormat",
  rejected: "chart.formatApplyFailed",
  composition: "chart.formatFinishComposition",
};
const localError = computed(
  () => Object.values(drafts).find((draft) => draft.error)?.error ?? fieldError.value,
);
const errorMessage = computed(
  () =>
    props.error ||
    (localError.value
      ? t(errorKeys[localError.value])
      : minorGridlinesState.value.invalid
        ? t("chart.formatInvalidBounds")
        : undefined),
);
function resetElement(): void {
  if (kind.value === "legend") {
    if (submit({ kind: "legend", reset: true })) resetDrafts();
  } else if (kind.value === "chart") {
    if (submit({ kind: "chart", format: undefined })) resetDrafts();
  } else if (props.target.kind === "series") {
    if (submit({ kind: "series", seriesId: props.target.seriesId, format: undefined }))
      resetDrafts();
  } else if (
    kind.value === "title" ||
    kind.value === "plot" ||
    kind.value === "categoryAxis" ||
    kind.value === "valueAxis" ||
    kind.value === "secondaryValueAxis"
  ) {
    if (submit({ kind: kind.value, format: undefined })) resetDrafts();
  }
}
function escapeDraft(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.isComposing) return;
  const field =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-chart-format-field]")?.dataset.chartFormatField
      : undefined;
  if (!field || !drafts[field]?.dirty) return;
  event.preventDefault();
  event.stopPropagation();
  drafts[field] = createChartFormatDraft(committedValue(field));
  draftHandlers.delete(field);
}
</script>

<template>
  <aside
    ref="root"
    class="chart-format-pane"
    data-chart-format-pane
    :style="{ '--chart-format-label-width': locale === 'zh-CN' ? '84px' : '120px' }"
    :aria-label="t('chart.formatPane')"
    @keydown.capture="escapeDraft"
    @pointerdown.capture="pointerDown"
  >
    <header class="chart-format-pane__header">
      <ChartNoAxesColumn :size="18" aria-hidden="true" />
      <div class="chart-format-pane__heading">
        <strong>{{ t("chart.formatPane") }}</strong
        ><span :title="drawing.name">{{ drawing.name }}</span>
      </div>
      <TButton
        size="small"
        shape="square"
        variant="text"
        :aria-label="t('chart.formatClose')"
        @click="emit('close')"
        ><X :size="16" aria-hidden="true"
      /></TButton>
    </header>
    <div class="chart-format-pane__selector">
      <label :for="`${paneId}-element`">{{ t("chart.formatElement") }}</label>
      <TSelect
        :popup-props="popupProps"
        :id="`${paneId}-element`"
        :value="available ? targetKey : 'chart'"
        :options="targetOptions"
        size="small"
        :aria-label="t('chart.formatElement')"
        :onChange="captureAction(changeTarget)"
      />
    </div>
    <p v-if="errorMessage" class="chart-format-pane__error" role="alert">{{ errorMessage }}</p>
    <div class="chart-format-pane__body">
      <template v-if="kind === 'chart'">
        <p class="chart-format-pane__hint">{{ t("chart.formatSelectHint") }}</p>
        <p v-if="!capabilities.hasData" class="chart-format-pane__hint">
          {{ t("chart.formatNoData") }}
        </p>
      </template>
      <p
        v-if="!capabilities.series && capabilities.hasData && (kind === 'chart' || isAxis)"
        class="chart-format-pane__hint"
      >
        {{ t("chart.formatSeriesUnavailable") }}
      </p>

      <FormatSection v-if="kind === 'legend'" :title="t('chart.legend')" initially-open>
        <span>{{ t("chart.legendPosition") }}</span>
        <TRadioGroup
          :model-value="elementSettings.legendPosition"
          :disabled="disabled"
          :aria-label="t('chart.legendPosition')"
          role="radiogroup"
          class="chart-format-pane__legend-positions"
          :onChange="captureAction(setLegendPosition)"
        >
          <TRadio data-format-pane-history-control="discrete" value="top">{{
            t("chart.positionTop")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="bottom">{{
            t("chart.positionBottom")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="left">{{
            t("chart.positionLeft")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="right">{{
            t("chart.positionRight")
          }}</TRadio>
          <TRadio data-format-pane-history-control="discrete" value="topRight">{{
            t("chart.positionTopRight")
          }}</TRadio>
        </TRadioGroup>
        <TCheckbox
          data-format-pane-history-control="discrete"
          :checked="!elementSettings.legendOverlay"
          :disabled="disabled"
          :onChange="captureAction(setLegendNonOverlapping)"
        >
          {{ t("chart.legendNonOverlapping") }}
        </TCheckbox>
      </FormatSection>
      <FormatSection v-if="kind === 'title'" :title="t('chart.title')" initially-open>
        <div class="chart-format-pane__field" data-chart-format-field="title">
          <label :for="`${paneId}-title`">{{ t("chart.titleText") }}</label>
          <TInput
            :id="`${paneId}-title`"
            :value="drafts.title!.text"
            size="small"
            :maxlength="1000"
            :disabled="disabled"
            :aria-label="t('chart.titleText')"
            :status="drafts.title!.error ? 'error' : undefined"
            :onChange="editAction('title')"
            :onCompositionstart="compositionStartAction('title')"
            :onCompositionend="compositionEndAction('title')"
            :onEnter="textAction('title')"
            :onBlur="captureAction(blurTitle)"
          />
        </div>
        <div class="chart-format-pane__field" data-chart-format-title-position>
          <span>{{ t("chart.titlePosition") }}</span
          ><TSelect
            :popup-props="popupProps"
            :value="chart.elements?.titlePosition ?? 'above'"
            :options="titlePositionOptions"
            size="small"
            :disabled="disabled"
            :aria-label="t('chart.titlePosition')"
            :onChange="captureAction(setTitlePosition)"
          />
        </div>
      </FormatSection>

      <FormatSection v-if="isAxis" :title="t('chart.formatAxisOptions')" initially-open>
        <TCheckbox
          data-format-pane-history-control="discrete"
          :checked="axis.show ?? true"
          :disabled="disabled"
          :onChange="captureAction((value: unknown) => setAxisBoolean('show', value))"
          >{{ t("chart.formatShowAxis") }}</TCheckbox
        >
        <TCheckbox
          data-format-pane-history-control="discrete"
          :checked="axis.reverse ?? false"
          :disabled="disabled"
          :onChange="captureAction((value: unknown) => setAxisBoolean('reverse', value))"
          >{{ t("chart.formatReverse") }}</TCheckbox
        >
        <TCheckbox
          data-format-pane-history-control="discrete"
          :checked="axis.titleVisible ?? !!axis.title"
          :disabled="disabled"
          data-chart-format-field="titleVisible"
          :onChange="captureAction((value: unknown) => setAxisBoolean('titleVisible', value))"
          >{{ t("chart.formatShowAxisTitle") }}</TCheckbox
        >
        <template v-if="isValueAxis">
          <TCheckbox
            data-format-pane-history-control="discrete"
            :checked="valueAxis.majorGridlines ?? true"
            :disabled="disabled"
            data-chart-format-field="majorGridlines"
            :onChange="captureAction((value: unknown) => setAxisBoolean('majorGridlines', value))"
            >{{ t("chart.formatMajorGridlines") }}</TCheckbox
          >
          <TCheckbox
            data-format-pane-history-control="discrete"
            :checked="minorGridlinesState.checked"
            :indeterminate="minorGridlinesState.invalid"
            :disabled="disabled || minorGridlinesState.invalid"
            data-chart-format-field="minorGridlines"
            :onChange="captureAction((value: unknown) => setAxisBoolean('minorGridlines', value))"
            >{{ t("chart.formatMinorGridlines") }}</TCheckbox
          >
        </template>
        <div class="chart-format-pane__field" data-chart-format-field="axisTitle">
          <label :for="`${paneId}-axis-title`">{{ t("chart.formatAxisTitle") }}</label
          ><TInput
            :id="`${paneId}-axis-title`"
            :value="drafts.axisTitle!.text"
            size="small"
            :maxlength="1000"
            :disabled="disabled"
            :aria-label="t('chart.formatAxisTitle')"
            :status="drafts.axisTitle!.error ? 'error' : undefined"
            :onChange="editAction('axisTitle')"
            :onCompositionstart="compositionStartAction('axisTitle')"
            :onCompositionend="compositionEndAction('axisTitle')"
            :onEnter="textAction('axisTitle')"
            :onBlur="textAction('axisTitle')"
          />
        </div>
        <div
          v-if="kind === 'categoryAxis'"
          class="chart-format-pane__field"
          data-chart-format-field="labelAngle"
        >
          <label :for="`${paneId}-angle`">{{ t("chart.formatLabelAngle") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="labelAngleControl"
              :id="`${paneId}-angle`"
              :owner-key="`${ownerKey}/labelAngle`"
              :value="labelAngleNumericValue"
              :spec="labelAngleSpec"
              :label="t('chart.formatLabelAngle')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.labelAngle"
              :focus-boundary="() => sharedNumericFocusBoundary('labelAngle')"
              :on-commit="labelAngleCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('labelAngle', $event)"
              @cancel="delete sharedNumericResetErrors.labelAngle"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (labelAngleNumericValue.kind === 'auto' && !sharedNumericDrafts.labelAngle?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="labelAngle"
              :onClick="captureAction(() => resetNumber('labelAngle'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
      </FormatSection>

      <FormatSection v-if="isValueAxis" :title="t('chart.formatBounds')" initially-open>
        <p v-if="percentageAxis" class="chart-format-pane__hint">
          {{ t("chart.formatPercentAxisHint") }}
        </p>
        <div class="chart-format-pane__field" data-chart-format-field="min">
          <label :for="`${paneId}-min`">{{ t("chart.formatMinimum") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="minControl"
              :id="`${paneId}-min`"
              :owner-key="`${ownerKey}/min`"
              :value="minNumericValue"
              :spec="axisBoundSpec"
              :label="t('chart.formatMinimum')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.min"
              :focus-boundary="() => sharedNumericFocusBoundary('min')"
              :on-commit="minCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('min', $event)"
              @cancel="delete sharedNumericResetErrors.min"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled || (minNumericValue.kind === 'auto' && !sharedNumericDrafts.min?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="min"
              :onClick="captureAction(() => resetNumber('min'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="max">
          <label :for="`${paneId}-max`">{{ t("chart.formatMaximum") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="maxControl"
              :id="`${paneId}-max`"
              :owner-key="`${ownerKey}/max`"
              :value="maxNumericValue"
              :spec="axisBoundSpec"
              :label="t('chart.formatMaximum')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.max"
              :focus-boundary="() => sharedNumericFocusBoundary('max')"
              :on-commit="maxCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('max', $event)"
              @cancel="delete sharedNumericResetErrors.max"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled || (maxNumericValue.kind === 'auto' && !sharedNumericDrafts.max?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="max"
              :onClick="captureAction(() => resetNumber('max'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="majorUnit">
          <label :for="`${paneId}-major`">{{ t("chart.formatMajorUnit") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="majorUnitControl"
              :id="`${paneId}-major`"
              :owner-key="`${ownerKey}/majorUnit`"
              :value="majorUnitNumericValue"
              :spec="axisUnitSpec"
              :label="t('chart.formatMajorUnit')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatAxisPositiveUnit')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.majorUnit"
              :focus-boundary="() => sharedNumericFocusBoundary('majorUnit')"
              :on-commit="majorUnitCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('majorUnit', $event)"
              @cancel="delete sharedNumericResetErrors.majorUnit"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (majorUnitNumericValue.kind === 'auto' && !sharedNumericDrafts.majorUnit?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="majorUnit"
              :onClick="captureAction(() => resetNumber('majorUnit'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="minorUnit">
          <label :for="`${paneId}-minor`">{{ t("chart.formatMinorUnit") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="minorUnitControl"
              :id="`${paneId}-minor`"
              :owner-key="`${ownerKey}/minorUnit`"
              :value="minorUnitNumericValue"
              :spec="axisUnitSpec"
              :label="t('chart.formatMinorUnit')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatAxisPositiveUnit')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.minorUnit"
              :focus-boundary="() => sharedNumericFocusBoundary('minorUnit')"
              :on-commit="minorUnitCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('minorUnit', $event)"
              @cancel="delete sharedNumericResetErrors.minorUnit"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (minorUnitNumericValue.kind === 'auto' && !sharedNumericDrafts.minorUnit?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="minorUnit"
              :onClick="captureAction(() => resetNumber('minorUnit'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
      </FormatSection>

      <FormatSection
        v-if="kind === 'title' || isAxis"
        :title="t('chart.formatText')"
        initially-open
      >
        <div class="chart-format-pane__field">
          <span>{{ t("format.fontFamily") }}</span
          ><FontFormatField
            :model-value="textFormat.fontFamily ?? ''"
            :options="fontFamilyOptions"
            :label="t('format.fontFamily')"
            :search-label="t('format.searchFonts')"
            :empty-label="t('format.noMatchingFonts')"
            :disabled="disabled"
            :popup-attach="() => root!"
            :onChange="
              captureAction(
                (value: unknown) =>
                  typeof value === 'string' && setText('fontFamily', value || undefined),
              )
            "
            ><template #searchAction="{ close }"><FontSettingsAction @open="close" /></template
          ></FontFormatField>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="fontSize">
          <label :for="`${paneId}-font-size`">{{ t("chart.formatFontSize") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="fontSizeControl"
              :id="`${paneId}-font-size`"
              :owner-key="`${ownerKey}/fontSize`"
              :value="fontSizeNumericValue"
              :spec="fontSizeSpec"
              :label="t('chart.formatFontSize')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.fontSize"
              :focus-boundary="() => sharedNumericFocusBoundary('fontSize')"
              :on-commit="fontSizeCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('fontSize', $event)"
              @cancel="delete sharedNumericResetErrors.fontSize"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (fontSizeNumericValue.kind === 'auto' && !sharedNumericDrafts.fontSize?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="fontSize"
              :onClick="captureAction(() => resetNumber('fontSize'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <div class="chart-format-pane__field">
          <span>{{ t("format.textColor") }}</span
          ><ColorPaletteSelect
            panel-class="chart-format-options-popup"
            :model-value="textFormat.color"
            :label="t('format.textColor')"
            :default-label="t('chart.formatDefault')"
            :disabled="disabled"
            show-value
            :onSelect="
              captureAction((value: string | null) => setText('color', value ?? undefined))
            "
          />
        </div>
        <div class="chart-format-pane__checks">
          <TCheckbox
            data-format-pane-history-control="discrete"
            :checked="textFormat.bold ?? (kind === 'title' && chart.type !== 'wordCloud')"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setText('bold', !!value))"
            >{{ t("format.bold") }}</TCheckbox
          ><TCheckbox
            data-format-pane-history-control="discrete"
            :checked="textFormat.italic ?? false"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setText('italic', !!value))"
            >{{ t("format.italic") }}</TCheckbox
          >
        </div>
        <p class="chart-format-pane__hint">{{ t("chart.formatFontHint") }}</p>
      </FormatSection>

      <FormatSection
        v-if="kind === 'plot' || isAxis"
        :title="t('chart.formatAppearance')"
        initially-open
      >
        <div v-if="kind === 'plot'" class="chart-format-pane__field">
          <span>{{ t("chart.formatFill") }}</span>
          <div class="chart-format-pane__paint">
            <ColorPaletteSelect
              panel-class="chart-format-options-popup"
              :model-value="chart.format?.plot?.fill"
              :transparent-label="t('chart.formatNoFill')"
              :label="t('chart.formatFill')"
              :disabled="disabled"
              :default-label="t('chart.formatDefault')"
              show-value
              :onSelect="captureAction(setFill)"
            /><TButton
              variant="text"
              size="small"
              :disabled="disabled"
              data-format-pane-history-control="command"
              :onClick="captureAction(() => setFill('transparent'))"
              >{{ t("chart.formatNoFill") }}</TButton
            >
          </div>
        </div>
        <div class="chart-format-pane__field">
          <span>{{ t("chart.formatLine") }}</span>
          <div class="chart-format-pane__paint">
            <ColorPaletteSelect
              panel-class="chart-format-options-popup"
              :model-value="lineFormat.stroke"
              :transparent-label="t('chart.formatNoLine')"
              :label="t('chart.formatLine')"
              :disabled="disabled"
              :default-label="t('chart.formatDefault')"
              show-value
              :onSelect="captureAction(setLineColor)"
            /><TButton
              variant="text"
              size="small"
              :disabled="disabled"
              data-format-pane-history-control="command"
              :onClick="captureAction(() => setLineColor('transparent'))"
              >{{ t("chart.formatNoLine") }}</TButton
            >
          </div>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="strokeWidth">
          <label :for="`${paneId}-line-width`">{{ t("chart.formatLineWidth") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="strokeWidthControl"
              :id="`${paneId}-line-width`"
              :owner-key="`${ownerKey}/strokeWidth`"
              :value="strokeWidthNumericValue"
              :spec="strokeWidthSpec"
              :label="t('chart.formatLineWidth')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.strokeWidth"
              :focus-boundary="() => sharedNumericFocusBoundary('strokeWidth')"
              :on-commit="strokeWidthCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('strokeWidth', $event)"
              @cancel="delete sharedNumericResetErrors.strokeWidth"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (strokeWidthNumericValue.kind === 'auto' && !sharedNumericDrafts.strokeWidth?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="strokeWidth"
              :onClick="captureAction(() => resetNumber('strokeWidth'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
      </FormatSection>

      <FormatSection v-if="isValueAxis" :title="t('chart.formatNumber')" initially-open>
        <TCheckbox
          data-format-pane-history-control="discrete"
          v-if="!percentageAxis"
          :checked="linkedToSource"
          :disabled="disabled"
          :onChange="captureAction(toggleSourceLink)"
          >{{ t("chart.formatLinkedToSource") }}</TCheckbox
        >
        <p class="chart-format-pane__hint">
          {{ t(percentageAxis ? "chart.formatPercentAxisHint" : "chart.formatNumberSourceHint") }}
        </p>
        <div class="chart-format-pane__preview">
          <span>{{ t("cellFormat.preview") }}</span
          ><output :style="{ color: numberPreview.color }">{{ numberPreview.text }}</output>
        </div>
        <div class="chart-format-pane__field">
          <span>{{ t("cellFormat.category") }}</span
          ><TSelect
            :popup-props="popupProps"
            :value="numberCategory"
            :options="numberCategoryOptions"
            size="small"
            :disabled="disabled"
            :aria-label="t('cellFormat.category')"
            :onChange="captureAction(selectNumberCategory)"
          />
        </div>
        <div
          v-if="showDecimals"
          class="chart-format-pane__field"
          data-chart-format-field="decimals"
        >
          <label :for="`${paneId}-decimals`">{{ t("cellFormat.decimalPlaces") }}</label
          ><NumericField
            ref="decimalsControl"
            :id="`${paneId}-decimals`"
            :owner-key="`${ownerKey}/decimals`"
            :value="decimalsNumericValue"
            :spec="decimalsSpec"
            :label="t('cellFormat.decimalPlaces')"
            :auto-text="t('chart.formatAuto')"
            :disabled="disabled"
            :invalid-message="t('chart.formatInvalidNumber')"
            :rejected-message="t('chart.formatApplyFailed')"
            :stale-message="t('chart.formatApplyFailed')"
            :external-error="sharedNumericResetErrors.decimals"
            :focus-boundary="() => sharedNumericFocusBoundary('decimals')"
            :on-commit="decimalsCommit"
            presentation="inline-stepper"
            :show-unit="false"
            @draft-change="sharedNumericDraftChange('decimals', $event)"
            @cancel="delete sharedNumericResetErrors.decimals"
          />
        </div>
        <div v-if="showCurrency" class="chart-format-pane__field">
          <span>{{ t("cellFormat.currencyCode") }}</span
          ><TSelect
            :popup-props="popupProps"
            :value="numberFormat && 'currency' in numberFormat ? numberFormat.currency : ''"
            :options="currencyOptions"
            size="small"
            :disabled="disabled"
            :aria-label="t('cellFormat.currencyCode')"
            :onChange="captureAction(setCurrency)"
          />
        </div>
        <TCheckbox
          data-format-pane-history-control="discrete"
          v-if="numberCategory === 'number'"
          :checked="
            numberFormat && 'useGrouping' in numberFormat
              ? (numberFormat.useGrouping ?? true)
              : true
          "
          :disabled="disabled"
          :onChange="captureAction(setGrouping)"
          >{{ t("cellFormat.grouping") }}</TCheckbox
        >
        <fieldset
          v-if="showNegative"
          class="chart-format-pane__stack chart-format-pane__negative"
          :disabled="disabled"
        >
          <legend>{{ t("cellFormat.negativeNumbers") }}</legend>
          <OptionList
            :model-value="
              numberFormat && 'negativeStyle' in numberFormat
                ? (numberFormat.negativeStyle ?? 'minus')
                : 'minus'
            "
            :options="negativeOptions"
            :label="t('cellFormat.negativeNumbers')"
            :onSelect="captureAction(setNegative)"
          />
        </fieldset>
        <div
          v-if="showCode"
          class="chart-format-pane__field chart-format-pane__field--stack"
          data-chart-format-field="formatCode"
        >
          <label :for="`${paneId}-format-code`">{{ t("cellFormat.customCode") }}</label
          ><TInput
            :id="`${paneId}-format-code`"
            :value="drafts.formatCode!.text"
            size="small"
            :maxlength="255"
            :disabled="disabled"
            :aria-label="t('cellFormat.customCode')"
            :status="drafts.formatCode!.error ? 'error' : undefined"
            :onChange="editAction('formatCode')"
            :onCompositionstart="compositionStartAction('formatCode')"
            :onCompositionend="compositionEndAction('formatCode')"
            :onEnter="textAction('formatCode')"
            :onBlur="textAction('formatCode')"
          />
        </div>
      </FormatSection>

      <FormatSection
        v-if="kind === 'series'"
        :title="t('chart.formatSeriesOptions')"
        initially-open
      >
        <div v-if="capabilities.seriesAxis" class="chart-format-pane__field">
          <span>{{ t("chart.formatSeriesAxis") }}</span
          ><TSelect
            :popup-props="popupProps"
            :value="series.axis ?? 'primary'"
            :options="seriesAxisOptions"
            size="small"
            :disabled="disabled"
            :aria-label="t('chart.formatSeriesAxis')"
            :onChange="
              captureAction(
                (value: unknown) =>
                  (value === 'primary' || value === 'secondary') && setSeries('axis', value),
              )
            "
          />
        </div>
        <div class="chart-format-pane__field">
          <span>{{ t("chart.formatSeriesColor") }}</span
          ><ColorPaletteSelect
            panel-class="chart-format-options-popup"
            :model-value="series.color"
            :label="t('chart.formatSeriesColor')"
            :disabled="disabled"
            :default-label="t('chart.formatDefault')"
            show-value
            :onSelect="
              captureAction((value: string | null) => setSeries('color', value ?? undefined))
            "
          />
        </div>
        <div
          v-if="capabilities.seriesStroke"
          class="chart-format-pane__field"
          data-chart-format-field="strokeWidth"
        >
          <label :for="`${paneId}-series-width`">{{ t("chart.formatLineWidth") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="strokeWidthControl"
              :id="`${paneId}-series-width`"
              :owner-key="`${ownerKey}/strokeWidth`"
              :value="strokeWidthNumericValue"
              :spec="strokeWidthSpec"
              :label="t('chart.formatLineWidth')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.strokeWidth"
              :focus-boundary="() => sharedNumericFocusBoundary('strokeWidth')"
              :on-commit="strokeWidthCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('strokeWidth', $event)"
              @cancel="delete sharedNumericResetErrors.strokeWidth"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (strokeWidthNumericValue.kind === 'auto' && !sharedNumericDrafts.strokeWidth?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="strokeWidth"
              :onClick="captureAction(() => resetNumber('strokeWidth'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <TCheckbox
          data-format-pane-history-control="discrete"
          v-if="capabilities.seriesSmooth"
          :checked="series.smooth ?? false"
          :disabled="disabled"
          :onChange="captureAction((value: unknown) => setSeries('smooth', !!value))"
          >{{ t("chart.formatSmooth") }}</TCheckbox
        >
        <TCheckbox
          data-format-pane-history-control="discrete"
          v-if="capabilities.seriesMarkers"
          :checked="
            series.markers ??
            (chart.type === 'combo' ? false : (chart.presentation?.lineMarkers ?? true))
          "
          :disabled="disabled"
          :onChange="captureAction((value: unknown) => setSeries('markers', !!value))"
          >{{ t("chart.formatMarkers") }}</TCheckbox
        >
      </FormatSection>

      <FormatSection
        v-if="capabilities.bar && (kind === 'chart' || kind === 'series')"
        :title="t('chart.formatBarLayout')"
        initially-open
      >
        <p class="chart-format-pane__hint">{{ t("chart.formatBarGlobalHint") }}</p>
        <div class="chart-format-pane__field" data-chart-format-field="gapWidth">
          <label :for="`${paneId}-gap`">{{ t("chart.formatGapWidth") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="gapWidthControl"
              :id="`${paneId}-gap`"
              :owner-key="`${ownerKey}/gapWidth`"
              :value="gapWidthNumericValue"
              :spec="gapWidthSpec"
              :label="t('chart.formatGapWidth')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.gapWidth"
              :focus-boundary="() => sharedNumericFocusBoundary('gapWidth')"
              :on-commit="gapWidthCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('gapWidth', $event)"
              @cancel="delete sharedNumericResetErrors.gapWidth"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (gapWidthNumericValue.kind === 'auto' && !sharedNumericDrafts.gapWidth?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="gapWidth"
              :onClick="captureAction(() => resetNumber('gapWidth'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
        <div class="chart-format-pane__field" data-chart-format-field="overlap">
          <label :for="`${paneId}-overlap`">{{ t("chart.formatOverlap") }}</label>
          <div class="chart-format-pane__number">
            <NumericField
              ref="overlapControl"
              :id="`${paneId}-overlap`"
              :owner-key="`${ownerKey}/overlap`"
              :value="overlapNumericValue"
              :spec="overlapSpec"
              :label="t('chart.formatOverlap')"
              :auto-text="t('chart.formatAuto')"
              :disabled="disabled"
              :invalid-message="t('chart.formatInvalidNumber')"
              :rejected-message="t('chart.formatApplyFailed')"
              :stale-message="t('chart.formatApplyFailed')"
              :external-error="sharedNumericResetErrors.overlap"
              :focus-boundary="() => sharedNumericFocusBoundary('overlap')"
              :on-commit="overlapCommit"
              presentation="inline-stepper"
              :show-unit="false"
              @draft-change="sharedNumericDraftChange('overlap', $event)"
              @cancel="delete sharedNumericResetErrors.overlap"
            /><TButton
              variant="text"
              shape="square"
              size="small"
              :disabled="
                disabled ||
                (overlapNumericValue.kind === 'auto' && !sharedNumericDrafts.overlap?.dirty)
              "
              :aria-label="t('chart.formatReset')"
              data-chart-format-reset="overlap"
              :onClick="captureAction(() => resetNumber('overlap'))"
              ><RotateCcw :size="14" aria-hidden="true"
            /></TButton>
          </div>
        </div>
      </FormatSection>
      <div
        v-if="available && (kind !== 'chart' || capabilities.bar)"
        class="chart-format-pane__reset"
      >
        <TButton
          variant="text"
          size="small"
          :disabled="disabled"
          data-chart-format-reset="element"
          :onClick="captureAction(resetElement)"
          ><RotateCcw :size="14" aria-hidden="true" />{{ t("chart.formatResetAll") }}</TButton
        >
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.chart-format-pane {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: clamp(320px, 26vw, 380px);
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-left: 1px solid var(--sheetcraft-border-subtle);
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-primary);
  font-family: var(--sheetcraft-font-sans);
  font-size: 12px;
  line-height: 20px;
  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 8px;
  }
  &__heading {
    flex: 1;
    min-width: 0;
    display: grid;
    strong {
      font-size: 14px;
      line-height: 22px;
      font-weight: 600;
    }
    span {
      color: var(--sheetcraft-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__selector {
    display: grid;
    gap: 6px;
    padding: 0 12px 12px;
    border-bottom: 1px solid var(--sheetcraft-border-subtle);
    label {
      font-weight: 500;
    }
  }
  &__error {
    flex: none;
    margin: 0;
    padding: 8px 12px;
    color: var(--sheetcraft-status-error);
    font-size: 12px;
    line-height: 18px;
    overflow-wrap: anywhere;
  }
  &__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 12px 12px;
    overscroll-behavior: contain;
  }
  &__field {
    display: grid;
    grid-template-columns: var(--chart-format-label-width) minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    min-width: 0;
    > label,
    > span {
      min-height: 24px;
      display: flex;
      align-items: center;
      overflow-wrap: anywhere;
    }
    &--stack {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
  &__number {
    display: flex;
    gap: 2px;
    align-items: flex-start;
    min-width: 0;
    > :first-child {
      min-width: 0;
      flex: 1;
    }
    > button {
      flex-shrink: 0;
    }
  }
  &__paint {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  &__legend-positions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  &__checks {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  &__stack {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  &__negative {
    border: 0;
    padding: 0;
    margin: 0;
    legend {
      padding: 0 0 4px;
      white-space: nowrap;
    }
  }
  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
  }
  &__body > &__hint {
    margin: 4px 0 10px;
  }
  &__preview {
    display: grid;
    gap: 4px;
    output {
      padding: 8px;
      border: 1px solid var(--sheetcraft-border-subtle);
      border-radius: var(--sheetcraft-radius-small);
      overflow-wrap: anywhere;
      font-size: 14px;
      line-height: 22px;
    }
  }
  &__reset {
    padding-top: 12px;
  }
}
@media (max-width: 600px) {
  .chart-format-pane {
    width: min(320px, 100%);
  }
}
</style>
