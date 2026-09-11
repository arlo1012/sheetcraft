<script setup lang="ts">
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControl from "./CellColorControl.vue";
import CellBorderMenu from "./CellBorderMenu.vue";
import FontFormatControls from "./FontFormatControls.vue";
import RibbonDialogLauncher from "./RibbonDialogLauncher.vue";
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
    <div
      class="home-cell-format-group__lane home-cell-format-group__lane--typography"
      data-cell-format-lane="typography"
      role="group"
      :aria-label="t('format.typographyTools')"
    >
      <FontFormatControls
        class="home-cell-format-group__font-tools"
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <div class="home-cell-format-group__typography-tools">
        <TextFormatControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <CellColorControl
          kind="text"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
      </div>
    </div>

    <div
      class="home-cell-format-group__lane home-cell-format-group__lane--appearance"
      data-cell-format-lane="appearance"
      role="group"
      :aria-label="t('format.appearanceTools')"
    >
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
      <RibbonDialogLauncher
        :label="`${t('cellFormat.title')} · ${t('cellFormat.font')}`"
        :disabled="disabled"
        data-ribbon-dialog-launcher="font"
        @activate="emit('openCellFormat', 'font')"
      />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-cell-format-group {
  @include ribbon.shell;

  --cell-format-primary-track: 126px;
  --cell-format-compact-track: 40px;
  --cell-format-column-gap: 4px;
  --cell-format-control-height: 26px;

  display: grid;
  grid-template-columns:
    var(--cell-format-primary-track) var(--cell-format-compact-track)
    var(--cell-format-compact-track);
  grid-template-rows: repeat(2, 27px);
  align-content: center;
  column-gap: var(--cell-format-column-gap);

  &__lane {
    @include ribbon.stack;

    min-width: 0;
  }

  &__lane--typography {
    grid-column: 1 / span 2;
    grid-row: 1 / span 2;
    grid-template-columns: var(--cell-format-primary-track) var(--cell-format-compact-track);
    column-gap: var(--cell-format-column-gap);
  }

  &__font-tools,
  &__typography-tools {
    grid-column: 1 / -1;
  }

  &__typography-tools {
    display: grid;
    grid-template-columns: var(--cell-format-primary-track) var(--cell-format-compact-track);
    align-items: center;
    column-gap: var(--cell-format-column-gap);
  }

  &__lane--appearance {
    @include ribbon.dialog-launcher-anchor;

    grid-column: 3;
    grid-row: 1 / span 2;
    justify-items: stretch;
  }
}
</style>
