<script setup lang="ts">
import { TextWrap } from "lucide-vue-next";
import type { CellMergeMode } from "@sheetcraft/core/commands";
import type { CellStylePatch } from "@sheetcraft/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@sheetcraft/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import type { MergeCellsState } from "./data-tool-state";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import IndentationControls from "./IndentationControls.vue";
import MergeCellsMenu from "./MergeCellsMenu.vue";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import VerticalAlignmentControls from "./VerticalAlignmentControls.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  mergeState: MergeCellsState;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  adjustIndent: [delta: -1 | 1];
  merge: [mode: CellMergeMode];
  unmerge: [];
  openCellFormat: [];
}>();

const { t } = useAppI18n();

function ariaPressed(state: ToggleStyleState): boolean | "mixed" {
  return state === "mixed" ? "mixed" : state === "on";
}

function toggleWrapText(state: ToggleStyleState): void {
  emit("applyStyle", { wrapText: state === "on" ? null : true });
}
</script>

<template>
  <section
    class="home-alignment-group"
    data-ribbon-group="alignment"
    role="group"
    :aria-label="t('ribbon.alignmentTools')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-alignment-group__row" data-ribbon-row="1">
      <div class="home-alignment-group__leading">
        <VerticalAlignmentControls
          :state="state.verticalAlign"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <IndentationControls
          :state="state.indent"
          :disabled="disabled"
          @adjust-indent="emit('adjustIndent', $event)"
        />
      </div>
      <div class="home-alignment-group__action">
        <RibbonButton
          full-width
          :label="t('ribbon.wrapText')"
          :text="t('ribbon.wrap')"
          :disabled="disabled"
          :pressed="ariaPressed(state.wrapText)"
          data-ribbon-action="wrap-text"
          @activate="toggleWrapText(state.wrapText)"
        >
          <TextWrap aria-hidden="true" />
        </RibbonButton>
      </div>
    </div>
    <div class="home-alignment-group__row" data-ribbon-row="2">
      <HorizontalAlignmentControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <div class="home-alignment-group__action">
        <MergeCellsMenu
          :state="props.mergeState"
          :disabled="disabled"
          @merge="emit('merge', $event)"
          @unmerge="emit('unmerge')"
        />
      </div>
    </div>
    <RibbonDialogLauncher
      :label="`${t('cellFormat.title')} · ${t('cellFormat.alignment')}`"
      :disabled="disabled"
      data-ribbon-dialog-launcher="alignment"
      @activate="emit('openCellFormat')"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-alignment-group {
  @include ribbon.compact;
  @include ribbon.dialog-launcher-anchor;
  grid-template-columns: max-content max-content;
  column-gap: 4px;

  &__row {
    @include ribbon.row;
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    gap: 4px;
  }

  &__leading {
    display: flex;
    align-items: center;
  }

  &__action {
    display: grid;
  }
}
</style>
