<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import type { SparklineLimitDraft } from "../useSparklineAxisLimit";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ initial: SparklineLimitDraft; failed: boolean }>();
const emit = defineEmits<{ confirm: [value: number]; close: [] }>();
const { t } = useAppI18n();
const text = ref(props.initial.value?.toString() ?? "");
const value = computed(() => {
  const source = text.value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(source)) return undefined;
  const number = Number(source);
  return Number.isFinite(number) ? number : undefined;
});
const label = computed(() =>
  t(props.initial.end === "minAxis" ? "sparkline.axisMinimum" : "sparkline.axisMaximum"),
);
function confirm() {
  if (value.value !== undefined) emit("confirm", value.value);
}
</script>
<template>
  <Dialog
    :visible="true"
    role="dialog"
    aria-modal="true"
    :header="t('sparkline.axisLimitTitle')"
    :aria-label="t('sparkline.axisLimitTitle')"
    width="min(360px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: value === undefined }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <Form class="sheetcraft-form-grid" label-align="top" :prevent-submit-default="true">
      <FormItem :label="label"
        ><TInput
          v-model="text"
          autofocus
          v-native-control="{ attributes: { 'aria-label': label, inputmode: 'decimal' } }"
      /></FormItem>
    </Form>
    <p v-if="failed" class="axis-limit-error" role="alert">{{ t("sparkline.axisLimitFailed") }}</p>
  </Dialog>
</template>
<style scoped lang="scss">
.axis-limit-error {
  color: var(--sheetcraft-status-error);
  margin: 8px 0 0;
}
</style>
