<script setup lang="ts">
import { computed } from "vue";
import FontFormatField from "./FontFormatField.vue";
import { resolveThemeFontFamily } from "@idea10/core/workbook-theme";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import {
  CELL_FONT_FAMILY_PRESETS,
  CELL_FONT_SIZE_PRESETS,
} from "../../../shared/cell-text/font-catalog";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  /**
   * Lets an embedded toolbar keep its font menu in the same dismissal
   * boundary. Omitted in the ribbon, so its current body attachment remains.
   */
  popupAttach?: () => HTMLElement;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const workbookTheme = useWorkbookTheme();
const fontFamilyOptions = computed(() => [
  ...(workbookTheme?.value
    ? [
        {
          label: `${t("pageTools.themeHeadingFont")} (${workbookTheme.value.fonts?.headingEastAsia ?? workbookTheme.value.headingFont})`,
          value: "theme:major",
        },
        {
          label: `${t("pageTools.themeBodyFont")} (${workbookTheme.value.fonts?.bodyEastAsia ?? workbookTheme.value.bodyFont})`,
          value: "theme:minor",
        },
      ]
    : []),
  ...[
    ...new Set([
      ...CELL_FONT_FAMILY_PRESETS,
      ...(props.state.fontFamily.value ? [props.state.fontFamily.value] : []),
    ]),
  ].map((family) => ({
    label: family === DEFAULT_CELL_FONT_FAMILY ? t("format.defaultFont") : family,
    value: family,
  })),
]);
const fontFamilyValue = computed(() => {
  if (props.state.fontFamily.mixed) return undefined;
  const family = props.state.fontFamily.value;
  if (workbookTheme?.value) {
    if (family === resolveThemeFontFamily(workbookTheme.value, "major")) return "theme:major";
    if (!family || family === resolveThemeFontFamily(workbookTheme.value, "minor"))
      return "theme:minor";
  }
  return family ?? DEFAULT_CELL_FONT_FAMILY;
});
const fontSizeValue = computed(() =>
  props.state.fontSize.mixed ? undefined : (props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE),
);
const fontSizeOptions = computed(() => {
  const values = new Set<number>(CELL_FONT_SIZE_PRESETS);
  if (props.state.fontSize.value !== undefined) {
    values.add(props.state.fontSize.value);
  }
  return [...values]
    .sort((left, right) => left - right)
    .map((value) => ({
      label: String(value),
      value,
    }));
});
function setFontFamily(value: string | number): void {
  if (props.disabled || typeof value !== "string" || !value.trim()) {
    return;
  }
  const input = value.trim();
  const option = fontFamilyOptions.value.find(
    (option) => option.label.toLowerCase() === input.toLowerCase(),
  );
  value = option?.value ?? input;
  if ((value === "theme:major" || value === "theme:minor") && workbookTheme?.value) {
    const role = value === "theme:major" ? "major" : "minor";
    emit("applyStyle", {
      fontFamily: resolveThemeFontFamily(workbookTheme.value, role),
      fontTheme: role,
    });
    return;
  }
  emit("applyStyle", {
    fontFamily: value === DEFAULT_CELL_FONT_FAMILY ? null : value,
  });
}

function setFontSize(value: string | number): void {
  if (props.disabled) return;
  if (typeof value === "string" && value.trim()) value = Number(value);
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_CELL_FONT_SIZE ||
    value > MAX_CELL_FONT_SIZE
  ) {
    return;
  }
  const currentValue = props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE;
  if (!props.state.fontSize.mixed && value === currentValue) {
    return;
  }
  emit("applyStyle", {
    fontSize: value === DEFAULT_CELL_FONT_SIZE ? null : value,
  });
}
</script>

<template>
  <div
    class="font-format-controls"
    :class="{ 'is-disabled': disabled }"
    role="group"
    data-font-format-control
    :aria-label="t('format.font')"
    :aria-disabled="disabled"
  >
    <div
      class="font-format-controls__field font-format-controls__field--family"
      data-font-format-segment="family"
      :title="t('format.fontFamily')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontFamily") }}</span>
      <FontFormatField
        class="font-format-controls__family"
        :model-value="fontFamilyValue"
        :options="fontFamilyOptions"
        :label="t('format.fontFamily')"
        :popup-attach="popupAttach"
        :disabled="disabled"
        @change="setFontFamily"
      />
    </div>
    <div
      class="font-format-controls__field font-format-controls__field--size"
      data-font-format-segment="size"
      :title="t('format.fontSize')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontSize") }}</span>
      <FontFormatField
        class="font-format-controls__size"
        :model-value="fontSizeValue"
        :options="fontSizeOptions"
        :label="t('format.fontSize')"
        :popup-attach="popupAttach"
        :disabled="disabled"
        @change="setFontSize"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--cell-format-gap, 4px);
  align-items: stretch;
  height: var(--ribbon-control-height, 26px);

  &__field {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
    height: var(--ribbon-control-height, 26px);
    align-items: center;

    &--family {
      width: var(--cell-format-font-width, 126px);
    }

    &--size {
      width: var(--cell-format-font-size-width, 64px);
    }
  }

  &__family,
  &__size {
    width: 100%;
  }
}
</style>
