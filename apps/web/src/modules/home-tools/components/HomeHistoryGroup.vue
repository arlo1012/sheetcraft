<script setup lang="ts">
import { Eraser, Paintbrush, Redo2, Undo2 } from "lucide-vue-next";
import { createClearCellStylePatch, type CellStylePatch } from "@sheetcraft/core/style";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

defineProps<{
  disabled: boolean;
  formatPainterActive?: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  activateFormatPainter: [];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-history-group"
    data-ribbon-group="history"
    role="group"
    :aria-label="t('ribbon.historyTools')"
  >
    <div class="home-history-group__row" data-ribbon-row="1">
      <RibbonButton :label="t('ribbon.undo')" data-ribbon-action="undo" @activate="emit('undo')">
        <Undo2 aria-hidden="true" />
      </RibbonButton>
      <RibbonButton :label="t('ribbon.redo')" data-ribbon-action="redo" @activate="emit('redo')">
        <Redo2 aria-hidden="true" />
      </RibbonButton>
    </div>
    <div class="home-history-group__row" data-ribbon-row="2">
      <RibbonButton
        :label="t('ribbon.formatPainter')"
        :disabled="disabled"
        :pressed="formatPainterActive"
        data-ribbon-action="format-painter"
        @activate="emit('activateFormatPainter')"
      >
        <Paintbrush aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('ribbon.clearFormatting')"
        :disabled="disabled"
        data-ribbon-action="clear-formatting"
        @activate="emit('applyStyle', createClearCellStylePatch())"
      >
        <Eraser aria-hidden="true" />
      </RibbonButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-history-group {
  @include ribbon.compact;

  padding-right: 8px;
  padding-left: 8px;

  &__row {
    @include ribbon.row;
  }
}
</style>
