<script setup lang="ts">
import { computed, ref } from "vue";
import { resolveThemeColor, type ThemeColorReference } from "@sheetcraft/core/workbook-theme";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellStylePatch,
} from "@sheetcraft/core/style";
import RibbonColorSplitButton from "../../../shared/color/RibbonColorSplitButton.vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  kind: "text" | "fill";
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const workbookTheme = useWorkbookTheme();
const rememberedColor = ref<string | null>(props.kind === "text" ? "#ff0000" : "#ffff00");
const selectedReference = ref<ThemeColorReference>();
const selectedColor = computed(() =>
  selectedReference.value && workbookTheme?.value
    ? resolveThemeColor(workbookTheme.value, selectedReference.value)
    : rememberedColor.value,
);
const defaultColor = computed(() =>
  props.kind === "text" ? DEFAULT_CELL_TEXT_COLOR : DEFAULT_CELL_FILL_COLOR,
);
const label = computed(() => t(props.kind === "text" ? "format.textColor" : "format.fillColor"));
const defaultLabel = computed(() =>
  t(props.kind === "text" ? "cellFormat.automatic" : "cellFormat.noFill"),
);

function applyColor(color: string | null, reference?: ThemeColorReference): void {
  if (props.disabled) return;
  rememberedColor.value = color;
  selectedReference.value = reference;
  emit(
    "applyStyle",
    props.kind === "text"
      ? { textColor: color, ...(reference ? { textColorTheme: reference } : {}) }
      : { fillColor: color, ...(reference ? { fillColorTheme: reference } : {}) },
  );
}
</script>

<template>
  <div class="cell-color-control" :data-cell-color-control="kind">
    <RibbonColorSplitButton
      :kind="kind"
      :label="label"
      :model-value="selectedColor"
      :reference="selectedReference"
      :default-color="defaultColor"
      :default-label="defaultLabel"
      :disabled="disabled"
      :icon-attrs="{ 'data-cell-color-icon': kind }"
      normalize-default-to-null
      @select="applyColor"
    />
  </div>
</template>

<style scoped lang="scss">
.cell-color-control {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: var(--ribbon-control-height, 26px);
}
</style>
