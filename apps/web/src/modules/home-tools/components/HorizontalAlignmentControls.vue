<script setup lang="ts">
import CellHorizontalAlignmentIcon from "./CellHorizontalAlignmentIcon.vue";
import { computed } from "vue";
import type { CellStylePatch, HorizontalCellAlignment } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

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

function isActive(alignment: HorizontalCellAlignment): boolean {
  if (props.state.horizontalAlign.mixed) {
    return false;
  }
  return (props.state.horizontalAlign.value ?? "general") === alignment;
}

function align(alignment: HorizontalCellAlignment): void {
  emit("applyStyle", { horizontalAlign: alignment });
}
</script>

<template>
  <div
    class="horizontal-alignment-controls"
    :class="{ 'is-mixed': state.horizontalAlign.mixed }"
    role="group"
    :aria-label="groupLabel"
  >
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignLeft')"
      :pressed="isActive('left')"
      data-horizontal-alignment-action="left"
      @activate="align('left')"
    >
      <CellHorizontalAlignmentIcon alignment="left" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignCenter')"
      :pressed="isActive('center')"
      data-horizontal-alignment-action="center"
      @activate="align('center')"
    >
      <CellHorizontalAlignmentIcon alignment="center" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignRight')"
      :pressed="isActive('right')"
      data-horizontal-alignment-action="right"
      @activate="align('right')"
    >
      <CellHorizontalAlignmentIcon alignment="right" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('cellFormat.horizontalJustify')"
      :pressed="isActive('justify')"
      data-horizontal-alignment-action="justify"
      @activate="align('justify')"
    >
      <CellHorizontalAlignmentIcon alignment="justify" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('cellFormat.horizontalDistributed')"
      :pressed="isActive('distributed')"
      data-horizontal-alignment-action="distributed"
      @activate="align('distributed')"
    >
      <CellHorizontalAlignmentIcon alignment="distributed" />
    </RibbonButton>
  </div>
</template>

<style scoped lang="scss">
.horizontal-alignment-controls {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;

  &.is-mixed::after {
    position: absolute;
    right: 6px;
    bottom: 2px;
    left: 6px;
    height: 2px;
    background: var(--idea-text-muted);
    content: "";
    pointer-events: none;
  }
}
</style>
