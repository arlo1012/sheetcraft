<script setup lang="ts">
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import HomeAlignmentGroup from "./HomeAlignmentGroup.vue";
import HomeAutomationGroup from "./HomeAutomationGroup.vue";
import HomeCellFormatGroup from "./HomeCellFormatGroup.vue";
import HomeDataGroup from "./HomeDataGroup.vue";
import HomeHistoryGroup from "./HomeHistoryGroup.vue";
import HomeInsertGroup from "./HomeInsertGroup.vue";
import HomeNumberGroup from "./HomeNumberGroup.vue";
import HomeUtilityGroup from "./HomeUtilityGroup.vue";

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
    data-ribbon-tools
    :aria-label="t('format.toolbar')"
    @keydown="onKeydown"
  >
    <div class="home-format-toolbar__rail">
      <HomeHistoryGroup @undo="emit('undo')" @redo="emit('redo')" />
      <HomeCellFormatGroup
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <HomeAlignmentGroup
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <HomeNumberGroup />
      <HomeDataGroup />
      <HomeInsertGroup />
      <HomeAutomationGroup />
      <HomeUtilityGroup />
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-format-toolbar {
  min-width: 0;
  height: 68px;
  padding: 5px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--td-bg-color-container);
  scrollbar-width: thin;

  &__rail {
    display: flex;
    align-items: stretch;
    width: max-content;
    min-width: max-content;
    height: 56px;
  }
}
</style>
