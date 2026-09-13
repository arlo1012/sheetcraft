<script setup lang="ts">
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { ChartNoAxesColumn, CirclePlus, Table2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import ImageInsertMenu from "./ImageInsertMenu.vue";

defineProps<{ disabled: boolean }>();
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"] }>();
const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-insert-group"
    data-ribbon-group="insert"
    role="group"
    :aria-label="t('ribbon.insertTools')"
  >
    <RibbonMenuButton
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.insert') })"
      :text="t('ribbon.insert')"
      disabled
      data-ribbon-layout="tall"
      data-ribbon-placeholder="insert"
      data-ribbon-span="2"
    >
      <CirclePlus :size="17" aria-hidden="true" />
    </RibbonMenuButton>
    <ImageInsertMenu :disabled="disabled" @insert-image="emit('insertImage', $event)" />
    <div class="home-insert-group__stack" data-ribbon-stack="chart-pivot">
      <RibbonMenuButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.chart') })"
        :text="t('ribbon.chart')"
        disabled
        data-ribbon-placeholder="chart"
        data-ribbon-row="1"
      >
        <ChartNoAxesColumn :size="15" aria-hidden="true" />
      </RibbonMenuButton>
      <RibbonMenuButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.pivotTable') })"
        :text="t('ribbon.pivotTable')"
        disabled
        data-ribbon-placeholder="pivot-table"
        data-ribbon-row="2"
      >
        <Table2 :size="15" aria-hidden="true" />
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

    min-width: 84px;
  }
}
</style>
