import { computed, ref, watch } from "vue";
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
  getNumberFormatPresets,
  NUMBER_FORMAT_DESCRIPTION_KEYS,
  type NumberFormatCategory,
} from "./catalog";
import { readCustomNumberFormats, removeCustomNumberFormat } from "./custom-formats";
import { getCustomFormatPresets } from "./custom-presets";
import { getDateFormatRegionOptions } from "./region-options";
import {
  getCurrencyChoiceValue,
  getCurrencySymbolDisplay,
  getCurrencySymbolOptions,
  type CurrencySymbolChoice,
} from "./currency-options";

type PanelProps = Readonly<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
  dateSystem?: "1900" | "1904";
}>;

const DATE_PRESET_FALLBACKS: Readonly<Record<string, string>> = {
  "date-native-full": "date-long",
  "date-native-year-month": "date-year-month",
  "date-native-month-day": "date-month-day",
  "date-legacy-day-short-month-two-digit-year": "date-medium",
  "date-legacy-day-short-month": "date-month-day-short",
  "date-legacy-short-month-two-digit-year": "date-year-month-short",
};

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
  const currencyChoice = ref<CurrencySymbolChoice>({
    currency: locale.value === "zh-CN" ? "CNY" : "USD",
  });
  const currency = computed(() => getCurrencyChoiceValue(currencyChoice.value));
  const currencyDisplay = computed(() =>
    getCurrencySymbolDisplay(currencyChoice.value, t("cellFormat.noCurrency")),
  );
  const grouping = ref(true);
  const negativeStyle = ref<CellNumberFormatNegativeStyle>("minus");
  const region = ref<string>(locale.value);
  const selectedCode = ref("");
  const selectedPresetId = ref<string>();
  const customCode = ref("");
  const customFormats = ref(readCustomNumberFormats());
  const mixed = computed(
    () => props.state.numberFormat.mixed && !Object.hasOwn(props.patch, "numberFormat"),
  );
  const presets = computed(() => {
    const options = getNumberFormatPresets(category.value, region.value, t);
    const format = currentFormat();
    if (format?.kind === category.value && "code" in format) {
      const compact = format.kind === "special" && format.chineseUpperStyle === "compact";
      const currentValue = compact ? "chinese-upper-2" : format.code;
      if (!options.some(({ value, code }) => (value ?? code) === currentValue))
        options.push({
          code: format.code,
          value: currentValue,
          label: compact ? t("cellFormat.chineseUpper2") : format.code,
          ...(compact ? { format } : {}),
        });
    }
    return options;
  });
  const builtInCustomCodes = computed(() =>
    getCustomFormatPresets(
      region.value,
      (["time", "fraction", "special"] as const).flatMap((category) =>
        getNumberFormatPresets(category, region.value, t).map(({ code }) => code),
      ),
    ),
  );
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
        return { kind: "currency", ...currencyChoice.value, fractionDigits: digits, ...negative };
      case "accounting":
        return { kind: "accounting", ...currencyChoice.value, fractionDigits: digits };
      case "scientific":
        return { kind: "scientific", fractionDigits: digits };
      case "text":
        return { kind: "text" };
      case "custom":
        return { kind: "custom", code: customCode.value, locale: region.value };
      case "special": {
        const preset = presets.value.find(
          ({ value, code }) => (value ?? code) === selectedCode.value,
        );
        return (
          preset?.format ?? {
            kind: "special",
            code: preset?.code ?? selectedCode.value,
            locale: region.value,
          }
        );
      }
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
    currencyChoice.value =
      format && "currency" in format
        ? {
            currency: format.currency,
            ...(format.currencySymbol === undefined
              ? {}
              : { currencySymbol: format.currencySymbol }),
            ...(format.locale ? { locale: format.locale } : {}),
          }
        : { currency: locale.value === "zh-CN" ? "CNY" : "USD" };
    grouping.value = format && "useGrouping" in format ? format.useGrouping !== false : true;
    negativeStyle.value =
      format && "negativeStyle" in format ? (format.negativeStyle ?? "minus") : "minus";
    region.value = format && "locale" in format && format.locale ? format.locale : locale.value;
    selectedCode.value =
      format?.kind === "special" && format.chineseUpperStyle === "compact"
        ? "chinese-upper-2"
        : format && "code" in format
          ? format.code
          : (presets.value[0]?.value ?? presets.value[0]?.code ?? "");
    selectedPresetId.value = presets.value.find(
      ({ value, code }) => (value ?? code) === selectedCode.value,
    )?.id;
    customCode.value = toCellNumberFormatCode(format, region.value);
  }

  function selectCategory(value: NumberFormatCategory): void {
    if (value === category.value && !mixed.value) return;
    const previous = customValid.value ? draftFormat() : currentFormat();
    category.value = value;
    if (value === "custom") customCode.value = toCellNumberFormatCode(previous, region.value);
    else {
      selectedCode.value = presets.value[0]?.value ?? presets.value[0]?.code ?? "";
      selectedPresetId.value = presets.value[0]?.id;
    }
    apply();
  }

  function selectCode(code: string): void {
    if (category.value === "custom") customCode.value = code;
    else {
      selectedCode.value = code;
      selectedPresetId.value = presets.value.find(
        (preset) => (preset.value ?? preset.code) === code,
      )?.id;
    }
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

  function updateCurrency(value: SelectValue): void {
    if (typeof value !== "string") return;
    const option = currencyOptions.value.find((option) => option.value === value);
    if (!option) return;
    currencyChoice.value = option.choice;
    apply();
  }

  function updateRegion(value: SelectValue): void {
    if (
      typeof value !== "string" ||
      !regionOptions.value.some(({ value: region }) => region === value)
    )
      return;
    const previousOptions = getNumberFormatPresets(category.value, region.value, t);
    const index = previousOptions.findIndex(
      ({ value, code }) => (value ?? code) === selectedCode.value,
    );
    const preferredId = selectedPresetId.value ?? previousOptions[index]?.id;
    region.value = value;
    const options = getNumberFormatPresets(category.value, region.value, t);
    const findPreset = (value: string | undefined) =>
      value
        ? options.find(({ id, aliasIds }) => id === value || aliasIds?.includes(value))
        : undefined;
    const equivalent =
      findPreset(preferredId) ??
      findPreset(preferredId ? DATE_PRESET_FALLBACKS[preferredId] : undefined);
    const replacement =
      equivalent ??
      (category.value === "date" ? options[0] : (options[Math.max(0, index)] ?? options[0]));
    selectedCode.value = replacement?.value ?? replacement?.code ?? selectedCode.value;
    // Keep the requested family when two regions share a merged preset row,
    // so switching back restores a padded/abbreviated choice faithfully.
    selectedPresetId.value = equivalent ? preferredId : replacement?.id;
    apply();
  }

  const currencyOptions = computed(() =>
    getCurrencySymbolOptions(locale.value, t("cellFormat.noCurrency"), currencyChoice.value),
  );
  const regionOptions = computed(() =>
    category.value === "date" || category.value === "time"
      ? getDateFormatRegionOptions(locale.value, region.value)
      : [
          { value: "zh-CN", label: t("cellFormat.regionChineseChina") },
          { value: "en-US", label: t("cellFormat.regionEnglishUS") },
          ...(!["zh-CN", "en-US"].includes(region.value)
            ? [{ value: region.value, label: region.value }]
            : []),
        ],
  );
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
  const previewValue = computed(() => {
    if (props.sampleValue !== null && props.sampleValue !== "") return props.sampleValue;
    // Empty cells use examples only in the preview; the document value is untouched.
    switch (category.value) {
      case "date":
        return 40982 - (props.dateSystem === "1904" ? 1462 : 0); // 2012-03-14
      case "time":
        return (13 * 3600 + 30 * 60 + 55) / 86400;
      case "percent":
        return 0.1234;
      case "fraction":
        return 12.5;
      case "text":
        return "00123";
      default:
        return 1234.567;
    }
  });
  const preview = computed(() => {
    if (mixed.value) return { text: t("format.mixed") };
    if (!customValid.value) return { text: "—" };
    try {
      return formatCellNumberValue(previewValue.value, draftFormat(), {
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
    currencyDisplay,
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
    updateCurrency,
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
