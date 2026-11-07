<script setup lang="ts">
import { ref } from "vue";
import {
  Activity,
  ChartColumn,
  ChartNoAxesColumnIncreasing,
  Group,
  Ungroup,
} from "lucide-vue-next";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SparklinePointKind } from "@sheetcraft/core/sparklines";
import type { SparklineToolContext, SparklineStylePatch } from "../useSparklineTools";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import SparklineClearMenu from "./SparklineClearMenu.vue";
import SparklineAxisMenu from "./SparklineAxisMenu.vue";
import type { SparklineAxisEnd } from "../useSparklineAxisLimit";
import SparklineColorMenu from "./SparklineColorMenu.vue";
import SparklineDataMenu from "./SparklineDataMenu.vue";
import SparklineStyleGallery from "./SparklineStyleGallery.vue";
const props = defineProps<{ context: SparklineToolContext }>();
const emit = defineEmits<{ dataOptions: []; dateAxis: []; customAxis: [end: SparklineAxisEnd] }>();
const { t } = useAppI18n();
const failed = ref(false);
function apply(patch: SparklineStylePatch): void {
  failed.value = !props.context.apply(patch);
}
function point(key: SparklinePointKind, show: boolean): void {
  apply({ [key]: { show } });
}
</script>
<template>
  <RibbonToolbar :label="t('sparkline.tools')">
    <section class="sparkline-tools__group" role="group" :aria-label="t('sparkline.editData')">
      <SparklineDataMenu :context="context" @data-options="emit('dataOptions')" />
    </section>
    <section class="sparkline-tools__group" role="group" :aria-label="t('sparkline.type')">
      <RibbonButton
        variant="tall"
        :label="t('chart.line')"
        :text="t('chart.line')"
        :pressed="!context.mixed.includes('type') && context.value.type === 'line'"
        :disabled="context.disabled"
        @activate="apply({ type: 'line' })"
        ><Activity
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('chart.column')"
        :text="t('chart.column')"
        :pressed="!context.mixed.includes('type') && context.value.type === 'column'"
        :disabled="context.disabled"
        @activate="apply({ type: 'column' })"
        ><ChartColumn
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('sparkline.winLoss')"
        :text="t('sparkline.winLoss')"
        :pressed="!context.mixed.includes('type') && context.value.type === 'winLoss'"
        :disabled="context.disabled"
        @activate="apply({ type: 'winLoss' })"
        ><ChartNoAxesColumnIncreasing
      /></RibbonButton>
    </section>
    <section
      class="sparkline-tools__group sparkline-tools__points"
      role="group"
      :aria-label="t('sparkline.show')"
    >
      <div class="sparkline-tools__stack">
        <Checkbox
          :checked="!!context.value.highPoint?.show"
          :indeterminate="context.mixedPointVisibility.includes('highPoint')"
          :disabled="context.disabled"
          @change="point('highPoint', Boolean($event))"
          >{{ t("sparkline.highPoint") }}</Checkbox
        >
        <Checkbox
          :checked="!!context.value.lowPoint?.show"
          :indeterminate="context.mixedPointVisibility.includes('lowPoint')"
          :disabled="context.disabled"
          @change="point('lowPoint', Boolean($event))"
          >{{ t("sparkline.lowPoint") }}</Checkbox
        >
      </div>
      <div class="sparkline-tools__stack">
        <Checkbox
          :checked="context.value.negativePoints !== false"
          :indeterminate="context.mixed.includes('negativePoints')"
          :disabled="context.disabled"
          @change="apply({ negativePoints: Boolean($event) })"
          >{{ t("sparkline.negativePoints") }}</Checkbox
        >
        <Checkbox
          :checked="!!context.value.firstPoint?.show"
          :indeterminate="context.mixedPointVisibility.includes('firstPoint')"
          :disabled="context.disabled"
          @change="point('firstPoint', Boolean($event))"
          >{{ t("sparkline.firstPoint") }}</Checkbox
        >
      </div>
      <div class="sparkline-tools__stack">
        <Checkbox
          :checked="!!context.value.lastPoint?.show"
          :indeterminate="context.mixedPointVisibility.includes('lastPoint')"
          :disabled="context.disabled"
          @change="point('lastPoint', Boolean($event))"
          >{{ t("sparkline.lastPoint") }}</Checkbox
        >
        <Checkbox
          :checked="context.value.markers"
          :indeterminate="context.mixed.includes('markers')"
          :disabled="
            context.disabled || context.mixed.includes('type') || context.value.type !== 'line'
          "
          @change="apply({ markers: Boolean($event) })"
          >{{ t("sparkline.markers") }}</Checkbox
        >
      </div>
    </section>
    <section class="sparkline-tools__group" data-ribbon-group>
      <SparklineStyleGallery :context="context" @failed="failed = true" />
    </section>
    <section class="sparkline-tools__group" role="group" :aria-label="t('sparkline.colors')">
      <div class="sparkline-tools__stack">
        <SparklineColorMenu :context="context" @failed="failed = true" /><SparklineColorMenu
          :context="context"
          points
          @failed="failed = true"
        />
      </div>
    </section>
    <section class="sparkline-tools__group" role="group" :aria-label="t('sparkline.axisMenu')">
      <SparklineAxisMenu
        :context="context"
        @custom="emit('customAxis', $event)"
        @date="emit('dateAxis')"
        @failed="failed = true"
      />
      <div class="sparkline-tools__stack">
        <RibbonButton
          :label="t('sparkline.group')"
          :text="t('sparkline.group')"
          :disabled="context.disabled || !context.canGroup"
          @activate="failed = !context.group()"
          ><Group
        /></RibbonButton>
        <RibbonButton
          :label="t('sparkline.ungroup')"
          :text="t('sparkline.ungroup')"
          :disabled="context.disabled || !context.canUngroup"
          @activate="failed = !context.ungroup()"
          ><Ungroup
        /></RibbonButton>
      </div>
      <SparklineClearMenu :context="context" @failed="failed = true" />
    </section>
    <p v-if="failed" class="sparkline-tools__error" role="alert">
      {{ t("sparkline.operationFailed") }}
    </p>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.sparkline-tools {
  &__group {
    @include ribbon.columns;
  }
  &__stack {
    @include ribbon.stack;
  }
  &__points {
    gap: 10px;
  }
  &__error {
    color: var(--sheetcraft-status-error);
    margin: 0;
    font-size: 12px;
    max-width: 220px;
  }
}
</style>
