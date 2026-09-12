<script setup lang="ts">
import { TextWrap } from "lucide-vue-next";
import type { CellMergeMode } from "@idea10/core/commands";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import type { MergeCellsState } from "./data-tool-state";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import IndentationControls from "./IndentationControls.vue";
import MergeCellsMenu from "./MergeCellsMenu.vue";
import RibbonDialogLauncher from "./RibbonDialogLauncher.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
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
      <RibbonIconAction
        class="home-alignment-group__action"
        :label="t('ribbon.wrapText')"
        :text="t('ribbon.wrap')"
        :disabled="disabled"
        :pressed="ariaPressed(state.wrapText)"
        data-ribbon-action="wrap-text"
        @activate="toggleWrapText(state.wrapText)"
      >
        <TextWrap :size="17" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-alignment-group__row" data-ribbon-row="2">
      <HorizontalAlignmentControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <MergeCellsMenu
        class="home-alignment-group__action"
        :state="props.mergeState"
        :disabled="disabled"
        @merge="emit('merge', $event)"
        @unmerge="emit('unmerge')"
      />
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
@use "../styles/ribbon-groups" as ribbon;

.home-alignment-group {
  @include ribbon.compact;
  @include ribbon.dialog-launcher-anchor;

  &__row {
    @include ribbon.row;

    gap: 0;
  }

  &__action {
    --ribbon-labeled-action-width: auto;
    --ribbon-labeled-action-justify: flex-start;
    --ribbon-labeled-action-padding: 4px;

    flex: 1 0 72px;
    margin-left: 4px;
  }
}
</style>
