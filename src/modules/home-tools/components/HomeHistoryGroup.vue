<script setup lang="ts">
import { Eraser, Paintbrush, Redo2, Undo2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const emit = defineEmits<{
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
      <RibbonIconAction
        :label="t('ribbon.undo')"
        data-ribbon-action="undo"
        @activate="emit('undo')"
      >
        <Undo2 :size="16" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('ribbon.redo')"
        data-ribbon-action="redo"
        @activate="emit('redo')"
      >
        <Redo2 :size="16" aria-hidden="true" />
      </RibbonIconAction>
    </div>
    <div class="home-history-group__row" data-ribbon-row="2">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.formatPainter') })"
        disabled
        data-ribbon-placeholder="format-painter"
      >
        <Paintbrush :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.clearFormatting') })"
        disabled
        data-ribbon-placeholder="clear-formatting"
      >
        <Eraser :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-history-group {
  @include ribbon.compact;

  padding-right: 8px;
  padding-left: 8px;

  &__row {
    @include ribbon.row;
  }
}
</style>
