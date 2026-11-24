<script setup lang="ts">
import { ref } from "vue";
import { Alert as TAlert } from "tdesign-vue-next/es/alert";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SparklineDataOptions } from "../useSparklineDataOptions";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  initial: SparklineDataOptions;
  disabled: boolean;
  failed: boolean;
}>();
const emit = defineEmits<{ confirm: [patch: SparklineDataOptions]; close: [] }>();
const { t } = useAppI18n();
const empty = ref(props.initial.empty);
const showHidden = ref(props.initial.showHidden);
function confirm(): void {
  if (props.disabled) return;
  emit("confirm", {
    ...(empty.value !== undefined && empty.value !== props.initial.empty
      ? { empty: empty.value }
      : {}),
    ...(showHidden.value !== undefined && showHidden.value !== props.initial.showHidden
      ? { showHidden: showHidden.value }
      : {}),
  });
}
</script>

<template>
  <Dialog
    :visible="true"
    :header="t('sparkline.dataOptionsTitle')"
    :aria-label="t('sparkline.dataOptionsTitle')"
    role="dialog"
    aria-modal="true"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <Form
      class="sparkline-data-options sheetcraft-form-grid"
      label-align="top"
      :prevent-submit-default="true"
    >
      <FormItem :label="t('sparkline.emptyDisplay')">
        <div class="sparkline-data-options__card">
          <RadioGroup
            v-model="empty"
            role="radiogroup"
            :aria-label="t('sparkline.emptyDisplay')"
            :disabled="disabled"
            class="sparkline-data-options__choices"
          >
            <Radio value="gap">{{ t("sparkline.gap") }}</Radio>
            <Radio value="zero">{{ t("sparkline.zero") }}</Radio>
            <Radio value="connect">{{ t("sparkline.connect") }}</Radio>
          </RadioGroup>
        </div>
      </FormItem>
      <div class="sparkline-data-options__card">
        <Checkbox
          :checked="showHidden === true"
          :indeterminate="showHidden === undefined"
          :disabled="disabled"
          @change="showHidden = Boolean($event)"
          >{{ t("sparkline.showHiddenData") }}</Checkbox
        >
      </div>
      <TAlert v-if="failed" theme="error" :message="t('sparkline.failed')" role="alert" />
    </Form>
  </Dialog>
</template>

<style scoped lang="scss">
.sparkline-data-options {
  display: grid;
  gap: 10px;
  &__card {
    width: 100%;
    padding: 9px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__choices {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
  }
}
</style>
