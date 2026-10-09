<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import type { PivotValueCondition, PivotValueField } from "@sheetcraft/core/pivot-tables";
import type { SheetFilterCondition } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import FilterConditionEditor from "../../../shared/filter/components/FilterConditionEditor.vue";
import FilterRankEditor from "../../../shared/filter/components/FilterRankEditor.vue";
import type { FilterConditionAction } from "../../../shared/filter/filter-condition-actions";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    measures: readonly PivotValueField[];
    initialMeasure: number;
    initial?: PivotValueCondition;
    action?: FilterConditionAction;
    disabled?: boolean;
  }>(),
  { action: "custom" },
);
const emit = defineEmits<{
  apply: [value: { measure: number; condition: PivotValueCondition }];
  close: [];
}>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const measure = ref(props.initialMeasure);
const condition = ref<SheetFilterCondition>();
const average = computed(() => props.action === "aboveAverage" || props.action === "belowAverage");
const above = computed({
  get: () =>
    condition.value?.kind === "average" ? condition.value.above : props.action === "aboveAverage",
  set: (value: boolean) => {
    condition.value = { kind: "average", above: value };
  },
});
const rankInitial = computed(() => (props.initial?.kind === "rank" ? props.initial : undefined));
const popupProps = { attach: () => root.value ?? document.body };
const valid = computed(
  () =>
    !props.disabled &&
    Number.isInteger(measure.value) &&
    measure.value >= 0 &&
    measure.value < props.measures.length &&
    !!condition.value,
);
watch(
  () => [props.visible, props.action] as const,
  () => {
    if (!props.visible) return;
    measure.value = props.initialMeasure;
    condition.value = average.value
      ? { kind: "average", above: props.action === "aboveAverage" }
      : undefined;
  },
  { immediate: true },
);
function apply(): void {
  if (valid.value && condition.value)
    emit("apply", { measure: measure.value, condition: condition.value as PivotValueCondition });
}
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('pivot.valueFilters')"
    width="min(440px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: !valid }"
    :cancel-btn="t('dataTools.common.cancel')"
    @confirm="apply"
    @close="emit('close')"
  >
    <div ref="root" class="pivot-value-filter-dialog">
      <div class="pivot-value-filter-dialog__measure">
        <span>{{ t("pivot.filterMeasure") }}</span>
        <Select
          v-model="measure"
          :options="measures.map((value, index) => ({ value: index, label: value.caption }))"
          :popup-props="popupProps"
          :aria-label="t('pivot.filterMeasure')"
          :disabled="disabled"
        />
      </div>
      <template v-if="visible">
        <FilterRankEditor
          v-if="action === 'rank'"
          @update:condition="condition = $event"
          :initial="rankInitial"
          pivot-units
          :disabled="disabled"
        />
        <Select
          v-else-if="average"
          v-model="above"
          :options="[
            { value: true, label: t('dataTools.filter.aboveAverage') },
            { value: false, label: t('dataTools.filter.belowAverage') },
          ]"
          :popup-props="popupProps"
          :aria-label="t('dataTools.filter.filterType')"
          :disabled="disabled"
        />
        <FilterConditionEditor
          v-else
          @update:condition="condition = $event"
          kind="number"
          :initial="initial"
          :action="action"
          :values="[]"
          date-system="1900"
          :disabled="disabled"
          strict-kind
        />
      </template>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.pivot-value-filter-dialog {
  display: grid;
  gap: var(--sheetcraft-space-4);
  &__measure {
    display: grid;
    gap: var(--sheetcraft-space-2);
  }
}
</style>
