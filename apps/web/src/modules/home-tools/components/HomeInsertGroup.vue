<script setup lang="ts">
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { ChartNoAxesColumn, Link2, Table2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import ImageInsertMenu from "./ImageInsertMenu.vue";

defineProps<{ disabled: boolean; hyperlinkDisabled?: boolean; imageDisabled?: boolean }>();
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"]; insertHyperlink: [] }>();
const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-insert-group"
    data-ribbon-group="insert"
    role="group"
    :aria-label="t('ribbon.insertTools')"
  >
    <RibbonButton
      variant="tall"
      :label="t('hyperlinks.insert')"
      :text="t('hyperlinks.insert')"
      :disabled="hyperlinkDisabled ?? disabled"
      data-ribbon-action="insert-hyperlink"
      @activate="emit('insertHyperlink')"
      ><Link2 aria-hidden="true"
    /></RibbonButton>
    <ImageInsertMenu
      :disabled="imageDisabled ?? disabled"
      @insert-image="emit('insertImage', $event)"
    />
    <div class="home-insert-group__stack" data-ribbon-stack="chart-pivot">
      <RibbonMenuButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.chart') })"
        :text="t('ribbon.chart')"
        disabled
        data-ribbon-placeholder="chart"
        data-ribbon-row="1"
      >
        <ChartNoAxesColumn aria-hidden="true" />
      </RibbonMenuButton>
      <RibbonMenuButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.pivotTable') })"
        :text="t('ribbon.pivotTable')"
        disabled
        data-ribbon-placeholder="pivot-table"
        data-ribbon-row="2"
      >
        <Table2 aria-hidden="true" />
      </RibbonMenuButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-insert-group {
  @include ribbon.columns;

  &__stack {
    @include ribbon.stack;
  }
}
</style>
