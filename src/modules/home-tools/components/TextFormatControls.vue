<script setup lang="ts">
import { Bold, Italic, Underline } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState, ToggleStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";

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
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.bold === 'on', 'is-mixed': state.bold === 'mixed' }"
      :disabled="disabled"
      :aria-label="t('format.bold')"
      :title="t('format.bold')"
      :aria-pressed="ariaPressed(state.bold)"
      @click="toggle('bold', state.bold)"
    >
      <template #icon>
        <Bold :size="17" :stroke-width="2.2" aria-hidden="true" />
      </template>
    </TButton>
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.italic === 'on', 'is-mixed': state.italic === 'mixed' }"
      :disabled="disabled"
      :aria-label="t('format.italic')"
      :title="t('format.italic')"
      :aria-pressed="ariaPressed(state.italic)"
      @click="toggle('italic', state.italic)"
    >
      <template #icon>
        <Italic :size="17" :stroke-width="2.2" aria-hidden="true" />
      </template>
    </TButton>
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button text-format-controls__button"
      :class="{ 'is-active': state.underline === 'on', 'is-mixed': state.underline === 'mixed' }"
      :disabled="disabled"
      :aria-label="t('format.underline')"
      :title="t('format.underline')"
      :aria-pressed="ariaPressed(state.underline)"
      @click="toggle('underline', state.underline)"
    >
      <template #icon>
        <Underline :size="17" :stroke-width="2.2" aria-hidden="true" />
      </template>
    </TButton>
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
