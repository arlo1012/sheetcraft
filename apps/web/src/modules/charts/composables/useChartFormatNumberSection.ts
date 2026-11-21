import { computed, type ComputedRef, type Ref } from "vue";
import type { ChartValueAxisFormat } from "@sheetcraft/core/chart-format";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { CellNumberFormat, CellNumberFormatNegativeStyle } from "@sheetcraft/core/style";
import type { MessageKey } from "../../../shared/i18n";
import {
  chartNumberCategoryKeys,
  createDefaultChartNumberFormat,
  type ChartNumberCategory,
} from "../chart-format-specs";
import type { ChartFormatIntent } from "../chart-format-pane";

type ChartFormatNumberSectionOptions = {
  isValueAxis: ComputedRef<boolean>;
  percentageAxis: ComputedRef<boolean>;
  ordinaryPrimaryValueAxis: ComputedRef<boolean>;
  valueAxis: ComputedRef<ChartValueAxisFormat>;
  sourceSeries: ComputedRef<readonly { values: readonly (number | null)[] }[]>;
  numberFormat: ComputedRef<CellNumberFormat | undefined>;
  numberCategory: ComputedRef<ChartNumberCategory>;
  locale: Ref<string>;
  t: (key: MessageKey) => string;
  axisIntent: (next: ChartValueAxisFormat) => ChartFormatIntent | undefined;
  submit: (intent: ChartFormatIntent) => boolean;
  onCategoryApplied: (next: CellNumberFormat | undefined) => void;
};

/** Owns ChartFormatPane value-axis number format options, mutations, and live preview formatting. */
export function useChartFormatNumberSection(options: ChartFormatNumberSectionOptions) {
  const {
    isValueAxis,
    percentageAxis,
    ordinaryPrimaryValueAxis,
    valueAxis,
    sourceSeries,
    numberFormat,
    numberCategory,
    locale,
    t,
  } = options;

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
    return options.axisIntent(next);
  }

  function applyNumberFormat(format: CellNumberFormat | undefined): boolean {
    const intent = numberIntent(format);
    return !!intent && options.submit(intent);
  }

  function toggleSourceLink(value: unknown): void {
    if (percentageAxis.value) return;
    const next = { ...valueAxis.value, linkedToSource: !!value };
    // Relinking is an explicit edit, never a normalization of dormant input state.
    if (ordinaryPrimaryValueAxis.value && value) delete next.numberFormat;
    const intent = options.axisIntent(next);
    if (intent) options.submit(intent);
  }

  const numberCategoryOptions = computed(() =>
    Object.entries(chartNumberCategoryKeys).map(([value, key]) => ({ value, label: t(key) })),
  );

  function selectNumberCategory(value: unknown): void {
    if (typeof value !== "string" || !Object.hasOwn(chartNumberCategoryKeys, value)) return;
    const next = createDefaultChartNumberFormat(
      value as ChartNumberCategory,
      locale.value,
      ordinaryPrimaryValueAxis.value,
    );
    if (!applyNumberFormat(next)) return;
    options.onCategoryApplied(next);
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
    if (
      typeof value === "string" &&
      (format?.kind === "currency" || format?.kind === "accounting")
    ) {
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

  return {
    numberIntent,
    applyNumberFormat,
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
  };
}
