<script setup lang="ts">
import { ref, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { useAppI18n } from "../../../shared/i18n";

type Resolution = "independent" | "remove";

const props = defineProps<{
  visible: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  continue: [resolution: Resolution];
}>();
const { t } = useAppI18n();
const resolution = ref<Resolution>("independent");

function close(): void {
  if (props.busy) return;
  emit("update:visible", false);
}

function continueWithSelection(): void {
  if (props.busy) return;
  emit("continue", resolution.value);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) resolution.value = "independent";
  },
);
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('pageDecoration.backgroundWatermarkConflictTitle')"
    :confirm-btn="{
      content: t('pageDecoration.continue'),
      loading: busy,
      disabled: busy,
    }"
    :cancel-btn="t('pageDecoration.cancel')"
    :close-on-overlay-click="false"
    width="min(480px, calc(100vw - 32px))"
    placement="center"
    @confirm="continueWithSelection"
    @close="close"
  >
    <div class="background-watermark-conflict-dialog">
      <p>{{ t("pageDecoration.backgroundWatermarkConflictPrompt") }}</p>
      <TRadioGroup
        v-model="resolution"
        class="background-watermark-conflict-dialog__choices"
        :disabled="busy"
      >
        <TRadio value="independent" class="background-watermark-conflict-dialog__choice">
          <span class="background-watermark-conflict-dialog__choice-content">
            <strong>{{ t("pageDecoration.switchWatermarkMode") }}</strong>
            <span>{{ t("pageDecoration.switchWatermarkModeDescription") }}</span>
          </span>
        </TRadio>
        <TRadio value="remove" class="background-watermark-conflict-dialog__choice">
          <span class="background-watermark-conflict-dialog__choice-content">
            <strong>{{ t("pageDecoration.removeWatermarkAndInsert") }}</strong>
            <span>{{ t("pageDecoration.removeWatermarkAndInsertDescription") }}</span>
          </span>
        </TRadio>
      </TRadioGroup>
    </div>
  </TDialog>
</template>

<style scoped lang="scss">
.background-watermark-conflict-dialog {
  display: grid;
  gap: 16px;

  p {
    margin: 0;
    color: var(--td-text-color-primary);
  }

  &__choices {
    display: grid;
    gap: 16px;
  }

  &__choice {
    display: flex;
    align-items: start;
    gap: 8px;
    margin: 0;
    padding: 0;

    &-content {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    strong {
      color: var(--td-text-color-primary);
      font-weight: 600;
    }

    span {
      color: var(--td-text-color-secondary);
      line-height: 1.5;
    }
  }
}
</style>
