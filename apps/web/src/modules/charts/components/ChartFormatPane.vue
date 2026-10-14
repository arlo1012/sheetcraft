<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Input as TInput } from "tdesign-vue-next/es/input";
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
import FontFormatField from "../../home-tools/components/FontFormatField.vue";
import FontSettingsAction from "../../../shared/cell-text/FontSettingsAction.vue";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import { useAppI18n } from "../../../shared/i18n";
import type { MessageKey } from "../../../shared/i18n";
import type { ChartElementPatch } from "../chart-element-controls";
import {
  chartFormatTargetKey,
  compactChartAxis,
  commitChartFormatNumberDraft,
  createChartFormatDraft,
  editChartFormatDraft,
  getChartFormatCapabilities,
  getChartFormatSeries,
  getChartFormatTargets,
  getChartSeriesFormat,
  isChartValueAxisDraftValid,
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
const capabilities = computed(() => getChartFormatCapabilities(chart.value, props.data));
const targets = computed(() => getChartFormatTargets(chart.value, props.data));
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
function numberAction(field: ChartFormatNumericField) {
  return captureAction((value: string | number, context: { e: KeyboardEvent | FocusEvent }) =>
    commitNumber(field, value, context),
  );
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
const categoryAxis = computed(() => chart.value.format?.categoryAxis ?? {});
const axis = computed<ChartCategoryAxisFormat | ChartValueAxisFormat>(() =>
  kind.value === "categoryAxis" ? categoryAxis.value : valueAxis.value,
);
const series = computed(() =>
  props.target.kind === "series" ? getChartSeriesFormat(chart.value, props.target.seriesId) : {},
);
const textFormat = computed<ChartTextFormat>(() =>
  kind.value === "title" ? (chart.value.format?.title ?? {}) : (axis.value.text ?? {}),
);
const lineFormat = computed<ChartAxisLineFormat>(() =>
  kind.value === "plot" ? (chart.value.format?.plot ?? {}) : (axis.value.line ?? {}),
);
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
const draftFields = [...numericFields, "title", "axisTitle", "formatCode", "decimals"];
function numericValue(field: ChartFormatNumericField): number | undefined {
  switch (field) {
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
  (chart.value.type === "scatter" ? props.data.series.slice(1) : props.data.series).filter(
    (entry) => {
      const secondary =
        !!entry.id &&
        chart.value.format?.series?.some(
          (format) => format.id === entry.id && format.axis === "secondary",
        );
      return kind.value === "secondaryValueAxis" ? secondary : !secondary;
    },
  ),
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
  pendingResetField = undefined;
  fieldError.value = undefined;
}
watch(() => `${props.drawing.id}/${targetKey.value}`, resetDrafts, { immediate: true });
watch(
  () => [chart.value, props.data] as const,
  () => {
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
  const field = Object.keys(drafts).find((key) => drafts[key]!.composing);
  if (!field) return false;
  drafts[field]!.error = "composition";
  root.value
    ?.querySelector<HTMLInputElement>(`[data-chart-format-field="${field}"] input`)
    ?.focus();
  return true;
}
defineExpose({ canChangeTarget: () => live && !composing() });
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
  switch (target.kind) {
    case "chart":
      return t("chart.formatChartArea");
    case "title":
      return t("chart.title");
    case "plot":
      return t("chart.formatPlotArea");
    case "categoryAxis":
      return t("chart.formatCategoryAxis");
    case "valueAxis":
      return t("chart.formatValueAxis");
    case "secondaryValueAxis":
      return t("chart.formatSecondaryValueAxis");
    case "series":
      return t("chart.formatSeriesName", {
        name:
          getChartFormatSeries(chart.value, props.data).find(
            (entry) => entry.id === target.seriesId,
          )?.name ?? target.seriesId,
      });
  }
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
  field: ChartFormatNumericField,
  value: number | undefined,
): ChartFormatIntent | undefined {
  switch (field) {
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
function commitNumber(
  field: ChartFormatNumericField,
  _value?: unknown,
  context?: { e: KeyboardEvent | FocusEvent },
): boolean {
  if (props.disabled) return false;
  if (
    context?.e instanceof FocusEvent &&
    (pendingResetField === field || pendingResetField === "element")
  )
    return true;
  if (context?.e instanceof KeyboardEvent && context.e.isComposing) {
    drafts[field]!.error = "composition";
    return false;
  }
  const handler = draftHandlers.get(field) ?? props.apply;
  const accepted = commitChartFormatNumberDraft(
    drafts[field]!,
    field,
    (value) => {
      const intent = numericIntent(field, value);
      return !!intent && submit(intent, handler);
    },
    (value) => {
      if (!["min", "max", "majorUnit", "minorUnit"].includes(field)) return true;
      return isChartValueAxisDraftValid(
        setChartFormatField(
          valueAxis.value,
          field as "min" | "max" | "majorUnit" | "minorUnit",
          value,
        ) ?? {},
      );
    },
  );
  if (accepted) draftHandlers.delete(field);
  return accepted;
}
function resetNumber(field: ChartFormatNumericField): void {
  if (props.disabled || composing()) return;
  pendingResetField = undefined;
  // Discarding an invalid auto draft does not manufacture an unchanged workbook edit.
  if (numericValue(field) === undefined) {
    drafts[field] = createChartFormatDraft();
    draftHandlers.delete(field);
    fieldError.value = undefined;
    return;
  }
  const intent = numericIntent(field, undefined);
  if (intent && submit(intent)) {
    drafts[field] = createChartFormatDraft();
    draftHandlers.delete(field);
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
  applyNumberFormat(defaults[category]);
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
function commitDecimals(_value?: unknown, context?: { e: KeyboardEvent | FocusEvent }): void {
  if (context?.e instanceof FocusEvent && pendingResetField === "element") return;
  const draft = drafts.decimals!;
  if (draft.composing || (context?.e instanceof KeyboardEvent && context.e.isComposing)) {
    draft.error = "composition";
    return;
  }
  if (!draft.dirty) return;
  const digits = Number(draft.text.trim()),
    format = numberFormat.value;
  if (
    !/^\d+$/.test(draft.text.trim()) ||
    !Number.isInteger(digits) ||
    digits < 0 ||
    digits > 20 ||
    !format ||
    !(
      format.kind === "number" ||
      format.kind === "percent" ||
      format.kind === "currency" ||
      format.kind === "accounting" ||
      format.kind === "scientific"
    )
  ) {
    draft.error = "number";
    return;
  }
  const intent = numberIntent({ ...format, fractionDigits: digits });
  if (!intent || !submit(intent, draftHandlers.get("decimals") ?? props.apply)) {
    draft.error = "rejected";
    return;
  }
  draft.dirty = false;
  delete draft.error;
  draftHandlers.delete("decimals");
}
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
  () => props.error || (localError.value ? t(errorKeys[localError.value]) : undefined),
);
function resetElement(): void {
  if (kind.value === "chart") {
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
        v-if="!chart.source && capabilities.hasData && (kind === 'chart' || isAxis)"
        class="chart-format-pane__hint"
      >
        {{ t("chart.formatSeriesUnavailable") }}
      </p>

      <details v-if="kind === 'title'" class="chart-format-pane__section" open>
        <summary>{{ t("chart.title") }}</summary>
        <div class="chart-format-pane__section-body">
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
        </div>
      </details>

      <details v-if="isAxis" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatAxisOptions") }}</summary>
        <div class="chart-format-pane__section-body">
          <TCheckbox
            :checked="axis.show ?? true"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setAxisBoolean('show', value))"
            >{{ t("chart.formatShowAxis") }}</TCheckbox
          >
          <TCheckbox
            :checked="axis.reverse ?? false"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setAxisBoolean('reverse', value))"
            >{{ t("chart.formatReverse") }}</TCheckbox
          >
          <TCheckbox
            :checked="axis.titleVisible ?? !!axis.title"
            :disabled="disabled"
            data-chart-format-field="titleVisible"
            :onChange="captureAction((value: unknown) => setAxisBoolean('titleVisible', value))"
            >{{ t("chart.formatShowAxisTitle") }}</TCheckbox
          >
          <template v-if="isValueAxis">
            <TCheckbox
              :checked="valueAxis.majorGridlines ?? true"
              :disabled="disabled"
              data-chart-format-field="majorGridlines"
              :onChange="captureAction((value: unknown) => setAxisBoolean('majorGridlines', value))"
              >{{ t("chart.formatMajorGridlines") }}</TCheckbox
            >
            <TCheckbox
              :checked="valueAxis.minorGridlines ?? false"
              :disabled="disabled"
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
              <TInput
                :id="`${paneId}-angle`"
                :value="drafts.labelAngle!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatLabelAngle')"
                :status="drafts.labelAngle!.error ? 'error' : undefined"
                :onChange="editAction('labelAngle')"
                :onCompositionstart="compositionStartAction('labelAngle')"
                :onCompositionend="compositionEndAction('labelAngle')"
                :onEnter="numberAction('labelAngle')"
                :onBlur="numberAction('labelAngle')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (categoryAxis.labelAngle === undefined && !drafts.labelAngle!.dirty)
                "
                :aria-label="t('chart.formatReset')"
                data-chart-format-reset="labelAngle"
                :onClick="captureAction(() => resetNumber('labelAngle'))"
                ><RotateCcw :size="14" aria-hidden="true"
              /></TButton>
            </div>
          </div>
        </div>
      </details>

      <details v-if="isValueAxis" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatBounds") }}</summary>
        <div class="chart-format-pane__section-body">
          <p v-if="percentageAxis" class="chart-format-pane__hint">
            {{ t("chart.formatPercentAxisHint") }}
          </p>
          <div class="chart-format-pane__field" data-chart-format-field="min">
            <label :for="`${paneId}-min`">{{ t("chart.formatMinimum") }}</label>
            <div class="chart-format-pane__number">
              <TInput
                :id="`${paneId}-min`"
                :value="drafts.min!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatMinimum')"
                :status="drafts.min!.error ? 'error' : undefined"
                :onChange="editAction('min')"
                :onCompositionstart="compositionStartAction('min')"
                :onCompositionend="compositionEndAction('min')"
                :onEnter="numberAction('min')"
                :onBlur="numberAction('min')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="disabled || (valueAxis.min === undefined && !drafts.min!.dirty)"
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
              <TInput
                :id="`${paneId}-max`"
                :value="drafts.max!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatMaximum')"
                :status="drafts.max!.error ? 'error' : undefined"
                :onChange="editAction('max')"
                :onCompositionstart="compositionStartAction('max')"
                :onCompositionend="compositionEndAction('max')"
                :onEnter="numberAction('max')"
                :onBlur="numberAction('max')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="disabled || (valueAxis.max === undefined && !drafts.max!.dirty)"
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
              <TInput
                :id="`${paneId}-major`"
                :value="drafts.majorUnit!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatMajorUnit')"
                :status="drafts.majorUnit!.error ? 'error' : undefined"
                :onChange="editAction('majorUnit')"
                :onCompositionstart="compositionStartAction('majorUnit')"
                :onCompositionend="compositionEndAction('majorUnit')"
                :onEnter="numberAction('majorUnit')"
                :onBlur="numberAction('majorUnit')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (valueAxis.majorUnit === undefined && !drafts.majorUnit!.dirty)
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
              <TInput
                :id="`${paneId}-minor`"
                :value="drafts.minorUnit!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatMinorUnit')"
                :status="drafts.minorUnit!.error ? 'error' : undefined"
                :onChange="editAction('minorUnit')"
                :onCompositionstart="compositionStartAction('minorUnit')"
                :onCompositionend="compositionEndAction('minorUnit')"
                :onEnter="numberAction('minorUnit')"
                :onBlur="numberAction('minorUnit')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (valueAxis.minorUnit === undefined && !drafts.minorUnit!.dirty)
                "
                :aria-label="t('chart.formatReset')"
                data-chart-format-reset="minorUnit"
                :onClick="captureAction(() => resetNumber('minorUnit'))"
                ><RotateCcw :size="14" aria-hidden="true"
              /></TButton>
            </div>
          </div>
        </div>
      </details>

      <details v-if="kind === 'title' || isAxis" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatText") }}</summary>
        <div class="chart-format-pane__section-body">
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
              <TInput
                :id="`${paneId}-font-size`"
                :value="drafts.fontSize!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatFontSize')"
                :status="drafts.fontSize!.error ? 'error' : undefined"
                :onChange="editAction('fontSize')"
                :onCompositionstart="compositionStartAction('fontSize')"
                :onCompositionend="compositionEndAction('fontSize')"
                :onEnter="numberAction('fontSize')"
                :onBlur="numberAction('fontSize')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (textFormat.fontSize === undefined && !drafts.fontSize!.dirty)
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
              :checked="textFormat.bold ?? (kind === 'title' && chart.type !== 'wordCloud')"
              :disabled="disabled"
              :onChange="captureAction((value: unknown) => setText('bold', !!value))"
              >{{ t("format.bold") }}</TCheckbox
            ><TCheckbox
              :checked="textFormat.italic ?? false"
              :disabled="disabled"
              :onChange="captureAction((value: unknown) => setText('italic', !!value))"
              >{{ t("format.italic") }}</TCheckbox
            >
          </div>
          <p class="chart-format-pane__hint">{{ t("chart.formatFontHint") }}</p>
        </div>
      </details>

      <details v-if="kind === 'plot' || isAxis" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatAppearance") }}</summary>
        <div class="chart-format-pane__section-body">
          <div v-if="kind === 'plot'" class="chart-format-pane__field">
            <span>{{ t("chart.formatFill") }}</span>
            <div class="chart-format-pane__paint">
              <ColorPaletteSelect
                panel-class="chart-format-options-popup"
                :model-value="chart.format?.plot?.fill"
                :label="t('chart.formatFill')"
                :disabled="disabled"
                :default-label="t('chart.formatDefault')"
                show-value
                :onSelect="captureAction(setFill)"
              /><TButton
                variant="text"
                size="small"
                :disabled="disabled"
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
                :label="t('chart.formatLine')"
                :disabled="disabled"
                :default-label="t('chart.formatDefault')"
                show-value
                :onSelect="captureAction(setLineColor)"
              /><TButton
                variant="text"
                size="small"
                :disabled="disabled"
                :onClick="captureAction(() => setLineColor('transparent'))"
                >{{ t("chart.formatNoLine") }}</TButton
              >
            </div>
          </div>
          <div class="chart-format-pane__field" data-chart-format-field="strokeWidth">
            <label :for="`${paneId}-line-width`">{{ t("chart.formatLineWidth") }}</label>
            <div class="chart-format-pane__number">
              <TInput
                :id="`${paneId}-line-width`"
                :value="drafts.strokeWidth!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatLineWidth')"
                :status="drafts.strokeWidth!.error ? 'error' : undefined"
                :onChange="editAction('strokeWidth')"
                :onCompositionstart="compositionStartAction('strokeWidth')"
                :onCompositionend="compositionEndAction('strokeWidth')"
                :onEnter="numberAction('strokeWidth')"
                :onBlur="numberAction('strokeWidth')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (lineFormat.strokeWidth === undefined && !drafts.strokeWidth!.dirty)
                "
                :aria-label="t('chart.formatReset')"
                data-chart-format-reset="strokeWidth"
                :onClick="captureAction(() => resetNumber('strokeWidth'))"
                ><RotateCcw :size="14" aria-hidden="true"
              /></TButton>
            </div>
          </div>
        </div>
      </details>

      <details v-if="isValueAxis" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatNumber") }}</summary>
        <div class="chart-format-pane__section-body">
          <TCheckbox
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
            ><TInput
              :id="`${paneId}-decimals`"
              :value="drafts.decimals!.text"
              size="small"
              :disabled="disabled"
              :aria-label="t('cellFormat.decimalPlaces')"
              :status="drafts.decimals!.error ? 'error' : undefined"
              :onChange="editAction('decimals')"
              :onCompositionstart="compositionStartAction('decimals')"
              :onCompositionend="compositionEndAction('decimals')"
              :onEnter="captureAction(commitDecimals)"
              :onBlur="captureAction(commitDecimals)"
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
        </div>
      </details>

      <details v-if="kind === 'series'" class="chart-format-pane__section" open>
        <summary>{{ t("chart.formatSeriesOptions") }}</summary>
        <div class="chart-format-pane__section-body">
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
              <TInput
                :id="`${paneId}-series-width`"
                :value="drafts.strokeWidth!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatLineWidth')"
                :status="drafts.strokeWidth!.error ? 'error' : undefined"
                :onChange="editAction('strokeWidth')"
                :onCompositionstart="compositionStartAction('strokeWidth')"
                :onCompositionend="compositionEndAction('strokeWidth')"
                :onEnter="numberAction('strokeWidth')"
                :onBlur="numberAction('strokeWidth')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (series.strokeWidth === undefined && !drafts.strokeWidth!.dirty)
                "
                :aria-label="t('chart.formatReset')"
                data-chart-format-reset="strokeWidth"
                :onClick="captureAction(() => resetNumber('strokeWidth'))"
                ><RotateCcw :size="14" aria-hidden="true"
              /></TButton>
            </div>
          </div>
          <TCheckbox
            v-if="capabilities.seriesSmooth"
            :checked="series.smooth ?? false"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setSeries('smooth', !!value))"
            >{{ t("chart.formatSmooth") }}</TCheckbox
          >
          <TCheckbox
            v-if="capabilities.seriesMarkers"
            :checked="series.markers ?? chart.presentation?.lineMarkers ?? true"
            :disabled="disabled"
            :onChange="captureAction((value: unknown) => setSeries('markers', !!value))"
            >{{ t("chart.formatMarkers") }}</TCheckbox
          >
        </div>
      </details>

      <details
        v-if="capabilities.bar && (kind === 'chart' || kind === 'series')"
        class="chart-format-pane__section"
        open
      >
        <summary>{{ t("chart.formatBarLayout") }}</summary>
        <div class="chart-format-pane__section-body">
          <p class="chart-format-pane__hint">{{ t("chart.formatBarGlobalHint") }}</p>
          <div class="chart-format-pane__field" data-chart-format-field="gapWidth">
            <label :for="`${paneId}-gap`">{{ t("chart.formatGapWidth") }}</label>
            <div class="chart-format-pane__number">
              <TInput
                :id="`${paneId}-gap`"
                :value="drafts.gapWidth!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatGapWidth')"
                :status="drafts.gapWidth!.error ? 'error' : undefined"
                :onChange="editAction('gapWidth')"
                :onCompositionstart="compositionStartAction('gapWidth')"
                :onCompositionend="compositionEndAction('gapWidth')"
                :onEnter="numberAction('gapWidth')"
                :onBlur="numberAction('gapWidth')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="
                  disabled || (barFormat.gapWidth === undefined && !drafts.gapWidth!.dirty)
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
              <TInput
                :id="`${paneId}-overlap`"
                :value="drafts.overlap!.text"
                size="small"
                :placeholder="t('chart.formatAuto')"
                :disabled="disabled"
                :aria-label="t('chart.formatOverlap')"
                :status="drafts.overlap!.error ? 'error' : undefined"
                :onChange="editAction('overlap')"
                :onCompositionstart="compositionStartAction('overlap')"
                :onCompositionend="compositionEndAction('overlap')"
                :onEnter="numberAction('overlap')"
                :onBlur="numberAction('overlap')"
              /><TButton
                variant="text"
                shape="square"
                size="small"
                :disabled="disabled || (barFormat.overlap === undefined && !drafts.overlap!.dirty)"
                :aria-label="t('chart.formatReset')"
                data-chart-format-reset="overlap"
                :onClick="captureAction(() => resetNumber('overlap'))"
                ><RotateCcw :size="14" aria-hidden="true"
              /></TButton>
            </div>
          </div>
        </div>
      </details>
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
  &__section {
    border-bottom: 1px solid var(--sheetcraft-border-subtle);
    summary {
      cursor: pointer;
      font-weight: 600;
      padding: 10px 0;
      white-space: nowrap;
    }
  }
  &__section-body {
    display: grid;
    gap: 10px;
    padding: 0 0 12px;
  }
  &__field {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    min-width: 0;
    > label,
    > span {
      white-space: nowrap;
    }
    &--stack {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
  &__number {
    display: flex;
    gap: 2px;
    align-items: center;
    min-width: 0;
    > :first-child {
      min-width: 0;
      flex: 1;
    }
  }
  &__paint {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
    min-width: 0;
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
