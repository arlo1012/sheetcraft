<script setup lang="ts">
import { AArrowUp, AArrowDown } from "lucide-vue-next";
import { DEFAULT_CELL_FONT_SIZE, MIN_CELL_FONT_SIZE } from "@idea10/core/style";
import { CELL_FONT_SIZE_PRESETS } from "../../../shared/cell-text/font-catalog";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControl from "./CellColorControl.vue";
import CellBorderMenu from "./CellBorderMenu.vue";
import FontFormatControls from "./FontFormatControls.vue";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import TextFormatControls from "./TextFormatControls.vue";

const props = defineProps<{
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
function adjustFontSize(direction: 1 | -1): void {
  if (props.disabled) return;
  const current = props.state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE;
  const largestPreset = CELL_FONT_SIZE_PRESETS.at(-1) ?? DEFAULT_CELL_FONT_SIZE;
  const next =
    direction === 1
      ? (CELL_FONT_SIZE_PRESETS.find((size) => size > current) ?? current + 2)
      : current > largestPreset
        ? Math.max(largestPreset, current - 2)
        : ([...CELL_FONT_SIZE_PRESETS].reverse().find((size) => size < current) ??
          Math.max(MIN_CELL_FONT_SIZE, current - 1));
  if (next !== current || props.state.fontSize.mixed) {
    emit("applyStyle", { fontSize: next === DEFAULT_CELL_FONT_SIZE ? null : next });
  }
}
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
      <RibbonButton
        :label="t('format.increaseFontSize')"
        :disabled="disabled"
        data-font-size-step="increase"
        @activate="adjustFontSize(1)"
        ><AArrowUp
      /></RibbonButton>
      <RibbonButton
        :label="t('format.decreaseFontSize')"
        :disabled="
          disabled ||
          (!state.fontSize.mixed &&
            (state.fontSize.value ?? DEFAULT_CELL_FONT_SIZE) <= MIN_CELL_FONT_SIZE)
        "
        data-font-size-step="decrease"
        @activate="adjustFontSize(-1)"
        ><AArrowDown
      /></RibbonButton>
    </div>
    <div
      class="home-cell-format-group__row home-cell-format-group__row--appearance"
      data-ribbon-row="2"
    >
      <TextFormatControls
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
      <CellColorControl
        kind="fill"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <CellColorControl
        kind="text"
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
  --cell-format-font-size-width: 48px;
  --cell-format-gap: 4px;

  &__row {
    @include ribbon.row;

    gap: var(--cell-format-gap);
  }

  &__row--appearance {
    display: grid;
    grid-template-columns: 108px repeat(3, 40px);
  }
}
</style>
