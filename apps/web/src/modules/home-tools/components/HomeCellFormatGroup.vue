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
      class="home-cell-format-group__lane"
      data-cell-format-lane="typography"
      role="group"
      :aria-label="t('format.typographyTools')"
    >
      <FontFormatControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <div class="home-cell-format-group__typography-tools">
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
  @include ribbon.columns;

  --cell-format-font-width: 126px;
  --ribbon-compact-action-width: 40px;
  --cell-format-gap: 4px;
  --cell-format-control-height: 26px;

  gap: var(--cell-format-gap);

  &__lane {
    @include ribbon.stack;

    min-width: 0;
  }

  &__typography-tools {
    @include ribbon.row;

    gap: var(--cell-format-gap);
  }

  &__text-tools {
    flex: 0 0 var(--cell-format-font-width);
  }

  &__lane--appearance {
    @include ribbon.dialog-launcher-anchor;
  }
}
</style>
