<script setup lang="ts">
import { ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import OptionList from "../../../shared/option-list/OptionList.vue";
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
    placement="center"
    width="min(640px, calc(100vw - 32px))"
    :visible="visible"
    :header="t('dataTools.duplicates.errorChecks.optionsTitle')"
    :aria-label="t('dataTools.duplicates.errorChecks.title')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="close"
  >
    <div v-if="visible" class="duplicate-error-check-options-dialog">
      <div class="duplicate-error-check-options-dialog__categories">
        <h3>{{ t("cellFormat.category") }}</h3>
        <OptionList
          class="duplicate-error-check-options-dialog__category-list"
          model-value="error-checking"
          :options="[
            { value: 'error-checking', label: t('dataTools.duplicates.errorChecks.category') },
          ]"
          :label="t('cellFormat.category')"
          variant="navigation"
        />
      </div>
      <div class="duplicate-error-check-options-dialog__content">
        <section class="duplicate-error-check-options-dialog__section">
          <h3>{{ t("dataTools.duplicates.errorChecks.settings") }}</h3>
          <TCheckbox
            v-model="draft.enabled"
            class="duplicate-error-check-options-dialog__enabled"
            data-duplicate-error-checks-enabled
          >
            {{ t("dataTools.duplicates.errorChecks.enabled") }}
          </TCheckbox>
          <div class="duplicate-error-check-options-dialog__color-row">
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
          </div>
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
        <section class="duplicate-error-check-options-dialog__reset">
          <TButton
            variant="outline"
            :disabled="ignoredCount === 0"
            :title="
              ignoredCount === 0
                ? t('dataTools.duplicates.errorChecks.resetIgnoredHint')
                : undefined
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
    </div>
    <template #footer>
      <div class="duplicate-error-check-options-dialog__actions">
        <TButton variant="outline" data-duplicate-error-cancel @click="close">{{
          t("dataTools.duplicates.errorChecks.cancel")
        }}</TButton>
        <TButton theme="primary" data-duplicate-error-confirm @click="confirm">{{
          t("dataTools.duplicates.errorChecks.confirm")
        }}</TButton>
      </div>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.duplicate-error-check-options-dialog {
  display: grid;
  grid-template-columns: 144px minmax(0, 1fr);
  gap: 16px;
  max-height: calc(100dvh - 192px);
  min-height: 0;
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

  &__categories {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }

  &__category-list {
    flex: 1;
    min-height: 0;
  }

  &__content {
    display: grid;
    align-content: start;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }

  &__section {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }

  p {
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }

  &__color-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__field-label {
    color: var(--idea-text-primary);
  }

  &__rules {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
    gap: 4px;
  }

  &__rule-label {
    min-width: 0;
    white-space: normal;

    em {
      margin-left: 4px;
      color: var(--idea-text-disabled);
      font-size: var(--idea-font-size-body-small);
      font-style: normal;
    }
  }

  &__reset {
    display: grid;
    justify-items: start;
    gap: 4px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
