<script setup lang="ts">
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControl from "./CellColorControl.vue";
import CellBorderMenu from "./CellBorderMenu.vue";
import FontFormatControls from "./FontFormatControls.vue";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import TextFormatControls from "./TextFormatControls.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  applyBorders: [action: CellBorderAction];
  updateBorderFormat: [patch: CellBorderFormatPatch];
  openCellFormat: [tab: "font" | "border"];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-cell-format-group"
    data-ribbon-group="cell"
    role="group"
    :aria-label="t('ribbon.cellTools')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-cell-format-group__row" data-ribbon-row="1">
      <FontFormatControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <CellBorderMenu
        :disabled="disabled"
        @apply-borders="emit('applyBorders', $event)"
        @update-border-format="emit('updateBorderFormat', $event)"
        @open-cell-format="emit('openCellFormat', 'border')"
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
    </div>
    <div class="home-cell-format-group__row" data-ribbon-row="2">
      <TextFormatControls
        class="home-cell-format-group__text-tools"
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <CellColorControl
        kind="text"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <CellColorControl
        kind="fill"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
    </div>
    <RibbonDialogLauncher
      :label="`${t('cellFormat.title')} · ${t('cellFormat.font')}`"
      :disabled="disabled"
      data-ribbon-dialog-launcher="font"
      @activate="emit('openCellFormat', 'font')"
    />
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-cell-format-group {
  @include ribbon.compact;
  @include ribbon.dialog-launcher-anchor;

  --cell-format-font-width: 126px;
  --cell-format-font-size-width: 64px;
  --cell-format-gap: 4px;

  &__row {
    @include ribbon.row;

    gap: var(--cell-format-gap);
  }

  &__text-tools {
    flex: 0 0 var(--cell-format-font-width);
  }
}
</style>
