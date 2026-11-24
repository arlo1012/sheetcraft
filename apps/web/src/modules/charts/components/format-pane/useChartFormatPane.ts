import { chartPlotSeries } from "../../chart-bubble";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  useId,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import type {
  ChartAxisDisplayUnit,
  ChartAxisLineFormat,
  ChartCategoryAxisFormat,
  ChartLegendFormat,
  ChartSeriesFormat,
  ChartSurfaceFormat,
  ChartTextFormat,
  ChartValueAxisFormat,
} from "@sheetcraft/core/chart-format";
import { validateCellNumberFormatCode } from "@sheetcraft/core/number-format";
import type { CellNumberFormat } from "@sheetcraft/core/style";
import type NumericField from "../../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericValue,
} from "../../../../shared/numeric-field/types";
import { useFontCatalog } from "../../../../shared/cell-text/useFontCatalog";
import type {
  TextStyleToggleItem,
  TextStyleToggleKey,
} from "../../../../shared/text-format/TextStyleToggleGroup.vue";
import { useAppI18n, type MessageKey } from "../../../../shared/i18n";
import { getChartElementSettings } from "../../chart-elements";
import { chartMinorGridlinesForAxis } from "../../chart-axis-state";
import type { ChartElementPatch } from "../../chart-element-controls";
import {
  chartAxisDraftErrorKeys as axisDraftErrorKeys,
  chartFontSizeSpec as fontSizeSpec,
  chartLegendFontSizeSpec as legendFontSizeSpec,
  chartLegendStrokeWidthSpec as legendStrokeWidthSpec,
  chartStrokeWidthSpec as strokeWidthSpec,
} from "../../chart-format-specs";
import { useChartFormatNumberSection } from "../../composables/useChartFormatNumberSection";
import {
  chartFormatTargetKey,
  chartFormatTargetLabelKeys,
  cloneChartTextFormat,
  compactChartAxis,
  createChartFormatDraft,
  editChartFormatDraft,
  getChartFormatCapabilities,
  getChartFormatSeries,
  getChartFormatTargets,
  getChartSeriesFormat,
  getChartValueAxisDraftError,
  initializeChartAxisTitle,
  resolveChartFormatSeriesId,
  setChartFormatField,
  setChartTextFontFamily,
  syncChartFormatDraft,
  type ChartFormatDraft,
  type ChartFormatDraftError,
  type ChartFormatIntent,
  type ChartFormatIntentHandler,
  type ChartFormatNumericField,
  type ChartFormatTarget,
} from "../../chart-format-pane";

export type ChartFormatPaneProps = Readonly<{
  drawing: SheetChartDrawing;
  data: ChartData;
  visibleData?: ChartData;
  target: ChartFormatTarget;
  disabled: boolean;
  error?: string;
  apply: ChartFormatIntentHandler;
}>;

export type ChartFormatSharedNumericField =
  | "min"
  | "max"
  | "majorUnit"
  | "minorUnit"
  | "fontSize"
  | "strokeWidth"
  | "markerSizePt"
  | "labelAngle"
  | "titleRotation"
  | "gapWidth"
  | "overlap"
  | "decimals";

type NumericFieldInstance = InstanceType<typeof NumericField>;

const NUMERIC_FIELDS: readonly ChartFormatNumericField[] = [
  "min",
  "max",
  "majorUnit",
  "minorUnit",
  "labelAngle",
  "titleRotation",
  "fontSize",
  "strokeWidth",
  "markerSizePt",
  "gapWidth",
  "overlap",
];

const SHARED_NUMERIC_FIELDS: readonly ChartFormatSharedNumericField[] = [
  "min",
  "max",
  "majorUnit",
  "minorUnit",
  "fontSize",
  "strokeWidth",
  "markerSizePt",
  "labelAngle",
  "titleRotation",
  "gapWidth",
  "overlap",
  "decimals",
];

const DRAFT_FIELDS = ["title", "axisTitle", "formatCode"] as const;

const ERROR_KEYS: Readonly<Record<ChartFormatDraftError, MessageKey>> = {
  number: "chart.formatInvalidNumber",
  bounds: "chart.formatInvalidBounds",
  format: "chart.formatInvalidFormat",
  rejected: "chart.formatApplyFailed",
  composition: "chart.formatFinishComposition",
};

export function useChartFormatPane(
  props: ChartFormatPaneProps,
  emitTarget: (target: ChartFormatTarget) => void,
  root: Ref<HTMLElement | undefined>,
) {
  const { t, locale } = useAppI18n();
  const paneId = `chart-format-${useId()}`;
  const popupProps = { overlayClassName: "chart-format-options-popup" };
  const disabled = computed(() => props.disabled);
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

  const axisTextMode = ref<"ticks" | "title">("ticks");
  const axisTextLease = ref(0);
  const ownerKey = computed(
    () =>
      `${props.drawing.id}/${targetKey.value}${axisTextLease.value ? `/axis-text:${axisTextLease.value}` : ""}`,
  );
  function changeAxisTextMode(value: unknown): void {
    if (!composing() && (value === "ticks" || value === "title") && value !== axisTextMode.value) {
      axisTextMode.value = value;
      axisTextLease.value++;
    }
  }
  watch(
    () => `${props.drawing.id}/${targetKey.value}`,
    () => {
      axisTextMode.value = "ticks";
    },
  );

  const legendMode = ref<"legend" | "text">("legend");
  const legendTab = ref<"surface" | "layout">("layout");
  const legendPage = computed(
    () => `${legendMode.value}/${legendMode.value === "legend" ? legendTab.value : "text"}`,
  );
  const legendFeedbackPage = ref<string>();
  watch(ownerKey, () => {
    legendMode.value = "legend";
    legendTab.value = "layout";
  });
  function changeLegendMode(value: unknown): void {
    if (!composing() && (value === "legend" || value === "text")) legendMode.value = value;
  }
  function changeLegendTab(value: unknown): void {
    if (!composing() && (value === "surface" || value === "layout")) legendTab.value = value;
  }
  function legendTabKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || composing()) return;
    const next =
      event.key === "Home"
        ? "surface"
        : event.key === "End"
          ? "layout"
          : ["ArrowLeft", "ArrowRight"].includes(event.key)
            ? legendTab.value === "layout"
              ? "surface"
              : "layout"
            : undefined;
    if (!next) return;
    event.preventDefault();
    changeLegendTab(next);
    root.value?.querySelector<HTMLButtonElement>(`#${paneId}-${next}-tab`)?.focus();
  }

  let live = true;
  let activeHandler: ChartFormatIntentHandler | undefined;
  const openSelectField = ref<string | null>(null);
  function selectControlAttrs(field: string) {
    return {
      attributes: {
        role: "combobox",
        "aria-expanded": String(openSelectField.value === field),
        "data-format-pane-history-control": "readonly-combobox",
        "data-chart-format-select": field,
      },
    };
  }
  function onSelectPopupVisibleChange(field: string, visible: boolean): void {
    if (visible) {
      openSelectField.value = field;
      return;
    }
    if (openSelectField.value === field) openSelectField.value = null;
    void nextTick(() => {
      if (!live) return;
      const active = document.activeElement;
      if (active && active !== document.body && root.value?.contains(active)) return;
      if (active && active !== document.body) return;
      const input = root.value?.querySelector<HTMLInputElement>(
        `input[data-chart-format-select="${field}"]`,
      );
      if (input && !input.disabled) input.focus({ preventScroll: true });
    });
  }
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
  // Keep native-number interaction changes scoped to verified ordinary primary axes.
  const ordinaryPrimaryValueAxis = computed(
    () =>
      kind.value === "valueAxis" &&
      ["column", "bar", "line"].includes(chart.value.type) &&
      !chart.value.stacked &&
      !percentageAxis.value &&
      !chart.value.pivotTableId,
  );
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
  const seriesMarkersVisible = computed(
    () =>
      series.value.markers ??
      (chart.value.type === "combo" ? false : (chart.value.presentation?.lineMarkers ?? true)),
  );
  const textFormat = computed<ChartTextFormat>(() =>
    kind.value === "legend"
      ? (chart.value.format?.legend?.text ?? {})
      : kind.value === "title"
        ? (chart.value.format?.title ?? {})
        : isAxis.value && axisTextMode.value === "title"
          ? (axis.value.titleText ?? {
              fontSize: 12,
              bold: false,
              italic: false,
              ...axis.value.text,
            })
          : (axis.value.text ?? {}),
  );
  const surfaceFormat = computed<ChartSurfaceFormat>(() =>
    kind.value === "legend"
      ? (chart.value.format?.legend?.surface ?? {})
      : (chart.value.format?.plot ?? {}),
  );
  const lineFormat = computed<ChartAxisLineFormat>(() =>
    kind.value === "plot" || kind.value === "legend"
      ? surfaceFormat.value
      : (axis.value.line ?? {}),
  );
  const elementSettings = computed(() => getChartElementSettings(chart.value));
  const barFormat = computed(() => chart.value.format?.bar ?? {});
  const fieldError = ref<ChartFormatDraftError>();
  let titleLayoutInteraction = false;
  let pendingResetField: string | undefined;
  const drafts = reactive<Record<string, ChartFormatDraft>>({});
  // A dirty draft belongs to the callback that was rendered when editing began.
  const draftHandlers = new Map<string, ChartFormatIntentHandler>();

  const numericControls = new Map<ChartFormatSharedNumericField, NumericFieldInstance>();
  function registerNumericControl(
    field: ChartFormatSharedNumericField,
    instance: NumericFieldInstance | null,
    previous?: NumericFieldInstance | null,
  ): void {
    if (instance) numericControls.set(field, instance);
    else if (!previous || numericControls.get(field) === previous) numericControls.delete(field);
  }
  function sharedNumericControl(field: ChartFormatSharedNumericField) {
    return numericControls.get(field);
  }

  const acceptedCategoryDecimals = ref<{ owner: string; value: number }>();
  // NumericField owns these drafts. The pane only mirrors their interaction state
  // for its existing composition guard and reset action availability.
  const sharedNumericDrafts = reactive<
    Partial<Record<ChartFormatSharedNumericField, NumericDraftChange>>
  >({});
  const sharedNumericResetErrors = reactive<Partial<Record<ChartFormatSharedNumericField, string>>>(
    {},
  );
  // Echo an acknowledged Reset until the next source snapshot arrives. This is
  // committed presentation state, never a second editable draft or document writer.
  const sharedNumericResets = reactive<Partial<Record<ChartFormatSharedNumericField, string>>>({});

  const fontSizeFieldSpec = computed(() =>
    kind.value === "legend" ? legendFontSizeSpec : fontSizeSpec,
  );
  const fontSizeLabel = computed(() =>
    t(kind.value === "legend" ? "chart.legendFontSize" : "chart.formatFontSize"),
  );
  const surfaceStrokeWidthSpec = computed(() =>
    kind.value === "legend" ? legendStrokeWidthSpec : strokeWidthSpec,
  );
  const surfaceStrokeWidthLabel = computed(() =>
    t(kind.value === "legend" ? "chart.legendLineWidth" : "chart.formatLineWidth"),
  );

  function sharedNumericValue(
    field: ChartFormatSharedNumericField,
    previous?: NumericValue,
  ): NumericValue {
    const value = sharedNumericResets[field] === ownerKey.value ? undefined : numericValue(field);
    if (value === undefined) return previous?.kind === "auto" ? previous : { kind: "auto" };
    return previous?.kind === "value" && previous.value === value
      ? previous
      : { kind: "value", value };
  }
  function sharedNumericCommit(field: ChartFormatSharedNumericField) {
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
      return accepted
        ? { accepted: true }
        : { accepted: false, error: t("chart.formatApplyFailed") };
    };
  }
  const numericValues = Object.fromEntries(
    SHARED_NUMERIC_FIELDS.map((field) => [
      field,
      computed<NumericValue>((previous) => sharedNumericValue(field, previous)),
    ]),
  ) as Record<ChartFormatSharedNumericField, ComputedRef<NumericValue>>;
  const numericCommits = Object.fromEntries(
    SHARED_NUMERIC_FIELDS.map((field) => [field, computed(() => sharedNumericCommit(field))]),
  ) as Record<
    ChartFormatSharedNumericField,
    ComputedRef<(candidate: NumericCandidate) => NumericCommitResult>
  >;

  function sharedNumericDraftChange(
    field: ChartFormatSharedNumericField,
    draft: NumericDraftChange,
  ): void {
    if (draft.ownerKey !== `${ownerKey.value}/${field}`) return;
    const previous = sharedNumericDrafts[field];
    sharedNumericDrafts[field] = draft;
    if (
      draft.text !== previous?.text ||
      !draft.dirty ||
      (previous?.composing && !draft.composing)
    ) {
      delete sharedNumericResetErrors[field];
      fieldError.value = undefined;
    }
  }
  function clearNumericResetError(field: ChartFormatSharedNumericField): void {
    delete sharedNumericResetErrors[field];
  }
  function sharedNumericFocusBoundary(field: ChartFormatSharedNumericField): Element[] {
    return [
      ...(root.value?.querySelectorAll(
        `[data-chart-format-reset="${field}"], [data-chart-format-reset="element"], [data-chart-format-reset="axisTitleText"], [data-chart-format-reset="${field === "fontSize" ? "legendText" : "legendSurface"}"], [data-chart-format-navigation]`,
      ) ?? []),
    ];
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
      case "titleRotation":
        return axis.value.titleRotation;
      case "labelAngle":
        return categoryAxis.value.labelAngle;
      case "fontSize":
        return textFormat.value.fontSize;
      case "strokeWidth":
        return kind.value === "series" ? series.value.strokeWidth : lineFormat.value.strokeWidth;
      case "markerSizePt":
        return series.value.markerSizePt;
      case "gapWidth":
      case "overlap":
        return barFormat.value[field];
    }
  }

  const sourceSeries = computed(() =>
    chartPlotSeries(chart.value, props.visibleData ?? props.data).filter((entry) => {
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
    (percentageAxis.value || ordinaryPrimaryValueAxis.value) &&
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
    if (NUMERIC_FIELDS.includes(field as ChartFormatNumericField))
      return numericValue(field as ChartFormatNumericField);
    if (field === "title") return chart.value.title;
    if (field === "axisTitle") return axis.value.title;
    if (field === "formatCode") return numberCode.value;
    if (field === "decimals") return decimals.value;
    return undefined;
  }
  function resetDrafts(): void {
    for (const field of DRAFT_FIELDS) drafts[field] = createChartFormatDraft(committedValue(field));
    draftHandlers.clear();
    for (const field of SHARED_NUMERIC_FIELDS) {
      sharedNumericControl(field)?.cancel();
      delete sharedNumericDrafts[field];
      delete sharedNumericResetErrors[field];
      delete sharedNumericResets[field];
    }
    acceptedCategoryDecimals.value = undefined;
    pendingResetField = undefined;
    fieldError.value = undefined;
  }
  watch(ownerKey, resetDrafts, { immediate: true });
  watch(
    () => [chart.value, props.data] as const,
    () => {
      for (const field of SHARED_NUMERIC_FIELDS) delete sharedNumericResets[field];
      acceptedCategoryDecimals.value = undefined;
      for (const field of DRAFT_FIELDS) syncChartFormatDraft(drafts[field]!, committedValue(field));
    },
    { deep: true },
  );
  watch(
    available,
    (value) => {
      if (!value) emitTarget({ kind: "chart" });
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
    const styledField = SHARED_NUMERIC_FIELDS.find(
      (field) => sharedNumericDrafts[field]?.composing,
    );
    const field = styledField ?? Object.keys(drafts).find((key) => drafts[key]!.composing);
    if (!field) return false;
    if (kind.value === "legend") legendFeedbackPage.value = legendPage.value;
    if (styledField) fieldError.value = "composition";
    else drafts[field]!.error = "composition";
    root.value
      ?.querySelector<HTMLInputElement>(`[data-chart-format-field="${field}"] input`)
      ?.focus();
    return true;
  }

  function submit(intent: ChartFormatIntent, handler = activeHandler ?? props.apply): boolean {
    if (kind.value === "legend") legendFeedbackPage.value = legendPage.value;
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
    if (target) emitTarget(target);
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
  function legendBranchIntent<K extends keyof ChartLegendFormat>(
    branch: K,
    value: ChartLegendFormat[K] | undefined,
  ): ChartFormatIntent {
    return {
      kind: "legend",
      format: setChartFormatField(chart.value.format?.legend ?? {}, branch, value),
    };
  }
  function resetLegendBranch(branch: "text" | "surface"): void {
    if (kind.value !== "legend" || composing()) return;
    if (!submit(legendBranchIntent(branch, undefined))) return;
    const field = branch === "text" ? "fontSize" : "strokeWidth";
    sharedNumericControl(field)?.cancel();
    delete sharedNumericResetErrors[field];
    sharedNumericResets[field] = ownerKey.value;
  }
  function textIntent(next: ChartTextFormat | undefined): ChartFormatIntent | undefined {
    if (kind.value === "legend") return legendBranchIntent("text", next);
    if (kind.value === "title") return { kind: "title", format: next };
    if (isAxis.value) {
      const nextAxis = { ...axis.value };
      if (axisTextMode.value === "title") nextAxis.titleText = cloneChartTextFormat(next ?? {});
      else if (next) nextAxis.text = next;
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
      case "titleRotation":
        return isAxis.value
          ? axisIntent(setChartFormatField(axis.value, field, value) ?? {})
          : undefined;
      case "labelAngle":
        return kind.value === "categoryAxis"
          ? { kind: "categoryAxis", format: setChartFormatField(categoryAxis.value, field, value) }
          : undefined;
      case "gapWidth":
      case "overlap":
        return (kind.value === "chart" || kind.value === "series") && capabilities.value.bar
          ? { kind: "chart", format: setChartFormatField(barFormat.value, field, value) }
          : undefined;
      case "markerSizePt":
        return props.target.kind === "series" &&
          capabilities.value.seriesMarkerSize &&
          (value === undefined || seriesMarkersVisible.value)
          ? {
              kind: "series",
              seriesId: props.target.seriesId,
              format: setChartFormatField(series.value, "markerSizePt", value),
            }
          : undefined;
      case "strokeWidth":
        if (kind.value === "legend")
          return legendBranchIntent(
            "surface",
            setChartFormatField(surfaceFormat.value, "strokeWidth", value),
          );
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
  function resetAxisTitleText(): void {
    const intent = textIntent({});
    if (intent && submit(intent)) resetDrafts();
  }
  const textBoldActive = computed(
    () => textFormat.value.bold ?? (kind.value === "title" && chart.value.type !== "wordCloud"),
  );
  const textStyleItems = computed<readonly TextStyleToggleItem[]>(() => [
    {
      key: "bold",
      label: t("format.bold"),
      pressed: textBoldActive.value,
      disabled: props.disabled,
    },
    {
      key: "italic",
      label: t("format.italic"),
      pressed: textFormat.value.italic ?? false,
      disabled: props.disabled,
    },
  ]);
  function toggleTextStyle(key: TextStyleToggleKey): void {
    if (key === "bold") setText("bold", !textBoldActive.value);
    else if (key === "italic") setText("italic", !(textFormat.value.italic ?? false));
  }
  function setFontFamily(value: unknown): void {
    if (typeof value !== "string") return;
    const intent = textIntent(setChartTextFontFamily(textFormat.value, value || undefined));
    if (intent) submit(intent);
  }

  function setLineColor(value: string | null): void {
    if (kind.value === "legend") {
      submit(
        legendBranchIntent(
          "surface",
          setChartFormatField(surfaceFormat.value, "stroke", value ?? undefined),
        ),
      );
    } else if (kind.value === "plot") {
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
    if (kind.value === "legend")
      submit(
        legendBranchIntent(
          "surface",
          setChartFormatField(surfaceFormat.value, "fill", value ?? undefined),
        ),
      );
    else if (kind.value === "plot")
      submit({
        kind: "plot",
        format: setChartFormatField(chart.value.format?.plot ?? {}, "fill", value ?? undefined),
      });
  }

  const displayUnitOptions = computed(() => [
    { value: "none", label: t("chart.displayUnitNone") },
    { value: "hundreds", label: t("chart.displayUnitHundreds") },
    { value: "thousands", label: t("chart.displayUnitThousands") },
    { value: "tenThousands", label: t("chart.displayUnitTenThousands") },
    { value: "millions", label: t("chart.displayUnitMillions") },
    { value: "hundredMillions", label: t("chart.displayUnitHundredMillions") },
  ]);
  function setAxisDisplayUnit(value: unknown): void {
    if (
      !isValueAxis.value ||
      percentageAxis.value ||
      (value !== "none" &&
        value !== "hundreds" &&
        value !== "thousands" &&
        value !== "tenThousands" &&
        value !== "millions" &&
        value !== "hundredMillions")
    )
      return;
    const next = { ...valueAxis.value };
    if (value === "none") delete next.displayUnit;
    else next.displayUnit = value as ChartAxisDisplayUnit;
    const intent = axisIntent(next);
    if (intent) submit(intent);
  }
  function setAxisBoolean(
    field: "show" | "reverse" | "titleVisible" | "majorGridlines" | "minorGridlines",
    value: unknown,
  ): void {
    if ((field === "majorGridlines" || field === "minorGridlines") && !isValueAxis.value) return;
    let format = { ...axis.value, [field]: !!value };
    if (field === "titleVisible" && value && !format.title?.trim() && isAxis.value)
      format = initializeChartAxisTitle(
        format,
        chart.value.type,
        kind.value as "categoryAxis" | "valueAxis" | "secondaryValueAxis",
        t("chart.axisTitlePlaceholder"),
      );
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
        ...setChartFormatField(
          draft.text.trim() && !axis.value.title?.trim()
            ? initializeChartAxisTitle(
                axis.value,
                chart.value.type,
                kind.value as "categoryAxis" | "valueAxis" | "secondaryValueAxis",
                draft.text,
              )
            : axis.value,
          "title",
          draft.text || undefined,
        ),
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
      event.target instanceof Element &&
      !!event.target.closest("[data-chart-format-title-position]");
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
  function setMarkerSymbol(value: unknown): void {
    if (
      !capabilities.value.seriesMarkerSymbol ||
      (value !== "" && value !== "circle" && value !== "square") ||
      (value !== "" && !seriesMarkersVisible.value)
    )
      return;
    setSeries("markerSymbol", value === "" ? undefined : value);
  }

  const {
    numberIntent,
    toggleSourceLink,
    numberCategoryOptions,
    selectNumberCategory,
    showDecimals,
    showCurrency,
    showCode,
    showNegative,
    setGrouping,
    setCurrency,
    setNegative,
    negativeOptions,
    currencyOptions,
    numberPreview,
  } = useChartFormatNumberSection({
    isValueAxis,
    percentageAxis,
    ordinaryPrimaryValueAxis,
    valueAxis,
    sourceSeries,
    numberFormat,
    numberCategory,
    locale,
    t,
    axisIntent,
    submit,
    onCategoryApplied: (next) => {
      // An accepted category replaces both number-format editors, even before the
      // next owner snapshot arrives. Unrelated axis drafts remain untouched.
      acceptedCategoryDecimals.value = {
        owner: ownerKey.value,
        value: next && "fractionDigits" in next ? (next.fractionDigits ?? 2) : 2,
      };
      sharedNumericControl("decimals")?.cancel();
      delete sharedNumericDrafts.decimals;
      delete sharedNumericResetErrors.decimals;
      drafts.formatCode = createChartFormatDraft(next && "code" in next ? next.code : "");
      draftHandlers.delete("formatCode");
    },
  });

  const { fontOptions } = useFontCatalog(() => [
    ...(textFormat.value.fontFamily ? [textFormat.value.fontFamily] : []),
    ...Object.values(textFormat.value.scriptFonts ?? {}).flatMap((choice) =>
      choice.kind === "family" ? [choice.family] : [],
    ),
  ]);
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
  const markerSymbolOptions = computed(() => [
    { value: "", label: t("chart.formatAuto") },
    { value: "circle", label: t("chart.formatMarkerCircle") },
    { value: "square", label: t("chart.formatMarkerSquare") },
  ]);

  const localError = computed(
    () => Object.values(drafts).find((draft) => draft.error)?.error ?? fieldError.value,
  );
  const errorMessage = computed(() =>
    kind.value === "legend" &&
    legendFeedbackPage.value &&
    legendFeedbackPage.value !== legendPage.value
      ? undefined
      : props.error ||
        (localError.value
          ? t(ERROR_KEYS[localError.value])
          : minorGridlinesState.value.invalid
            ? t("chart.formatInvalidBounds")
            : undefined),
  );

  function resetElement(): void {
    if (kind.value === "legend") {
      submit({ kind: "legend", reset: true });
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

  return {
    t,
    locale,
    root,
    paneId,
    popupProps,
    disabled,
    chart,
    capabilities,
    targetKey,
    targetOptions,
    available,
    kind,
    isAxis,
    isValueAxis,
    percentageAxis,
    valueAxis,
    axis,
    minorGridlinesState,
    series,
    seriesMarkersVisible,
    textFormat,
    surfaceFormat,
    lineFormat,
    elementSettings,
    axisTextMode,
    legendMode,
    legendTab,
    ownerKey,
    drafts,
    numericValues,
    numericCommits,
    sharedNumericDrafts,
    sharedNumericResetErrors,
    fontSizeFieldSpec,
    fontSizeLabel,
    surfaceStrokeWidthSpec,
    surfaceStrokeWidthLabel,
    textStyleItems,
    fontFamilyOptions,
    titlePositionOptions,
    displayUnitOptions,
    seriesAxisOptions,
    markerSymbolOptions,
    linkedToSource,
    numberFormat,
    numberCategory,
    numberCategoryOptions,
    showDecimals,
    showCurrency,
    showCode,
    showNegative,
    negativeOptions,
    currencyOptions,
    numberPreview,
    errorMessage,
    canChangeTarget: () => live && !composing(),
    getHistoryElement: () => (live ? root.value : undefined),
    registerNumericControl,
    sharedNumericDraftChange,
    clearNumericResetError,
    sharedNumericFocusBoundary,
    selectControlAttrs,
    onSelectPopupVisibleChange,
    captureAction,
    textAction,
    editAction,
    compositionStartAction,
    compositionEndAction,
    changeTarget,
    changeAxisTextMode,
    changeLegendMode,
    changeLegendTab,
    legendTabKeydown,
    resetNumber,
    resetLegendBranch,
    resetAxisTitleText,
    resetElement,
    setText,
    toggleTextStyle,
    setFontFamily,
    setLineColor,
    setFill,
    setAxisDisplayUnit,
    setAxisBoolean,
    blurTitle,
    setTitlePosition,
    setLegendPosition,
    setLegendNonOverlapping,
    setSeries,
    setMarkerSymbol,
    toggleSourceLink,
    selectNumberCategory,
    setGrouping,
    setCurrency,
    setNegative,
    pointerDown,
    escapeDraft,
  };
}

export type ChartFormatPaneController = ReturnType<typeof useChartFormatPane>;
