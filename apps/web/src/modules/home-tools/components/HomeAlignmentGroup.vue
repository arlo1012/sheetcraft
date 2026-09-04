<script setup lang="ts">
import { ALargeSmall, TextWrap } from "lucide-vue-next";
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState, ToggleStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import type { MergeCellsState } from "./data-tool-state";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import MergeCellsMenu from "./MergeCellsMenu.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import VerticalAlignmentMenu from "./VerticalAlignmentMenu.vue";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
  mergeState: MergeCellsState;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  merge: [];
  unmerge: [];
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
      <VerticalAlignmentMenu
        :state="state.verticalAlign"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.textOrientation') })"
        disabled
        disclosure
        data-ribbon-placeholder="text-orientation"
      >
        <ALargeSmall class="home-alignment-group__orientation-icon" :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('ribbon.wrapText')"
        :text="t('ribbon.wrapText')"
        :disabled="disabled"
        :pressed="ariaPressed(state.wrapText)"
        data-ribbon-action="wrap-text"
        @activate="toggleWrapText(state.wrapText)"
      >
        <TextWrap :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-alignment-group__row" data-ribbon-row="2">
      <HorizontalAlignmentControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <MergeCellsMenu
        :state="props.mergeState"
        :disabled="disabled"
        @merge="emit('merge')"
        @unmerge="emit('unmerge')"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-alignment-group {
  @include ribbon.compact;

  &__row {
    @include ribbon.row;
  }

  &__orientation-icon {
    transform: rotate(-18deg);
  }
}
</style>
