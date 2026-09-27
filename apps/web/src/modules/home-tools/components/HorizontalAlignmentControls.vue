<script setup lang="ts">
import {
  AlignHorizontalSpaceBetween,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
} from "lucide-vue-next";
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
      <TextAlignStart aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignCenter')"
      :pressed="isActive('center')"
      data-horizontal-alignment-action="center"
      @activate="align('center')"
    >
      <TextAlignCenter aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('format.alignRight')"
      :pressed="isActive('right')"
      data-horizontal-alignment-action="right"
      @activate="align('right')"
    >
      <TextAlignEnd aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('cellFormat.horizontalJustify')"
      :pressed="isActive('justify')"
      data-horizontal-alignment-action="justify"
      @activate="align('justify')"
    >
      <TextAlignJustify aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="horizontal-alignment-controls__button"
      :disabled="disabled"
      :label="t('cellFormat.horizontalDistributed')"
      :pressed="isActive('distributed')"
      data-horizontal-alignment-action="distributed"
      @activate="align('distributed')"
    >
      <AlignHorizontalSpaceBetween aria-hidden="true" />
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
