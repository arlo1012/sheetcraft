<script setup lang="ts">
import { TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-vue-next";
import { computed } from "vue";
import type { CellStylePatch, HorizontalCellAlignment } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

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
  return (props.state.horizontalAlign.value ?? "left") === alignment;
}

function align(alignment: HorizontalCellAlignment): void {
  emit("applyStyle", { horizontalAlign: alignment === "left" ? null : alignment });
}
</script>

<template>
  <div
    class="horizontal-alignment-controls"
    :class="{ 'is-mixed': state.horizontalAlign.mixed }"
    role="group"
    :aria-label="groupLabel"
  >
    <RibbonIconAction
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('left') }"
      :disabled="disabled"
      :label="t('format.alignLeft')"
      :pressed="isActive('left')"
      @activate="align('left')"
    >
      <TextAlignStart :size="17" :stroke-width="2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('center') }"
      :disabled="disabled"
      :label="t('format.alignCenter')"
      :pressed="isActive('center')"
      @activate="align('center')"
    >
      <TextAlignCenter :size="17" :stroke-width="2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('right') }"
      :disabled="disabled"
      :label="t('format.alignRight')"
      :pressed="isActive('right')"
      @activate="align('right')"
    >
      <TextAlignEnd :size="17" :stroke-width="2" aria-hidden="true" />
    </RibbonIconAction>
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
    background: var(--td-text-color-placeholder);
    content: "";
    pointer-events: none;
  }
}
</style>
