<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

type RankCondition = Extract<SheetFilterCondition, { kind: "rank" }> & {
  mode?: "items" | "percent" | "sum";
};
const props = defineProps<{ initial?: RankCondition; disabled?: boolean; pivotUnits?: boolean }>();
const emit = defineEmits<{ "update:condition": [condition: RankCondition | undefined] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const popupProps = { attach: () => root.value ?? document.body };
const bottom = ref(false);
const unit = ref<"items" | "percent" | "sum">("items");
const percent = computed(() => unit.value === "percent");
const count = ref<number | undefined>(10);
const valid = computed(
  () =>
    typeof count.value === "number" &&
    Number.isFinite(count.value) &&
    count.value > 0 &&
    (unit.value === "sum"
      ? props.pivotUnits
      : percent.value
        ? count.value <= 100
        : Number.isInteger(count.value) && count.value <= 500),
);
watch(
  () => props.initial,
  () => {
    bottom.value = props.initial?.bottom ?? false;
    unit.value = props.initial?.mode ?? (props.initial?.percent ? "percent" : "items");
    count.value = props.initial?.count ?? 10;
  },
  { immediate: true },
);
const condition = computed<RankCondition | undefined>(() =>
  valid.value
    ? {
        kind: "rank",
        bottom: bottom.value,
        percent: percent.value,
        count: count.value!,
        ...(props.pivotUnits ? { mode: unit.value } : {}),
      }
    : undefined,
);
watch(condition, (value) => emit("update:condition", value), { immediate: true });
</script>
<template>
  <div ref="root" class="filter-rank-editor">
    <TSelect
      v-model="bottom"
      :options="[
        { value: false, label: t('dataTools.filter.top') },
        { value: true, label: t('dataTools.filter.bottom') },
      ]"
      :disabled="disabled"
      :popup-props="popupProps"
      :aria-label="t('dataTools.filter.rankDirection')"
    />
    <TInputNumber
      v-model="count"
      :min="unit === 'items' ? 1 : 0.01"
      :max="unit === 'sum' ? Number.MAX_SAFE_INTEGER : percent ? 100 : 500"
      :decimal-places="unit === 'items' ? 0 : 2"
      :disabled="disabled"
      :aria-label="t('dataTools.filter.rankCount')"
      theme="column"
      class="idea-input-number--persistent-controls"
    />
    <TSelect
      v-model="unit"
      :options="[
        { value: 'items', label: t('dataTools.filter.items') },
        { value: 'percent', label: t('dataTools.filter.percent') },
        ...(pivotUnits ? [{ value: 'sum', label: t('pivot.rankSum') }] : []),
      ]"
      :disabled="disabled"
      :popup-props="popupProps"
      :aria-label="t('dataTools.filter.rankUnit')"
    />
  </div>
</template>
<style scoped lang="scss">
.filter-rank-editor {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--idea-space-4);
}
</style>
