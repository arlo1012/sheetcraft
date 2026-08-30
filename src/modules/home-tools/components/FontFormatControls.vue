<script setup lang="ts">
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { computed, ref, watch } from "vue";
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
const fontSizeValue = computed<InputNumberValue>(() =>
  props.state.fontSize.mixed ? "" : String(props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE),
);
const fontSizeDraft = ref<InputNumberValue>(fontSizeValue.value);

function setFontFamily(value: SelectValue): void {
  if (typeof value !== "string" || !value) {
    return;
  }
  emit("applyStyle", { fontFamily: value === DEFAULT_FONT_FAMILY ? null : value });
}

function updateFontSizeDraft(value: InputNumberValue): void {
  fontSizeDraft.value = value;
}

function commitFontSize(value: InputNumberValue): void {
  const numericValue = Number(value);
  if (
    !Number.isInteger(numericValue) ||
    numericValue < MIN_CELL_FONT_SIZE ||
    numericValue > MAX_CELL_FONT_SIZE
  ) {
    fontSizeDraft.value = fontSizeValue.value;
    return;
  }
  const currentValue = props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE;
  if (!props.state.fontSize.mixed && numericValue === currentValue) {
    return;
  }
  emit("applyStyle", {
    fontSize: numericValue === DEFAULT_CELL_FONT_SIZE ? null : numericValue,
  });
}

function commitFontSizeOnEnter(value: InputNumberValue, context: { e: KeyboardEvent }): void {
  updateFontSizeDraft(value);
  (context.e.target as HTMLInputElement).blur();
}

watch(fontSizeValue, (value) => {
  fontSizeDraft.value = value;
});
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
      <TInputNumber
        class="font-format-controls__size"
        theme="normal"
        size="small"
        align="right"
        :min="MIN_CELL_FONT_SIZE"
        :max="MAX_CELL_FONT_SIZE"
        :decimal-places="0"
        :step="1"
        :allow-input-over-limit="true"
        :model-value="fontSizeDraft"
        :placeholder="state.fontSize.mixed ? t('format.mixed') : undefined"
        :disabled="disabled"
        @change="updateFontSizeDraft"
        @blur="commitFontSize"
        @enter="commitFontSizeOnEnter"
      />
    </label>
  </div>
</template>

<style scoped lang="scss">
.font-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;

  &__field {
    display: inline-flex;
    min-width: 0;
  }

  &__family {
    width: 116px;
  }

  &__size {
    width: 48px;
  }
}
</style>
