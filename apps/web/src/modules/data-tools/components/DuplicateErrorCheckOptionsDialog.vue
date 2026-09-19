<script setup lang="ts">
import { ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import type { ErrorCheckSettings } from "../duplicate-error-preferences";
import ErrorIndicatorColorControl from "./ErrorIndicatorColorControl.vue";

const props = defineProps<{
  visible: boolean;
  settings: ErrorCheckSettings;
  ignoredCount: number;
}>();
const emit = defineEmits<{
  close: [];
  confirm: [payload: { settings: ErrorCheckSettings; resetIgnored: boolean }];
}>();
const { t } = useAppI18n();
const draft = ref<ErrorCheckSettings>({ ...props.settings });
const resetIgnored = ref(false);

function restoreDraft(): void {
  draft.value = { ...props.settings };
  resetIgnored.value = false;
}
function close(): void {
  restoreDraft();
  emit("close");
}
function confirm(): void {
  emit("confirm", { settings: { ...draft.value }, resetIgnored: resetIgnored.value });
  close();
}
function toggleResetIgnored(): void {
  if (props.ignoredCount > 0) resetIgnored.value = !resetIgnored.value;
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) restoreDraft();
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    width="min(580px, calc(100vw - 32px))"
    :visible="visible"
    :header="t('dataTools.duplicates.errorChecks.title')"
    :aria-label="t('dataTools.duplicates.errorChecks.title')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="close"
  >
    <div v-if="visible" class="duplicate-error-check-options-dialog">
      <section class="duplicate-error-check-options-dialog__section">
        <h3>{{ t("dataTools.duplicates.errorChecks.settings") }}</h3>
        <TCheckbox v-model="draft.enabled" data-duplicate-error-checks-enabled>
          {{ t("dataTools.duplicates.errorChecks.enabled") }}
        </TCheckbox>
        <span class="duplicate-error-check-options-dialog__field-label">
          {{ t("dataTools.duplicates.errorChecks.indicatorColor") }}
        </span>
        <ErrorIndicatorColorControl
          :model-value="draft.indicatorColor"
          :label="t('dataTools.duplicates.errorChecks.indicatorColor')"
          :automatic-label="t('dataTools.duplicates.errorChecks.automaticColor')"
          :disabled="!draft.enabled"
          @select="draft.indicatorColor = $event"
        />
      </section>
      <section class="duplicate-error-check-options-dialog__section">
        <h3>{{ t("dataTools.duplicates.errorChecks.rules") }}</h3>
        <div class="duplicate-error-check-options-dialog__rules">
          <TCheckbox v-model="draft.duplicateEntries" :disabled="!draft.enabled">
            <span class="duplicate-error-check-options-dialog__rule-label">{{
              t("dataTools.duplicates.errorChecks.duplicateEntries")
            }}</span>
          </TCheckbox>
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.formulaError") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.numberStoredAsText") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.twoDigitYear") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.inconsistentFormula") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.formulaOmittingCells") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.unlockedFormula") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.formulaRefersToEmpty") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.dataValidation") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.leadingTrailingSpaces") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.calculatedColumn") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.calculationIncomplete") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
          <TCheckbox disabled
            ><span class="duplicate-error-check-options-dialog__rule-label"
              >{{ t("dataTools.duplicates.errorChecks.irregularDate") }}
              <em>{{ t("dataTools.duplicates.errorChecks.unavailable") }}</em></span
            ></TCheckbox
          >
        </div>
      </section>
      <section class="duplicate-error-check-options-dialog__section">
        <TButton
          variant="outline"
          :disabled="ignoredCount === 0"
          :title="
            ignoredCount === 0 ? t('dataTools.duplicates.errorChecks.resetIgnoredHint') : undefined
          "
          :class="{ 'is-selected': resetIgnored }"
          data-duplicate-error-reset-ignored
          @click="toggleResetIgnored"
          >{{
            t("dataTools.duplicates.errorChecks.resetIgnored", { count: ignoredCount })
          }}</TButton
        >
        <p v-if="resetIgnored">
          {{ t("dataTools.duplicates.errorChecks.resetPending", { count: ignoredCount }) }}
        </p>
      </section>
    </div>
    <template #footer>
      <TButton variant="outline" data-duplicate-error-cancel @click="close">{{
        t("dataTools.duplicates.errorChecks.cancel")
      }}</TButton>
      <TButton theme="primary" data-duplicate-error-confirm @click="confirm">{{
        t("dataTools.duplicates.errorChecks.confirm")
      }}</TButton>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.duplicate-error-check-options-dialog {
  display: grid;
  gap: var(--idea-space-4);
  &__section {
    display: grid;
    gap: var(--idea-space-2);
  }
  h3,
  p {
    margin: 0;
  }
  h3 {
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  p {
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-medium);
  }
  &__field-label {
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
  }
  &__rules {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--idea-space-2) var(--idea-space-4);
  }
  &__rule-label {
    min-width: 0;
    white-space: normal;
  }
  &__rule-label em {
    margin-left: var(--idea-space-1);
    color: var(--idea-text-disabled);
    font-size: var(--idea-font-size-body-small);
    font-style: normal;
  }
}
@media (max-width: 520px) {
  .duplicate-error-check-options-dialog__rules {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
