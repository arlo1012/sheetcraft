<script setup lang="ts">
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed, ref } from "vue";
import {
  DEFAULT_CELL_FONT_FAMILY,
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonDropdownArrow from "./RibbonDropdownArrow.vue";
import {
  CELL_FONT_FAMILY_PRESETS,
  CELL_FONT_SIZE_PRESETS,
} from "../../../shared/cell-text/font-catalog";

const fontFamilyPopupProps = {
  overlayStyle: { minWidth: "168px" },
  overlayInnerStyle: { minWidth: "168px" },
};
const fontSizePopupProps = {
  overlayStyle: { minWidth: "64px" },
  overlayInnerStyle: { minWidth: "64px" },
};

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const fontFamilyPopupVisible = ref(false);
const fontSizePopupVisible = ref(false);
const fontFamilyOptions = computed(() =>
  CELL_FONT_FAMILY_PRESETS.map((family) => ({
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
      class="font-format-controls__field font-format-controls__field--family"
      data-font-format-segment="family"
      :title="t('format.fontFamily')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontFamily") }}</span>
      <TSelect
        class="font-format-controls__family idea-ribbon-select"
        borderless
        :model-value="fontFamilyValue"
        :options="fontFamilyOptions"
        :popup-props="fontFamilyPopupProps"
        :placeholder="state.fontFamily.mixed ? '' : undefined"
        :disabled="disabled"
        @change="setFontFamily"
        @popup-visible-change="fontFamilyPopupVisible = $event"
      >
        <template #suffixIcon>
          <RibbonDropdownArrow :expanded="fontFamilyPopupVisible" />
        </template>
      </TSelect>
    </label>
    <label
      class="font-format-controls__field font-format-controls__field--size"
      data-font-format-segment="size"
      :title="t('format.fontSize')"
    >
      <span class="ui-visually-hidden">{{ t("format.fontSize") }}</span>
      <TSelect
        class="font-format-controls__size idea-ribbon-select idea-ribbon-select--compact"
        borderless
        :model-value="fontSizeValue"
        :options="fontSizeOptions"
        :input-props="{ align: 'center' }"
        :popup-props="fontSizePopupProps"
        :placeholder="state.fontSize.mixed ? '' : undefined"
        :disabled="disabled"
        @change="setFontSize"
        @popup-visible-change="fontSizePopupVisible = $event"
      >
        <template #suffixIcon><RibbonDropdownArrow :expanded="fontSizePopupVisible" /></template>
      </TSelect>
    </label>
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--cell-format-gap, 4px);
  align-items: stretch;
  height: var(--cell-format-control-height, 26px);

  &__field {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
    height: var(--cell-format-control-height, 26px);
    overflow: hidden;
    border-radius: 2px;

    &--family {
      width: var(--cell-format-font-width, 126px);
    }

    &--size {
      width: var(--ribbon-compact-action-width, 40px);
    }
  }

  &:not(.is-disabled) &__field:is(:hover, :focus-within) {
    background: var(--idea-surface-hover);
  }

  &.is-disabled &__field {
    background: var(--idea-surface-disabled);
  }

  &__family,
  &__size {
    width: 100%;
  }
}
</style>
