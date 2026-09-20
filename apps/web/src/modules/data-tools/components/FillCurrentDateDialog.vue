<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import OptionList from "../../../shared/option-list/OptionList.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { FillCurrentDateDraft } from "../fill-tool-types";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial: FillCurrentDateDraft;
    error?: string;
    rangeLabel?: string;
  }>(),
  { error: "", rangeLabel: "" },
);
const emit = defineEmits<{ close: []; apply: [draft: FillCurrentDateDraft] }>();
const { t } = useAppI18n();
const draft = ref<FillCurrentDateDraft>({ ...props.initial });
watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = { ...props.initial };
  },
);
watch(
  () => props.initial,
  (value) => {
    if (props.visible) draft.value = { ...value };
  },
  { deep: true },
);
function formatDate(format: string): string {
  const { year, month, day } = draft.value;
  return format
    .replace("yyyy", String(year))
    .replace("mm", String(month).padStart(2, "0"))
    .replace("m", String(month))
    .replace("dd", String(day).padStart(2, "0"))
    .replace("d", String(day));
}
const formatOptions = computed(() =>
  ["yyyy-mm-dd", "yyyy/m/d", "yyyy年m月d日", "m/d/yyyy"].map((value) => ({
    value,
    label: formatDate(value),
  })),
);
const sample = computed(() => formatDate(draft.value.format));
</script>
<template>
  <Dialog
    :visible="visible"
    :header="t('dataTools.fill.currentDateTitle')"
    width="min(400px, calc(100vw - 32px))"
    :confirm-btn="t('dataTools.fill.apply')"
    :cancel-btn="t('dataTools.fill.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
    @confirm="emit('apply', { ...draft })"
  >
    <div class="fill-dialog">
      <p v-if="rangeLabel" class="fill-dialog__range">
        {{ t("dataTools.fill.range", { range: rangeLabel }) }}
      </p>
      <p class="fill-dialog__hint">{{ t("dataTools.fill.staticDate") }}</p>
      <div class="fill-dialog__group">
        <span>{{ t("dataTools.fill.dateFormat") }}</span
        ><OptionList
          :model-value="draft.format"
          :options="formatOptions"
          :label="t('dataTools.fill.dateFormat')"
          @select="draft.format = $event"
        />
      </div>
      <p class="fill-dialog__sample">{{ t("dataTools.fill.dateSample", { date: sample }) }}</p>
      <p v-if="error" class="fill-dialog__error" role="alert">{{ error }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "./fill-dialog";

.fill-dialog {
  @include fill-dialog.surface;
}
.fill-dialog__range,
.fill-dialog__hint,
.fill-dialog__sample,
.fill-dialog__error {
  @include fill-dialog.auxiliary-text;
}
.fill-dialog__range,
.fill-dialog__hint {
  @include fill-dialog.subdued-text;
}
.fill-dialog__error {
  color: var(--idea-status-error);
}
.fill-dialog__group {
  @include fill-dialog.group;
}
</style>
