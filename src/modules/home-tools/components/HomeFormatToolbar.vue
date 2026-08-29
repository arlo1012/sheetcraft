<script setup lang="ts">
import {
  Grid2X2,
  Hash,
  Paintbrush,
  Percent,
  Redo2,
  TableCellsMerge,
  TextWrap,
  Undo2,
} from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControls from "./CellColorControls.vue";
import FontFormatControls from "./FontFormatControls.vue";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
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
    data-ribbon-tools
    :aria-label="t('format.toolbar')"
    @keydown="onKeydown"
  >
    <div
      class="home-format-toolbar__group"
      data-ribbon-group="history"
      role="group"
      :aria-label="t('ribbon.historyTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('ribbon.undo')"
          data-ribbon-action="undo"
          @activate="emit('undo')"
        >
          <Undo2 :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('ribbon.redo')"
          data-ribbon-action="redo"
          @activate="emit('redo')"
        >
          <Redo2 :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="cell"
      role="group"
      :aria-label="t('ribbon.cellTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.formatPainter') })"
          disabled
          warning
          data-ribbon-placeholder="format-painter"
        >
          <Paintbrush :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.borders') })"
          disabled
          warning
          data-ribbon-placeholder="borders"
        >
          <Grid2X2 :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="font"
      role="group"
      :aria-label="t('ribbon.fontTools')"
      :aria-disabled="disabled"
      :title="disabled ? t('format.selectionTooLarge') : undefined"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <FontFormatControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
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
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="alignment"
      role="group"
      :aria-label="t('ribbon.alignmentTools')"
      :aria-disabled="disabled"
      :title="disabled ? t('format.selectionTooLarge') : undefined"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <HorizontalAlignmentControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.wrapText') })"
          disabled
          warning
          data-ribbon-placeholder="wrap-text"
        >
          <TextWrap :size="16" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.mergeCells') })"
          disabled
          warning
          data-ribbon-placeholder="merge-cells"
        >
          <TableCellsMerge :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="number"
      role="group"
      :aria-label="t('ribbon.numberTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.numberFormat') })"
          disabled
          warning
          data-ribbon-placeholder="number-format"
        >
          <Hash :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.percentFormat') })"
          disabled
          warning
          data-ribbon-placeholder="percent-format"
        >
          <Percent :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-format-toolbar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 64px;
  padding: 2px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: transparent;
  scrollbar-width: thin;

  &__row {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 28px;
  }

  &__group {
    display: grid;
    flex: 0 0 auto;
    grid-template-rows: repeat(2, 28px);
    align-content: center;
    padding: 2px 6px;
    border-right: 1px solid var(--td-border-level-1-color);

    &:first-child {
      padding-left: 2px;
    }

    &:last-child {
      border-right: 0;
    }
  }
}
</style>
