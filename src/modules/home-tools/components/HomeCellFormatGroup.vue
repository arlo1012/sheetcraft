<script setup lang="ts">
import { Grid2X2, Sparkles, TableProperties } from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControl from "./CellColorControl.vue";
import FontFormatControls from "./FontFormatControls.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import TextFormatControls from "./TextFormatControls.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
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
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.borders') })"
        disabled
        disclosure
        data-ribbon-placeholder="borders"
      >
        <Grid2X2 :size="15" aria-hidden="true" />
      </RibbonIconAction>
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

  display: grid;
  grid-template-columns: repeat(3, max-content);
  align-content: center;
  column-gap: 4px;

  &__lane {
    @include ribbon.stack;

    min-width: 0;
  }

  &__typography-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__lane--styles {
    min-width: max-content;
  }

  &__style-action {
    width: 100%;
    justify-content: flex-start;
    padding-right: 3px;
    padding-left: 3px;
  }
}
</style>
