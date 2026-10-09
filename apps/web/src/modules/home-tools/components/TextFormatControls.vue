<script setup lang="ts">
import { Bold, Italic, Strikethrough, Underline } from "lucide-vue-next";
import type { CellStylePatch } from "@sheetcraft/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@sheetcraft/core/style-state";
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

function ariaPressed(state: ToggleStyleState): boolean | "mixed" {
  return state === "mixed" ? "mixed" : state === "on";
}

function toggle(
  key: "bold" | "italic" | "underline" | "strikethrough",
  state: ToggleStyleState,
): void {
  emit("applyStyle", { [key]: state === "on" ? null : true });
}
</script>

<template>
  <div class="text-format-controls" role="group" :aria-label="t('format.emphasis')">
    <RibbonButton
      class="text-format-controls__button"
      :disabled="disabled"
      :label="t('format.bold')"
      :pressed="ariaPressed(state.bold)"
      @activate="toggle('bold', state.bold)"
    >
      <Bold aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="text-format-controls__button"
      :disabled="disabled"
      :label="t('format.italic')"
      :pressed="ariaPressed(state.italic)"
      @activate="toggle('italic', state.italic)"
    >
      <Italic aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="text-format-controls__button"
      :disabled="disabled"
      :label="t('format.underline')"
      :pressed="ariaPressed(state.underline)"
      @activate="toggle('underline', state.underline)"
    >
      <Underline aria-hidden="true" />
    </RibbonButton>
    <RibbonButton
      class="text-format-controls__button"
      :label="t('ribbon.strikethrough')"
      :disabled="disabled"
      :pressed="ariaPressed(state.strikethrough)"
      @activate="toggle('strikethrough', state.strikethrough)"
    >
      <Strikethrough aria-hidden="true" />
    </RibbonButton>
  </div>
</template>

<style scoped lang="scss">
.text-format-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: var(--ribbon-control-height, 26px);

  &__button {
    position: relative;

    &.is-mixed::after {
      position: absolute;
      right: 5px;
      bottom: 3px;
      left: 5px;
      height: 2px;
      background: var(--sheetcraft-text-muted);
      content: "";
    }
  }
}
</style>
