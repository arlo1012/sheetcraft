<script setup lang="ts">
import { ChartNoAxesColumn, CirclePlus, Table2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import ImageInsertMenu from "./ImageInsertMenu.vue";
import RibbonIconAction from "./RibbonIconAction.vue";

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
    <RibbonIconAction
      class="home-insert-group__insert"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.insert') })"
      :text="t('ribbon.insert')"
      disabled
      disclosure
      data-ribbon-layout="tall"
      data-ribbon-placeholder="insert"
      data-ribbon-span="2"
    >
      <CirclePlus :size="17" aria-hidden="true" />
    </RibbonIconAction>
    <ImageInsertMenu
      class="home-insert-group__image"
      :disabled="disabled"
      @insert-image="emit('insertImage', $event)"
    />
    <div class="home-insert-group__stack" data-ribbon-stack="chart-pivot">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.chart') })"
        :text="t('ribbon.chart')"
        disabled
        disclosure
        data-ribbon-placeholder="chart"
        data-ribbon-row="1"
      >
        <ChartNoAxesColumn :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.pivotTable') })"
        :text="t('ribbon.pivotTable')"
        disabled
        disclosure
        data-ribbon-placeholder="pivot-table"
        data-ribbon-row="2"
      >
        <Table2 :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-insert-group {
  @include ribbon.mixed(58px 58px max-content);

  &__insert,
  &__image,
  &__stack {
    grid-row: 1 / 3;
  }

  &__insert {
    grid-column: 1;
  }

  &__image {
    grid-column: 2;
  }

  &__stack {
    @include ribbon.stack;

    grid-column: 3;
    min-width: 84px;
  }
}
</style>
