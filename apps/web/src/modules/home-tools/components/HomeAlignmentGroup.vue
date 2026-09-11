<script setup lang="ts">
import { TextWrap } from "lucide-vue-next";
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
  merge: [];
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
    </div>
    <div class="home-alignment-group__row" data-ribbon-row="2">
      <HorizontalAlignmentControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
    </div>
    <RibbonIconAction
      class="home-alignment-group__wrap"
      :label="t('ribbon.wrapText')"
      :text="t('ribbon.wrap')"
      variant="tall"
      :disabled="disabled"
      :pressed="ariaPressed(state.wrapText)"
      data-ribbon-action="wrap-text"
      @activate="toggleWrapText(state.wrapText)"
    >
      <TextWrap :size="24" :stroke-width="1.5" aria-hidden="true" />
    </RibbonIconAction>
    <MergeCellsMenu
      class="home-alignment-group__merge"
      :state="props.mergeState"
      :disabled="disabled"
      @merge="emit('merge')"
      @unmerge="emit('unmerge')"
    />
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
  @include ribbon.mixed(max-content max-content max-content);
  @include ribbon.dialog-launcher-anchor;

  --ribbon-tall-action-min-width: 40px;

  column-gap: 4px;

  &__row {
    @include ribbon.row;

    grid-column: 1;
    gap: 0;
  }

  &__wrap {
    grid-column: 2;
    grid-row: 1 / span 2;
  }

  &__merge {
    grid-column: 3;
    grid-row: 1 / span 2;
  }
}
</style>
