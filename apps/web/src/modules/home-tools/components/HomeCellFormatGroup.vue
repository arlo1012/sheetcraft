<script setup lang="ts">
import { Sparkles, TableProperties } from "lucide-vue-next";
import type { CellBorderAction, CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControl from "./CellColorControl.vue";
import CellBorderMenu from "./CellBorderMenu.vue";
import FontFormatControls from "./FontFormatControls.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import TextFormatControls from "./TextFormatControls.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  applyBorders: [action: CellBorderAction];
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
          :state="state"
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
        @undo="emit('undo')"
        @redo="emit('redo')"
      />
      <CellColorControl
        kind="fill"
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
    </div>

    <div
      class="home-cell-format-group__lane home-cell-format-group__lane--styles"
      data-cell-format-lane="styles"
      role="group"
      :aria-label="t('format.styleRuleTools')"
    >
      <RibbonIconAction
        class="home-cell-format-group__style-action"
        :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
        :text="t('ribbon.tableStyles')"
        disabled
        disclosure
        data-ribbon-placeholder="table-styles"
      >
        <TableProperties :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        class="home-cell-format-group__style-action"
        :label="t('app.unavailableFeature', { feature: t('ribbon.conditionalFormatting') })"
        :text="t('ribbon.conditionalFormatting')"
        disabled
        disclosure
        data-ribbon-placeholder="conditional-formatting"
      >
        <Sparkles :size="15" aria-hidden="true" />
      </RibbonIconAction>
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
    var(--cell-format-compact-track) max-content;
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
    grid-column: 3;
    grid-row: 1 / span 2;
    justify-items: stretch;
  }

  &__lane--styles {
    grid-column: 4;
    grid-row: 1 / span 2;
    min-width: max-content;
    padding-left: 4px;
    border-left: 1px solid var(--idea-border-subtle);
  }

  &__style-action {
    width: 100%;
    justify-content: flex-start;
    padding-right: 3px;
    padding-left: 3px;
  }
}
</style>
