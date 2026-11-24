<script setup lang="ts">
import { computed } from "vue";
import type { CellStylePatch, HorizontalCellAlignment } from "@sheetcraft/core/style";
import type { SelectionCellStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import TextAlignmentToggleGroup, {
  type TextAlignmentOption,
} from "../../../shared/text-format/TextAlignmentToggleGroup.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const groupLabel = computed(() =>
  t(
    props.state.horizontalAlign.mixed
      ? "format.horizontalAlignmentMixed"
      : "format.horizontalAlignment",
  ),
);
const options = computed<readonly TextAlignmentOption<HorizontalCellAlignment>[]>(() => [
  { value: "left", label: t("format.alignLeft"), icon: "left" },
  { value: "center", label: t("format.alignCenter"), icon: "center" },
  { value: "right", label: t("format.alignRight"), icon: "right" },
  { value: "justify", label: t("cellFormat.horizontalJustify"), icon: "justify" },
  { value: "distributed", label: t("cellFormat.horizontalDistributed"), icon: "distributed" },
]);

function align(alignment: string): void {
  emit("applyStyle", { horizontalAlign: alignment as HorizontalCellAlignment });
}
</script>

<template>
  <TextAlignmentToggleGroup
    class="horizontal-alignment-controls"
    variant="ribbon"
    :options="options"
    :model-value="state.horizontalAlign.value ?? 'general'"
    :mixed="state.horizontalAlign.mixed"
    :disabled="disabled"
    :label="groupLabel"
    @select="align"
  />
</template>
