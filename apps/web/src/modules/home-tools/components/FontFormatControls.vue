<script setup lang="ts">
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed } from "vue";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";

const FONT_FAMILIES = [
  "Inter",
  "Arial",
  "Times New Roman",
  "Courier New",
  "Microsoft YaHei",
  "SimSun",
] as const;
const FONT_SIZE_PRESETS = [
  8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72,
] as const;
const fontFamilyPopupProps = {
  overlayStyle: { minWidth: "168px" },
  overlayInnerStyle: { minWidth: "168px" },
};
const fontSizePopupProps = {
  overlayStyle: { minWidth: "72px" },
  overlayInnerStyle: { minWidth: "72px" },
};

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const fontFamilyOptions = computed(() =>
  FONT_FAMILIES.map((family) => ({
    label: family === DEFAULT_CELL_FONT_FAMILY ? t("format.defaultFont") : family,
    value: family,
  })),
);
const fontFamilyValue = computed(() =>
  props.state.fontFamily.mixed
    ? undefined
    : (props.state.fontFamily.value ?? DEFAULT_CELL_FONT_FAMILY),
);
const fontSizeValue = computed(() =>
  props.state.fontSize.mixed ? undefined : (props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE),
);
const fontSizeOptions = computed(() => {
  const values = new Set<number>(FONT_SIZE_PRESETS);
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

function setFontFamily(value: SelectValue): void {
  if (typeof value !== "string" || !value) {
    return;
  }
  emit("applyStyle", { fontFamily: value === DEFAULT_CELL_FONT_FAMILY ? null : value });
}

function setFontSize(value: SelectValue): void {
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
    <label
      class="font-format-controls__field"
      data-font-format-segment="family"
      :title="t('format.fontFamily')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontFamily") }}</span>
      <TSelect
        class="font-format-controls__family"
        size="small"
        borderless
        :model-value="fontFamilyValue"
        :options="fontFamilyOptions"
        :popup-props="fontFamilyPopupProps"
        :placeholder="state.fontFamily.mixed ? t('format.mixed') : undefined"
        :disabled="disabled"
        @change="setFontFamily"
      />
    </label>
    <label
      class="font-format-controls__field"
      data-font-format-segment="size"
      :title="t('format.fontSize')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontSize") }}</span>
      <TSelect
        class="font-format-controls__size"
        size="small"
        borderless
        :model-value="fontSizeValue"
        :options="fontSizeOptions"
        :popup-props="fontSizePopupProps"
        :placeholder="state.fontSize.mixed ? t('format.mixed') : undefined"
        :disabled="disabled"
        @change="setFontSize"
      />
    </label>
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-grid;
  flex: 0 0 auto;
  grid-template-columns: var(--cell-format-primary-track, 126px) var(
      --cell-format-compact-track,
      40px
    );
  column-gap: var(--cell-format-column-gap, 4px);
  align-items: stretch;
  height: var(--cell-format-control-height, 26px);

  &__field {
    display: inline-flex;
    min-width: 0;
    height: var(--cell-format-control-height, 26px);
    overflow: hidden;
    border-radius: 2px;
  }

  &:not(.is-disabled) &__field:is(:hover, :focus-within) {
    background: var(--td-bg-color-container-hover);
  }

  &.is-disabled &__field {
    background: var(--td-bg-color-component-disabled);
  }

  &__family,
  &__size {
    width: 100%;
  }

  :deep(.t-input) {
    height: var(--cell-format-control-height, 26px);
    padding-right: 6px;
    padding-left: 6px;
    background: transparent;
    border: 0;
    border-radius: 2px;
    box-shadow: none;
  }

  :deep(.t-input:hover),
  :deep(.t-input.t-is-focused),
  :deep(.t-input.t-is-disabled) {
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  :deep(.t-input__suffix) {
    margin-left: 3px;
  }

  :deep(.t-fake-arrow) {
    width: 12px;
    height: 12px;
  }

  &__size :deep(.t-input) {
    padding-right: 3px;
    padding-left: 4px;
  }

  &__size :deep(.t-input__suffix) {
    margin-left: 1px;
  }

  &__size :deep(.t-fake-arrow) {
    width: 10px;
    height: 10px;
  }
}
</style>
