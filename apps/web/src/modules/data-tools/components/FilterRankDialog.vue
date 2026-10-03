<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

type RankCondition = Extract<SheetFilterCondition, { kind: "rank" }>;
const props = defineProps<{ visible: boolean; initial?: RankCondition; disabled?: boolean }>();
const emit = defineEmits<{ close: []; apply: [condition: RankCondition] }>();
const { t } = useAppI18n();
const root = ref<HTMLElement | null>(null);
const popupProps = { attach: () => root.value ?? document.body };
const bottom = ref(false);
const percent = ref(false);
const count = ref<number | undefined>(10);
const valid = computed(
  () =>
    typeof count.value === "number" &&
    Number.isFinite(count.value) &&
    count.value > 0 &&
    (percent.value ? count.value <= 100 : Number.isInteger(count.value) && count.value <= 500),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    bottom.value = props.initial?.bottom ?? false;
    percent.value = props.initial?.percent ?? false;
    count.value = props.initial?.count ?? 10;
  },
  { immediate: true },
);
function apply(): void {
  if (!props.disabled && valid.value)
    emit("apply", {
      kind: "rank",
      bottom: bottom.value,
      percent: percent.value,
      count: count.value!,
    });
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.filter.topItemsTitle')"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('dataTools.common.confirm'), disabled: disabled || !valid }"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    @confirm="apply"
  >
    <div ref="root" class="filter-rank-dialog">
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
        :min="percent ? 0.01 : 1"
        :max="percent ? 100 : 500"
        :decimal-places="percent ? 2 : 0"
        :disabled="disabled"
        :aria-label="t('dataTools.filter.rankCount')"
        theme="column"
        class="idea-input-number--persistent-controls"
      />
      <TSelect
        v-model="percent"
        :options="[
          { value: false, label: t('dataTools.filter.items') },
          { value: true, label: t('dataTools.filter.percent') },
        ]"
        :disabled="disabled"
        :popup-props="popupProps"
        :aria-label="t('dataTools.filter.rankUnit')"
      />
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.filter-rank-dialog {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--idea-space-4);
}
</style>
