<script setup lang="ts">
import { computed } from "vue";
import type { CellStylePatch, VerticalCellAlignment } from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import TextAlignmentToggleGroup, {
  type TextAlignmentOption,
} from "../../../shared/text-format/TextAlignmentToggleGroup.vue";

const props = defineProps<{
  state: SelectionCellStyleState["verticalAlign"];
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const options = computed<readonly TextAlignmentOption<VerticalCellAlignment>[]>(() => [
  { value: "top", label: t("format.alignTop"), icon: "top" },
  { value: "middle", label: t("format.alignMiddle"), icon: "middle" },
  { value: "bottom", label: t("format.alignBottom"), icon: "bottom" },
]);

function align(alignment: string): void {
  emit("applyStyle", {
    verticalAlign: alignment === "bottom" ? null : (alignment as "top" | "middle"),
  });
}
</script>

<template>
  <TextAlignmentToggleGroup
    class="vertical-alignment-controls"
    variant="ribbon"
    :options="options"
    :model-value="state.value ?? 'bottom'"
    :mixed="state.mixed"
    :disabled="disabled"
    :label="t('format.verticalAlignment')"
    @select="align"
  />
</template>
