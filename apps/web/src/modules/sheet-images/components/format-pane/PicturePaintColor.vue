<script setup lang="ts">
import { computed } from "vue";
import {
  DEFAULT_WORKBOOK_THEME,
  resolveThemeColor,
  type ThemeColorReference,
} from "@sheetcraft/core/workbook-theme";
import type { PictureColor } from "@sheetcraft/core/picture-detailed-style";
import ColorPaletteSelect from "../../../../shared/color/ColorPaletteSelect.vue";
import { useWorkbookTheme } from "../../../../shared/color/workbook-theme-context";
import { picturePaintColorFromSelection } from "../../picture-paint-edit";
import PictureFormatField from "./PictureFormatField.vue";
const props = defineProps<{
  value: PictureColor;
  label: string;
  automaticLabel: string;
  disabled?: boolean;
  onCommit: (value: PictureColor) => boolean;
}>();
const theme = useWorkbookTheme();
const rgb = computed(() =>
  props.value.kind === "rgb"
    ? props.value.rgb
    : props.value.kind === "theme"
      ? resolveThemeColor(theme?.value ?? DEFAULT_WORKBOOK_THEME, props.value.reference)
      : null,
);
function select(value: string | null, reference?: ThemeColorReference) {
  if (!props.disabled) props.onCommit(picturePaintColorFromSelection(value, reference));
}
</script>
<template>
  <PictureFormatField :label="label">
    <ColorPaletteSelect
      :model-value="rgb"
      :label="label"
      :default-label="automaticLabel"
      :disabled="disabled"
      show-value
      @select="select"
    />
  </PictureFormatField>
</template>
