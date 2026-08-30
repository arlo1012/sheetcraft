<script setup lang="ts">
import { Bold, Italic, Strikethrough, Underline } from "lucide-vue-next";
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
      class="text-format-controls__button"
      :disabled="disabled"
      :label="t('format.bold')"
      :pressed="ariaPressed(state.bold)"
      @activate="toggle('bold', state.bold)"
    >
      <Bold :size="17" :stroke-width="2.2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="text-format-controls__button"
      :label="t('app.unavailableFeature', { feature: t('ribbon.strikethrough') })"
      disabled
      data-ribbon-placeholder="strikethrough"
    >
      <Strikethrough :size="15" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="text-format-controls__button"
      :disabled="disabled"
      :label="t('format.italic')"
      :pressed="ariaPressed(state.italic)"
      @activate="toggle('italic', state.italic)"
    >
      <Italic :size="17" :stroke-width="2.2" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="text-format-controls__button"
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
  gap: 6px;

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
