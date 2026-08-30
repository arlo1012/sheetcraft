<script setup lang="ts">
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed } from "vue";
import {
  DEFAULT_CELL_FONT_SIZE,
  MAX_CELL_FONT_SIZE,
  MIN_CELL_FONT_SIZE,
  type CellStylePatch,
} from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";

const DEFAULT_FONT_FAMILY = "Inter";
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
    label: family === DEFAULT_FONT_FAMILY ? t("format.defaultFont") : family,
    value: family,
  })),
);
const fontFamilyValue = computed(() =>
  props.state.fontFamily.mixed ? undefined : (props.state.fontFamily.value ?? DEFAULT_FONT_FAMILY),
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
  emit("applyStyle", { fontFamily: value === DEFAULT_FONT_FAMILY ? null : value });
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
  <div class="font-format-controls" role="group" :aria-label="t('format.font')">
    <label class="font-format-controls__field" :title="t('format.fontFamily')">
      <span class="ui-visually-hidden">{{ t("format.fontFamily") }}</span>
      <TSelect
        class="font-format-controls__family"
        size="small"
        :model-value="fontFamilyValue"
        :options="fontFamilyOptions"
        :placeholder="state.fontFamily.mixed ? t('format.mixed') : undefined"
        :disabled="disabled"
        @change="setFontFamily"
      />
    </label>
    <label class="font-format-controls__field" :title="t('format.fontSize')">
      <span class="ui-visually-hidden">{{ t("format.fontSize") }}</span>
      <TSelect
        class="font-format-controls__size"
        size="small"
        :model-value="fontSizeValue"
        :options="fontSizeOptions"
        :placeholder="state.fontSize.mixed ? t('format.mixed') : undefined"
        :disabled="disabled"
        @change="setFontSize"
      />
    </label>
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;

  &__field {
    display: inline-flex;
    min-width: 0;
  }

  &__family {
    width: 96px;
  }

  &__size {
    width: 44px;
  }

  :deep(.t-input) {
    padding-right: 6px;
    padding-left: 6px;
  }

  :deep(.t-input__suffix) {
    margin-left: 3px;
  }

  :deep(.t-fake-arrow) {
    width: 12px;
    height: 12px;
  }
}
</style>
