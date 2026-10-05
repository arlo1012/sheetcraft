<script setup lang="ts">
import {
  TableProperties,
  ChartColumnIncreasing,
  RefreshCw,
  Settings2,
  Table2,
} from "lucide-vue-next";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
defineProps<{ disabled: boolean; hasPivot: boolean; manageDisabled: boolean }>();
const emit = defineEmits<{ insert: [chart: boolean]; refresh: []; edit: []; remove: [] }>();
const { t } = useAppI18n();
</script>
<template>
  <section class="pivot-insert-tools" role="group" :aria-label="t('pivot.title')">
    <RibbonButton
      variant="tall"
      :label="t('pivot.title')"
      :text="t('pivot.title')"
      :disabled="disabled"
      data-insert-tool="pivot-table"
      @activate="emit('insert', false)"
      ><TableProperties /></RibbonButton
    ><RibbonButton
      variant="tall"
      :label="t('pivot.chart')"
      :text="t('pivot.chart')"
      :disabled="disabled"
      data-insert-tool="pivot-chart"
      @activate="emit('insert', true)"
      ><ChartColumnIncreasing
    /></RibbonButton>
    <div v-if="hasPivot" class="pivot-insert-tools__stack">
      <RibbonButton
        :label="t('pivot.refresh')"
        :text="t('pivot.refresh')"
        :disabled="manageDisabled"
        @activate="emit('refresh')"
        ><RefreshCw /></RibbonButton
      ><RibbonButton
        :label="t('pivot.edit')"
        :text="t('pivot.edit')"
        :disabled="manageDisabled"
        @activate="emit('edit')"
        ><Settings2
      /></RibbonButton>
    </div>
    <RibbonButton
      v-if="hasPivot"
      variant="tall"
      :label="t('pivot.convert')"
      :text="t('pivot.convert')"
      :disabled="manageDisabled"
      @activate="emit('remove')"
      ><Table2
    /></RibbonButton>
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.pivot-insert-tools {
  @include ribbon.columns;
  &__stack {
    @include ribbon.stack;
  }
}
</style>
