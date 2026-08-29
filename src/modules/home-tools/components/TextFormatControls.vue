<script setup lang="ts">
import { Bold, Italic, Underline } from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState, ToggleStyleState } from "../../workbook/style-state";
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

function ariaPressed(state: ToggleStyleState): boolean | "mixed" {
  return state === "mixed" ? "mixed" : state === "on";
}

function toggle(key: "bold" | "italic" | "underline", state: ToggleStyleState): void {
  emit("applyStyle", { [key]: state === "on" ? null : true });
}
</script>

<template>
  <div class="text-format-controls" role="group" :aria-label="t('format.emphasis')">
    <RibbonIconAction
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.bold === 'on', 'is-mixed': state.bold === 'mixed' }"
      :disabled="disabled"
      :label="t('format.bold')"
      :pressed="ariaPressed(state.bold)"
      @activate="toggle('bold', state.bold)"
    >
      <Bold :size="17" :stroke-width="2.2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.italic === 'on', 'is-mixed': state.italic === 'mixed' }"
      :disabled="disabled"
      :label="t('format.italic')"
      :pressed="ariaPressed(state.italic)"
      @activate="toggle('italic', state.italic)"
    >
      <Italic :size="17" :stroke-width="2.2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.underline === 'on', 'is-mixed': state.underline === 'mixed' }"
      :disabled="disabled"
      :label="t('format.underline')"
      :pressed="ariaPressed(state.underline)"
      @activate="toggle('underline', state.underline)"
    >
      <Underline :size="17" :stroke-width="2.2" aria-hidden="true" />
    </RibbonIconAction>
  </div>
</template>

<style scoped lang="scss">
.text-format-controls {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;

  &__button {
    position: relative;

    &.is-mixed::after {
      position: absolute;
      right: 5px;
      bottom: 3px;
      left: 5px;
      height: 2px;
      background: var(--td-text-color-placeholder);
      content: "";
    }
  }
}
</style>
