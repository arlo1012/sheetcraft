<script setup lang="ts">
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControls from "./CellColorControls.vue";
import FontFormatControls from "./FontFormatControls.vue";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import TextFormatControls from "./TextFormatControls.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();

function onKeydown(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "color") ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      emit("redo");
    } else {
      emit("undo");
    }
  } else if (key === "y") {
    event.preventDefault();
    emit("redo");
  }
}
</script>

<template>
  <div
    class="home-format-toolbar"
    role="group"
    :aria-label="t('format.toolbar')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
    @keydown="onKeydown"
  >
    <FontFormatControls
      :state="state"
      :disabled="disabled"
      @apply-style="emit('applyStyle', $event)"
    />
    <span class="home-format-toolbar__separator" aria-hidden="true" />
    <TextFormatControls
      :state="state"
      :disabled="disabled"
      @apply-style="emit('applyStyle', $event)"
    />
    <CellColorControls
      :state="state"
      :disabled="disabled"
      @apply-style="emit('applyStyle', $event)"
    />
    <span class="home-format-toolbar__separator" aria-hidden="true" />
    <HorizontalAlignmentControls
      :state="state"
      :disabled="disabled"
      @apply-style="emit('applyStyle', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.home-format-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 40px;
  padding: 5px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--ui-surface-muted);
  border-bottom: 1px solid var(--ui-border-default);
  scrollbar-width: thin;

  &__separator {
    flex: 0 0 auto;
    width: 1px;
    height: 20px;
    margin: 0 2px;
    background: var(--ui-border-default);
  }
}
</style>
