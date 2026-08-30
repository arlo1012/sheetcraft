<script setup lang="ts">
import {
  ALargeSmall,
  AlignVerticalJustifyCenter,
  TableCellsMerge,
  TextWrap,
} from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import RibbonIconAction from "./RibbonIconAction.vue";

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
    class="home-alignment-group"
    data-ribbon-group="alignment"
    role="group"
    :aria-label="t('ribbon.alignmentTools')"
    :aria-disabled="disabled"
    :title="disabled ? t('format.selectionTooLarge') : undefined"
  >
    <div class="home-alignment-group__row" data-ribbon-row="1">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.verticalAlignment') })"
        disabled
        disclosure
        data-ribbon-placeholder="vertical-alignment"
      >
        <AlignVerticalJustifyCenter :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.textOrientation') })"
        disabled
        disclosure
        data-ribbon-placeholder="text-orientation"
      >
        <ALargeSmall class="home-alignment-group__orientation-icon" :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.wrapText') })"
        :text="t('ribbon.wrapText')"
        disabled
        disclosure
        data-ribbon-placeholder="wrap-text"
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
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.mergeCells') })"
        :text="t('ribbon.mergeCells')"
        disabled
        disclosure
        data-ribbon-placeholder="merge-cells"
      >
        <TableCellsMerge :size="15" aria-hidden="true" />
      </RibbonIconAction>
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
