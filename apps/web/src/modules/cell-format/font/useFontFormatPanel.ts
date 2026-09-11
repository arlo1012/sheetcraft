import { computed, ref, watch } from "vue";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellFontScript,
  type CellStyle,
  type CellStylePatch,
  type CellUnderlineStyle,
} from "@idea10/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@idea10/core/style-state";
import {
  CELL_FONT_FAMILY_PRESETS,
  CELL_FONT_SIZE_PRESETS,
} from "../../../shared/cell-text/font-catalog";
import { useAppI18n } from "../../../shared/i18n";

type Props = Readonly<{ state: SelectionCellStyleState; patch: CellStylePatch }>;
type FontStyleChoice = "regular" | "italic" | "bold" | "boldItalic";

export function useFontFormatPanel(props: Props, update: (patch: CellStylePatch) => void) {
  const { t } = useAppI18n();
  function hasPatch(key: keyof CellStyle): boolean {
    return Object.hasOwn(props.patch, key);
  }
  function read<Key extends keyof CellStyle>(key: Key, fallback: CellStyle[Key]): CellStyle[Key] {
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
      : (read("fontFamily", props.state.fontFamily.value) ?? DEFAULT_CELL_FONT_FAMILY),
  );
  const size = computed(() =>
    sizeMixed.value
      ? undefined
      : (read("fontSize", props.state.fontSize.value) ?? DEFAULT_CELL_FONT_SIZE),
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
  const familyOptions = computed(() =>
    [
      ...new Set<string>([...CELL_FONT_FAMILY_PRESETS, ...(family.value ? [family.value] : [])]),
    ].map((code) => ({ code, label: code })),
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
  const styleOptions = computed(
    () =>
      [
        { code: "regular", label: t("cellFormat.fontRegular") },
        { code: "italic", label: t("format.italic") },
        { code: "bold", label: t("format.bold") },
        { code: "boldItalic", label: t("cellFormat.fontBoldItalic") },
      ] as const,
  );
  const underlineOptions = computed(() => [
    { value: "none", label: t("cellFormat.underlineNone") },
    { value: "single", label: t("cellFormat.underlineSingle") },
    { value: "double", label: t("cellFormat.underlineDouble") },
    { value: "singleAccounting", label: t("cellFormat.underlineSingleAccounting") },
    { value: "doubleAccounting", label: t("cellFormat.underlineDoubleAccounting") },
  ]);
  const sizeInput = ref("");
  const familyInput = ref("");
  watch(family, (value) => (familyInput.value = value ?? ""), { immediate: true });
  watch(size, (value) => (sizeInput.value = value === undefined ? "" : String(value)), {
    immediate: true,
  });
  function setFamily(value: string | number): void {
    const name = String(value).trim();
    if (!name || name.length > 80) return;
    familyInput.value = name;
    if (familyMixed.value || name !== family.value)
      update({ fontFamily: name === DEFAULT_CELL_FONT_FAMILY ? null : name });
  }
  function updateFamilyInput(value: string | number): void {
    familyInput.value = String(value);
  }
  function commitFamilyInput(): void {
    const name = familyInput.value.trim();
    if (!name || name.length > 80) {
      familyInput.value = family.value ?? "";
      return;
    }
    setFamily(name);
  }
  function setSize(value: string): void {
    const parsed = Number(value);
    if (
      !value.trim() ||
      !Number.isInteger(parsed) ||
      parsed < MIN_CELL_FONT_SIZE ||
      parsed > MAX_CELL_FONT_SIZE
    )
      return;
    if (sizeMixed.value || parsed !== size.value)
      update({ fontSize: parsed === DEFAULT_CELL_FONT_SIZE ? null : parsed });
  }
  function updateSizeInput(value: string | number): void {
    sizeInput.value = String(value);
    setSize(sizeInput.value);
  }
  function commitSizeInput(): void {
    const parsed = Number(sizeInput.value);
    if (!sizeInput.value.trim() || !Number.isFinite(parsed)) {
      sizeInput.value = size.value === undefined ? "" : String(size.value);
      return;
    }
    const normalized = Math.min(
      MAX_CELL_FONT_SIZE,
      Math.max(MIN_CELL_FONT_SIZE, Math.round(parsed)),
    );
    sizeInput.value = String(normalized);
    setSize(sizeInput.value);
  }
  function setFontStyle(value: FontStyleChoice): void {
    update({
      bold: value === "bold" || value === "boldItalic" ? true : null,
      italic: value === "italic" || value === "boldItalic" ? true : null,
    });
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
  function setColor(value: string | null): void {
    update({ textColor: value });
  }
  const previewStyle = computed<CellStyle>(() => ({
    fontFamily: family.value ?? DEFAULT_CELL_FONT_FAMILY,
    fontSize: size.value ?? DEFAULT_CELL_FONT_SIZE,
    textColor: color.value ?? "#20242c",
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
    family,
    familyInput,
    familyMixed,
    familyOptions,
    size,
    sizeInput,
    sizeMixed,
    sizeOptions,
    fontStyle,
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
    setUnderline,
    setStrikethrough,
    setScript,
    setColor,
  };
}
