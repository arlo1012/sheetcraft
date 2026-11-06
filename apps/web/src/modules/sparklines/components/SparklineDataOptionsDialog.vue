<script setup lang="ts">
import { ref, useId } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
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
const labelId = `sparkline-empty-${useId()}`;
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
    width="min(420px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="sparkline-data-options">
      <div class="sparkline-data-options__empty">
        <span :id="labelId">{{ t("sparkline.emptyDisplay") }}</span>
        <RadioGroup
          v-model="empty"
          role="radiogroup"
          :aria-labelledby="labelId"
          :disabled="disabled"
          class="sparkline-data-options__choices"
        >
          <Radio value="gap">{{ t("sparkline.gap") }}</Radio>
          <Radio value="zero">{{ t("sparkline.zero") }}</Radio>
          <Radio value="connect">{{ t("sparkline.connect") }}</Radio>
        </RadioGroup>
      </div>
      <Checkbox
        :checked="showHidden === true"
        :indeterminate="showHidden === undefined"
        :disabled="disabled"
        @change="showHidden = Boolean($event)"
        >{{ t("sparkline.showHiddenData") }}</Checkbox
      >
      <p v-if="failed" class="sparkline-data-options__error" role="alert">
        {{ t("sparkline.failed") }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.sparkline-data-options {
  display: grid;
  gap: 16px;
  &__empty {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px 16px;
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
