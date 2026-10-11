import { computed, ref, watch } from "vue";
import type { ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellFontScript,
  type CellStyle,
  type CellStylePatch,
  type CellUnderlineStyle,
} from "@sheetcraft/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@sheetcraft/core/style-state";
import {
  CELL_FONT_SIZE_PRESETS,
  getFontFamilyLabel,
  resolveFontFamilyName,
} from "../cell-text/font-catalog";
import { useFontCatalog } from "../cell-text/useFontCatalog";
import { useAppI18n } from "../i18n";
import { findOptionMatch } from "../option-list/option-list";

type FontFormatKey =
  | "fontFamily"
  | "fontSize"
  | "bold"
  | "italic"
  | "underline"
  | "textColor"
  | "strikethrough"
  | "fontScript";
export type FontFormatPatch = Pick<CellStylePatch, FontFormatKey | "textColorTheme" | "fontTheme">;
export type FontFormatState = Pick<
  SelectionCellStyleState,
  Exclude<FontFormatKey, "underline"> | "underlineStyle"
>;
export type FontUnderlineChoice =
  | "none"
  | "single"
  | "double"
  | "singleAccounting"
  | "doubleAccounting";
export type FontFormatOptions = {
  defaultFontFamily?: string;
  defaultFontSize?: number;
  defaultColor?: string;
  minFontSize?: number;
  maxFontSize?: number;
  sizeUnit?: "px" | "pt";
  underlineStyles?: readonly FontUnderlineChoice[];
};
type Props = Readonly<{
  state: FontFormatState;
  patch: FontFormatPatch;
  options?: FontFormatOptions;
}>;
type FontStyleChoice = "regular" | "italic" | "bold" | "boldItalic";

export function useFontFormatPanel(props: Props, update: (patch: FontFormatPatch) => void) {
  const { t, locale } = useAppI18n();
  const defaultFamily = computed(
    () => props.options?.defaultFontFamily ?? DEFAULT_CELL_FONT_FAMILY,
  );
  const defaultSize = computed(() => props.options?.defaultFontSize ?? DEFAULT_CELL_FONT_SIZE);
  const defaultColor = computed(() => props.options?.defaultColor ?? "#20242c");
  const minSize = computed(() => props.options?.minFontSize ?? MIN_CELL_FONT_SIZE);
  const maxSize = computed(() => props.options?.maxFontSize ?? MAX_CELL_FONT_SIZE);
  function hasPatch(key: keyof FontFormatPatch): boolean {
    return Object.hasOwn(props.patch, key);
  }
  function read<Key extends keyof FontFormatPatch>(
    key: Key,
    fallback: CellStyle[Key],
  ): CellStyle[Key] {
    if (!hasPatch(key)) return fallback;
    const value = props.patch[key];
    return value === null || value === false ? undefined : (value as CellStyle[Key]);
  }
  function toggleState(key: "bold" | "italic" | "strikethrough"): ToggleStyleState {
    return hasPatch(key) ? (props.patch[key] === true ? "on" : "off") : props.state[key];
  }
  const familyMixed = computed(() => !hasPatch("fontFamily") && props.state.fontFamily.mixed);
  const sizeMixed = computed(() => !hasPatch("fontSize") && props.state.fontSize.mixed);
  const colorMixed = computed(() => !hasPatch("textColor") && props.state.textColor.mixed);
  const scriptMixed = computed(() => !hasPatch("fontScript") && props.state.fontScript.mixed);
  const family = computed(() =>
    familyMixed.value
      ? undefined
      : (read("fontFamily", props.state.fontFamily.value) ?? defaultFamily.value),
  );
  const size = computed(() =>
    sizeMixed.value
      ? undefined
      : (read("fontSize", props.state.fontSize.value) ?? defaultSize.value),
  );
  const color = computed(() =>
    colorMixed.value ? undefined : read("textColor", props.state.textColor.value),
  );
  const script = computed(() =>
    scriptMixed.value ? undefined : read("fontScript", props.state.fontScript.value),
  );
  const strikethrough = computed(() => toggleState("strikethrough"));
  const fontStyle = computed<FontStyleChoice | undefined>(() => {
    const bold = toggleState("bold");
    const italic = toggleState("italic");
    if (bold === "mixed" || italic === "mixed") return undefined;
    return bold === "on"
      ? italic === "on"
        ? "boldItalic"
        : "bold"
      : italic === "on"
        ? "italic"
        : "regular";
  });
  const underline = computed(() => {
    if (!hasPatch("underline") && props.state.underlineStyle.mixed) return undefined;
    const value = read("underline", props.state.underlineStyle.value);
    return value === true ? "single" : (value ?? "none");
  });
  const { fontOptions } = useFontCatalog(() => (family.value ? [family.value] : []));
  const familyOptions = computed(() =>
    fontOptions.value.map(({ value, label, aliases }) => ({ code: value, label, aliases })),
  );
  const sizeOptions = computed(() =>
    [
      ...new Set<number>([
        ...CELL_FONT_SIZE_PRESETS,
        ...(size.value === undefined ? [] : [size.value]),
      ]),
    ]
      .sort((left, right) => left - right)
      .map((size) => ({ code: String(size), label: String(size) })),
  );
  const styleOptions = computed<Array<{ code: FontStyleChoice; label: string }>>(() => [
    { code: "regular", label: t("cellFormat.fontRegular") },
    { code: "italic", label: t("format.italic") },
    { code: "bold", label: t("format.bold") },
    { code: "boldItalic", label: t("cellFormat.fontBoldItalic") },
  ]);
  const underlineOptions = computed(() => {
    const options: Array<{ value: FontUnderlineChoice; label: string }> = [
      { value: "none", label: t("cellFormat.underlineNone") },
      { value: "single", label: t("cellFormat.underlineSingle") },
      { value: "double", label: t("cellFormat.underlineDouble") },
      { value: "singleAccounting", label: t("cellFormat.underlineSingleAccounting") },
      { value: "doubleAccounting", label: t("cellFormat.underlineDoubleAccounting") },
    ];
    return options.filter(
      ({ value }) =>
        !props.options?.underlineStyles || props.options.underlineStyles.includes(value),
    );
  });
  const sizeInput = ref("");
  const familyInput = ref("");
  const fontStyleInput = ref("");
  const styleLabel = computed(
    () => styleOptions.value.find((option) => option.code === fontStyle.value)?.label ?? "",
  );
  watch(styleLabel, (value) => (fontStyleInput.value = value), { immediate: true });
  function familyLabel(value: string): string {
    return (
      fontOptions.value.find((option) => option.value === value)?.label ??
      getFontFamilyLabel(value, locale.value)
    );
  }
  watch([family, locale], ([value]) => (familyInput.value = value ? familyLabel(value) : ""), {
    immediate: true,
  });
  watch(
    () => (family.value ? familyLabel(family.value) : ""),
    (label, previous) => {
      if (familyInput.value === previous) familyInput.value = label;
    },
  );
  watch(size, (value) => (sizeInput.value = value === undefined ? "" : String(value)), {
    immediate: true,
  });
  function setFamily(value: string | number): void {
    const name = String(value).trim();
    if (!name || name.length > 80) return;
    familyInput.value = familyLabel(name);
    if (familyMixed.value || name !== family.value)
      update({ fontFamily: name === defaultFamily.value ? null : name });
  }
  function updateFamilyInput(value: string | number): void {
    familyInput.value = String(value);
  }
  function commitFamilyInput(): void {
    const name = familyInput.value.trim();
    if (!name || name.length > 80) {
      familyInput.value = family.value ? familyLabel(family.value) : "";
      return;
    }
    const resolved = resolveFontFamilyName(name);
    const exact = familyOptions.value.find(
      (option) => resolveFontFamilyName(option.code).toLowerCase() === resolved.toLowerCase(),
    );
    const exactLabel = familyOptions.value.find(
      (option) => option.label.toLowerCase() === name.toLowerCase(),
    );
    // A full custom name must not be replaced by a longer preset sharing its prefix.
    const partial = /\s/.test(name) ? undefined : findOptionMatch(familyOptions.value, name);
    setFamily(exact?.code ?? exactLabel?.code ?? partial?.code ?? resolved);
  }
  function setSize(value: string): void {
    const parsed = Number(value);
    if (
      !value.trim() ||
      !Number.isInteger(parsed) ||
      parsed < minSize.value ||
      parsed > maxSize.value
    )
      return;
    if (sizeMixed.value || parsed !== size.value)
      update({ fontSize: parsed === defaultSize.value ? null : parsed });
  }
  function updateSizeInput(value: string | number): void {
    sizeInput.value = String(value);
    setSize(sizeInput.value);
  }
  function commitSizeInput(): void {
    const typedSize = Number(sizeInput.value);
    if (
      sizeInput.value.trim() &&
      Number.isInteger(typedSize) &&
      typedSize >= minSize.value &&
      typedSize <= maxSize.value
    ) {
      sizeInput.value = String(typedSize);
      setSize(sizeInput.value);
      return;
    }
    const match = findOptionMatch(sizeOptions.value, sizeInput.value);
    if (match) {
      sizeInput.value = match.code;
      setSize(match.code);
      return;
    }
    const parsed = Number(sizeInput.value);
    if (!sizeInput.value.trim() || !Number.isInteger(parsed) || parsed <= 0) {
      sizeInput.value = size.value === undefined ? "" : String(size.value);
      return;
    }
    const normalized = Math.min(maxSize.value, Math.max(minSize.value, parsed));
    sizeInput.value = String(normalized);
    setSize(sizeInput.value);
  }
  function setFontStyle(value: FontStyleChoice): void {
    fontStyleInput.value = styleOptions.value.find((option) => option.code === value)?.label ?? "";
    update({
      bold: value === "bold" || value === "boldItalic" ? true : null,
      italic: value === "italic" || value === "boldItalic" ? true : null,
    });
  }
  function updateFontStyleInput(value: string | number): void {
    fontStyleInput.value = String(value);
  }
  function commitFontStyleInput(): void {
    if (fontStyleInput.value === styleLabel.value) return;
    const option = findOptionMatch(styleOptions.value, fontStyleInput.value);
    if (option) setFontStyle(option.code);
    else fontStyleInput.value = styleLabel.value;
  }
  function setUnderline(value: unknown): void {
    if (value === "none") update({ underline: null });
    else if (value === "single") update({ underline: true });
    else if (value === "double" || value === "singleAccounting" || value === "doubleAccounting")
      update({ underline: value as CellUnderlineStyle });
  }
  function setStrikethrough(checked: boolean): void {
    update({ strikethrough: checked ? true : null });
  }
  function setScript(value: CellFontScript, checked: boolean): void {
    update({ fontScript: checked ? value : null });
  }
  function setColor(value: string | null, reference?: ThemeColorReference): void {
    update({
      textColor: value,
      ...(reference
        ? { textColorTheme: reference }
        : props.patch.textColorTheme
          ? { textColorTheme: null }
          : {}),
    });
  }
  const previewStyle = computed<CellStyle>(() => ({
    fontFamily: family.value ?? defaultFamily.value,
    fontSize: size.value ?? defaultSize.value,
    textColor: color.value ?? defaultColor.value,
    bold: toggleState("bold") === "on" ? true : undefined,
    italic: toggleState("italic") === "on" ? true : undefined,
    underline:
      underline.value === "single"
        ? true
        : underline.value === "none"
          ? undefined
          : underline.value,
    strikethrough: strikethrough.value === "on" ? true : undefined,
    fontScript: script.value,
  }));
  return {
    defaultColor,
    family,
    familyInput,
    familyMixed,
    familyOptions,
    size,
    sizeInput,
    sizeMixed,
    sizeOptions,
    fontStyle,
    fontStyleInput,
    styleOptions,
    underline,
    underlineOptions,
    color,
    colorMixed,
    script,
    scriptMixed,
    strikethrough,
    previewStyle,
    setFamily,
    updateFamilyInput,
    commitFamilyInput,
    setSize,
    updateSizeInput,
    commitSizeInput,
    setFontStyle,
    updateFontStyleInput,
    commitFontStyleInput,
    setUnderline,
    setStrikethrough,
    setScript,
    setColor,
  };
}
