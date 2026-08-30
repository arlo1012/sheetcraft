<script setup lang="ts">
import { Grid2X2, Sparkles, Strikethrough, TableProperties } from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControls from "./CellColorControls.vue";
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
    <div class="home-cell-format-group__row" data-ribbon-row="1">
      <FontFormatControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.borders') })"
        disabled
        disclosure
        data-ribbon-placeholder="borders"
      >
        <Grid2X2 :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
        :text="t('ribbon.tableStyles')"
        disabled
        disclosure
        data-ribbon-placeholder="table-styles"
      >
        <TableProperties :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-cell-format-group__row" data-ribbon-row="2">
      <TextFormatControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.strikethrough') })"
        disabled
        data-ribbon-placeholder="strikethrough"
      >
        <Strikethrough :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <CellColorControls
        :state="state"
        :disabled="disabled"
        @apply-style="emit('applyStyle', $event)"
      />
      <RibbonIconAction
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
  @include ribbon.compact;

  min-width: 334px;

  &__row {
    @include ribbon.row;
  }
}
</style>
