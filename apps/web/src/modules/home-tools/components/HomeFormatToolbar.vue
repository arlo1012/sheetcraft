<script setup lang="ts">
import { computed } from "vue";
import type { CellMergeMode, CellValueConversionMode } from "@idea10/core/commands";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import type { CellFormatTab } from "../../cell-format/components/CellFormatDialog.vue";
import { useAppI18n } from "../../../shared/i18n";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import HomeAlignmentGroup from "./HomeAlignmentGroup.vue";
import HomeAutomationGroup from "./HomeAutomationGroup.vue";
import HomeCellFormatGroup from "./HomeCellFormatGroup.vue";
import HomeDataGroup from "./HomeDataGroup.vue";
import HomeHistoryGroup from "./HomeHistoryGroup.vue";
import HomeInsertGroup from "./HomeInsertGroup.vue";
import HomeNumberGroup from "./HomeNumberGroup.vue";
import HomeStylesGroup from "./HomeStylesGroup.vue";
import type { ConditionalFormatQuickRule } from "../../conditional-formatting/components/ConditionalFormattingMenu.vue";
import HomeUtilityGroup from "./HomeUtilityGroup.vue";
import {
  createDefaultHomeDataToolState,
  createDefaultMergeCellsState,
  type FilterValueKey,
  type HomeDataToolState,
  type MergeCellsState,
} from "./data-tool-state";

const props = withDefaults(
  defineProps<{
    state: SelectionCellStyleState;
    disabled: boolean;
    conditionalFormattingDisabled?: boolean;
    readOnly?: boolean;
    editSessionId?: string;
    formatPainterActive?: boolean;
    dataState?: HomeDataToolState;
    mergeState?: MergeCellsState;
  }>(),
  { conditionalFormattingDisabled: undefined },
);

defineSlots<{ "row-column-tools"?: () => unknown; "worksheet-tools"?: () => unknown }>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  applyBorders: [action: CellBorderAction];
  updateBorderFormat: [patch: CellBorderFormatPatch];
  openCellFormat: [tab: CellFormatTab];
  adjustDecimals: [delta: -1 | 1];
  convertNumberType: [mode: CellValueConversionMode];
  adjustIndent: [delta: -1 | 1];
  activateFormatPainter: [];
  autoSum: [];
  sort: [direction: "ascending" | "descending"];
  applyFilter: [includedKeys: FilterValueKey[]];
  clearFilter: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
  merge: [mode: CellMergeMode];
  unmerge: [];
  insertImage: [mode: "cell" | "floating"];
  undo: [];
  redo: [];
  toggleProtection: [];
  openDataTools: [];
  createConditionalFormat: [kind: ConditionalFormatQuickRule];
  manageConditionalFormats: [];
  clearConditionalFormats: [scope: "selection" | "sheet"];
}>();

const { t } = useAppI18n();
const defaultDataState = createDefaultHomeDataToolState();
const defaultMergeState = createDefaultMergeCellsState();
const dataState = computed(() => props.dataState ?? defaultDataState);
const mergeState = computed(() => props.mergeState ?? defaultMergeState);

function onKeydown(event: KeyboardEvent): void {
  const action = getWorkbookHistoryShortcut(event);
  if (!action) {
    return;
  }
  event.preventDefault();
  if (action === "undo") {
    emit("undo");
  } else {
    emit("redo");
  }
}
</script>

<template>
  <RibbonToolbar class="home-format-toolbar" :label="t('format.toolbar')" @keydown="onKeydown">
    <HomeHistoryGroup
      :disabled="disabled"
      :format-painter-active="formatPainterActive"
      @apply-style="emit('applyStyle', $event)"
      @activate-format-painter="emit('activateFormatPainter')"
      @undo="emit('undo')"
      @redo="emit('redo')"
    />
    <HomeCellFormatGroup
      :state="state"
      :disabled="disabled"
      @apply-style="emit('applyStyle', $event)"
      @apply-borders="emit('applyBorders', $event)"
      @update-border-format="emit('updateBorderFormat', $event)"
      @open-cell-format="emit('openCellFormat', $event)"
      @undo="emit('undo')"
      @redo="emit('redo')"
    />
    <HomeAlignmentGroup
      :state="state"
      :disabled="disabled"
      :merge-state="mergeState"
      @apply-style="emit('applyStyle', $event)"
      @adjust-indent="emit('adjustIndent', $event)"
      @merge="emit('merge', $event)"
      @unmerge="emit('unmerge')"
      @open-cell-format="emit('openCellFormat', 'alignment')"
    />
    <HomeNumberGroup
      :state="state"
      :disabled="disabled"
      :conversion-disabled="readOnly"
      @convert="emit('convertNumberType', $event)"
      @apply-style="emit('applyStyle', $event)"
      @adjust-decimals="emit('adjustDecimals', $event)"
      @open-cell-format="emit('openCellFormat', 'number')"
    />
    <section
      v-if="$slots['row-column-tools'] || $slots['worksheet-tools']"
      class="home-format-toolbar__structure"
      data-ribbon-group="structure"
      role="group"
      :aria-label="t('ribbon.structureTools')"
    >
      <div class="home-format-toolbar__structure-row" data-ribbon-row="1">
        <slot name="row-column-tools" />
      </div>
      <div class="home-format-toolbar__structure-row" data-ribbon-row="2">
        <slot name="worksheet-tools" />
      </div>
    </section>
    <HomeStylesGroup
      :disabled="conditionalFormattingDisabled ?? disabled"
      :edit-session-id="editSessionId"
      @create-conditional-format="emit('createConditionalFormat', $event)"
      @manage-conditional-formats="emit('manageConditionalFormats')"
      @clear-conditional-formats="emit('clearConditionalFormats', $event)"
    />
    <HomeDataGroup
      :edit-session-id="editSessionId"
      :state="dataState"
      :read-only="readOnly"
      @toggle-protection="emit('toggleProtection')"
      @open-data-tools="emit('openDataTools')"
      @auto-sum="emit('autoSum')"
      @sort="emit('sort', $event)"
      @apply-filter="emit('applyFilter', $event)"
      @clear-filter="emit('clearFilter')"
      @freeze="emit('freeze', $event)"
      @unfreeze="emit('unfreeze')"
    />
    <HomeInsertGroup :disabled="disabled" @insert-image="emit('insertImage', $event)" />
    <HomeAutomationGroup />
    <HomeUtilityGroup />
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.home-format-toolbar {
  &__structure {
    @include ribbon.compact;
  }

  &__structure-row {
    @include ribbon.row;
  }
}
</style>
