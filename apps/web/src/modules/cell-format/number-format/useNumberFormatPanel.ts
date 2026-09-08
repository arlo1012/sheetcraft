import { computed, ref, watch, type Ref } from "vue";
import {
  formatCellNumberValue,
  toCellNumberFormatCode,
  validateCellNumberFormatCode,
} from "@idea10/core/number-format";
import type {
  CellNumberFormat,
  CellNumberFormatNegativeStyle,
  CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { useAppI18n } from "../../../shared/i18n";
import {
  getCustomFormatPresets,
  getNumberFormatPresets,
  NUMBER_FORMAT_DESCRIPTION_KEYS,
  type NumberFormatCategory,
} from "./catalog";
import { readCustomNumberFormats, removeCustomNumberFormat } from "./custom-formats";

type PanelProps = Readonly<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
}>;

export function useNumberFormatPanel(
  props: PanelProps,
  updatePatch: (patch: CellStylePatch) => void,
  updateValidity: (valid: boolean) => void,
) {
  const { locale, t } = useAppI18n();
  const currentFormat = () =>
    Object.hasOwn(props.patch, "numberFormat")
      ? ((props.patch.numberFormat || undefined) as CellNumberFormat | undefined)
      : props.state.numberFormat.mixed
        ? undefined
        : props.state.numberFormat.value;
  const category = ref<NumberFormatCategory>(currentFormat()?.kind ?? "general");
  const fractionDigits = ref(2);
  const currency = ref(locale.value === "zh-CN" ? "CNY" : "USD");
  const grouping = ref(true);
  const negativeStyle = ref<CellNumberFormatNegativeStyle>("minus");
  const region = ref<string>(locale.value);
  const selectedCode = ref("");
  const customCode = ref("");
  const customFormats = ref(readCustomNumberFormats());
  const mixed = computed(
    () => props.state.numberFormat.mixed && !Object.hasOwn(props.patch, "numberFormat"),
  );
  const presets = computed(() => {
    const options = getNumberFormatPresets(category.value, region.value, t);
    const format = currentFormat();
    if (
      format?.kind === category.value &&
      "code" in format &&
      !options.some(({ code }) => code === format.code)
    )
      options.push({ code: format.code, label: format.code });
    return options;
  });
  const builtInCustomCodes = computed(() => getCustomFormatPresets(region.value));
  const customPresets = computed(() =>
    [
      ...new Set([
        ...builtInCustomCodes.value,
        ...customFormats.value,
        ...(currentFormat() && "code" in currentFormat()!
          ? [(currentFormat() as { code: string }).code]
          : []),
      ]),
    ].map((code) => ({ code, label: code === "General" ? t("cellFormat.general") : code })),
  );
  const customValid = computed(
    () =>
      category.value !== "custom" || mixed.value || validateCellNumberFormatCode(customCode.value),
  );
  const showDecimals = computed(() =>
    ["number", "currency", "accounting", "percent", "scientific"].includes(category.value),
  );
  const showCurrency = computed(
    () => category.value === "currency" || category.value === "accounting",
  );
  const showNegative = computed(() => category.value === "number" || category.value === "currency");
  const showRegion = computed(
    () => category.value === "date" || category.value === "time" || category.value === "special",
  );
  const showTypes = computed(
    () =>
      category.value === "date" ||
      category.value === "time" ||
      category.value === "fraction" ||
      category.value === "special" ||
      category.value === "custom",
  );
  const description = computed(() =>
    t(
      mixed.value
        ? "cellFormat.mixedNumberDescription"
        : NUMBER_FORMAT_DESCRIPTION_KEYS[category.value],
    ),
  );

  function draftFormat(): CellNumberFormat | undefined {
    const digits = fractionDigits.value;
    const negative = negativeStyle.value === "minus" ? {} : { negativeStyle: negativeStyle.value };
    switch (category.value) {
      case "general":
        return undefined;
      case "number":
        return {
          kind: "number",
          fractionDigits: digits,
          ...(!grouping.value ? { useGrouping: false } : {}),
          ...negative,
        };
      case "percent":
        return { kind: "percent", fractionDigits: digits };
      case "currency":
        return { kind: "currency", currency: currency.value, fractionDigits: digits, ...negative };
      case "accounting":
        return { kind: "accounting", currency: currency.value, fractionDigits: digits };
      case "scientific":
        return { kind: "scientific", fractionDigits: digits };
      case "text":
        return { kind: "text" };
      case "custom":
        return { kind: "custom", code: customCode.value, locale: region.value };
      default:
        return { kind: category.value, code: selectedCode.value, locale: region.value };
    }
  }

  function apply(): void {
    if (!customValid.value) return;
    updatePatch({ numberFormat: draftFormat() ?? null });
  }

  function reset(): void {
    const format = currentFormat();
    category.value = format?.kind ?? "general";
    fractionDigits.value = format && "fractionDigits" in format ? (format.fractionDigits ?? 2) : 2;
    currency.value =
      format && "currency" in format ? format.currency : locale.value === "zh-CN" ? "CNY" : "USD";
    grouping.value = format && "useGrouping" in format ? format.useGrouping !== false : true;
    negativeStyle.value =
      format && "negativeStyle" in format ? (format.negativeStyle ?? "minus") : "minus";
    region.value = format && "locale" in format && format.locale ? format.locale : locale.value;
    selectedCode.value = format && "code" in format ? format.code : (presets.value[0]?.code ?? "");
    customCode.value = toCellNumberFormatCode(format, region.value);
  }

  function selectCategory(value: NumberFormatCategory): void {
    if (value === category.value && !mixed.value) return;
    const previous = customValid.value ? draftFormat() : currentFormat();
    category.value = value;
    if (value === "custom") customCode.value = toCellNumberFormatCode(previous, region.value);
    else selectedCode.value = presets.value[0]?.code ?? "";
    apply();
  }

  function selectCode(code: string): void {
    if (category.value === "custom") customCode.value = code;
    else selectedCode.value = code;
    apply();
  }

  function updateCustomCode(code: string | number): void {
    if (typeof code !== "string") return;
    customCode.value = code;
    apply();
  }

  function updateDigits(value: InputNumberValue): void {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    fractionDigits.value = Math.max(0, Math.min(20, Math.round(value)));
    apply();
  }

  function updateSelect(target: Ref<string>, value: SelectValue): void {
    if (typeof value !== "string") return;
    target.value = value;
    apply();
  }

  function updateRegion(value: SelectValue): void {
    if (typeof value !== "string") return;
    const index = getNumberFormatPresets(category.value, region.value, t).findIndex(
      ({ code }) => code === selectedCode.value,
    );
    region.value = value;
    const options = getNumberFormatPresets(category.value, region.value, t);
    selectedCode.value =
      options[Math.max(0, index)]?.code ?? options[0]?.code ?? selectedCode.value;
    apply();
  }

  const currencyOptions = computed(() =>
    [...new Set(["", "CNY", "USD", "EUR", "GBP", "JPY", currency.value])].map((value) => ({
      value,
      label: !value
        ? t("cellFormat.noCurrency")
        : ((
            {
              CNY: "CNY (¥)",
              USD: "USD ($)",
              EUR: "EUR (€)",
              GBP: "GBP (£)",
              JPY: "JPY (¥)",
            } as Record<string, string>
          )[value] ?? value),
    })),
  );
  const regionOptions = computed(() => [
    { value: "zh-CN", label: t("cellFormat.regionChineseChina") },
    { value: "en-US", label: t("cellFormat.regionEnglishUS") },
    ...(!["zh-CN", "en-US"].includes(region.value)
      ? [{ value: region.value, label: region.value }]
      : []),
  ]);
  const negativeOptions = computed(() =>
    (["minus", "red", "parentheses", "red-parentheses"] as const).map((value) => {
      const format = draftFormat();
      const formatted = formatCellNumberValue(
        -1234.567,
        format && (format.kind === "number" || format.kind === "currency")
          ? { ...format, negativeStyle: value }
          : undefined,
        { locale: locale.value },
      );
      return { value, label: formatted.text, color: formatted.color };
    }),
  );
  const preview = computed(() => {
    if (mixed.value) return { text: t("format.mixed") };
    if (!customValid.value) return { text: "—" };
    // The preview follows the selected cell; an empty cell remains empty, as in Format Cells.
    try {
      return formatCellNumberValue(props.sampleValue, draftFormat(), {
        locale: locale.value,
        dateSystem: props.dateSystem ?? "1900",
      });
    } catch {
      return { text: "####" };
    }
  });
  const canDeleteCustom = computed(
    () =>
      customFormats.value.includes(customCode.value) &&
      !builtInCustomCodes.value.includes(customCode.value),
  );
  function deleteCustom(): void {
    if (!canDeleteCustom.value) return;
    customFormats.value = removeCustomNumberFormat(customCode.value);
    customCode.value = "General";
    apply();
  }

  reset();
  watch(() => props.state, reset, { deep: true });
  watch(customValid, updateValidity, { immediate: true });
  return {
    category,
    fractionDigits,
    currency,
    grouping,
    negativeStyle,
    region,
    selectedCode,
    customCode,
    mixed,
    presets,
    customPresets,
    customValid,
    showDecimals,
    showCurrency,
    showNegative,
    showRegion,
    showTypes,
    description,
    currencyOptions,
    regionOptions,
    negativeOptions,
    preview,
    canDeleteCustom,
    selectCategory,
    selectCode,
    updateCustomCode,
    updateDigits,
    updateCurrency: (value: SelectValue) => updateSelect(currency, value),
    updateRegion,
    updateGrouping: (value: boolean) => {
      grouping.value = value;
      apply();
    },
    updateNegativeStyle: (value: CellNumberFormatNegativeStyle) => {
      negativeStyle.value = value;
      apply();
    },
    deleteCustom,
  };
}
