<script setup lang="ts">
import { ArrowDownToLine, ArrowUpToLine, FoldVertical } from "lucide-vue-next";
import type { CellStylePatch, VerticalCellAlignment } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

const props = defineProps<{
  state: SelectionCellStyleState["verticalAlign"];
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();

function isActive(alignment: VerticalCellAlignment): boolean {
  return !props.state.mixed && (props.state.value ?? "bottom") === alignment;
}

function align(alignment: "top" | "middle" | "bottom"): void {
  emit("applyStyle", {
    verticalAlign: alignment === "bottom" ? null : alignment,
  });
}
</script>

<template>
  <div class="vertical-alignment-controls" role="group" :aria-label="t('format.verticalAlignment')">
    <RibbonButton
      class="vertical-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignTop')"
      :pressed="isActive('top')"
      data-vertical-alignment-action="top"
      @activate="align('top')"
    >
      <ArrowUpToLine aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="vertical-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignMiddle')"
      :pressed="isActive('middle')"
      data-vertical-alignment-action="middle"
      @activate="align('middle')"
    >
      <FoldVertical aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="vertical-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignBottom')"
      :pressed="isActive('bottom')"
      data-vertical-alignment-action="bottom"
      @activate="align('bottom')"
    >
      <ArrowDownToLine aria-hidden="true" />
    </RibbonButton>
  </div>
</template>

<style scoped lang="scss">
.vertical-alignment-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}
</style>
