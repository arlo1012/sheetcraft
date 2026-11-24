<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import DialogFooter from "../../../shared/dialog/DialogFooter.vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import {
  DEFAULT_ERROR_CHECK_SETTINGS,
  ERROR_CHECK_RULE_KEYS,
  type ErrorCheckRuleKey,
  type ErrorCheckSettings,
} from "../duplicate-error-preferences";

const props = defineProps<{
  visible: boolean;
  settings: ErrorCheckSettings;
  ignoredCount: number;
}>();
const emit = defineEmits<{
  close: [];
  confirm: [payload: { settings: ErrorCheckSettings; resetIgnored: boolean }];
}>();

const { t, locale } = useAppI18n();
const draft = ref<ErrorCheckSettings>({ ...DEFAULT_ERROR_CHECK_SETTINGS, ...props.settings });
const resetIgnored = ref(false);

const RULE_ITEMS: ReadonlyArray<Readonly<{ key: ErrorCheckRuleKey; labelKey: MessageKey }>> = [
  { key: "duplicateEntries", labelKey: "dataTools.duplicates.errorChecks.duplicateEntries" },
  { key: "formulaError", labelKey: "dataTools.duplicates.errorChecks.formulaError" },
  { key: "numberStoredAsText", labelKey: "dataTools.duplicates.errorChecks.numberStoredAsText" },
  { key: "twoDigitYear", labelKey: "dataTools.duplicates.errorChecks.twoDigitYear" },
  { key: "inconsistentFormula", labelKey: "dataTools.duplicates.errorChecks.inconsistentFormula" },
  {
    key: "formulaOmittingCells",
    labelKey: "dataTools.duplicates.errorChecks.formulaOmittingCells",
  },
  { key: "unlockedFormula", labelKey: "dataTools.duplicates.errorChecks.unlockedFormula" },
  {
    key: "formulaRefersToEmpty",
    labelKey: "dataTools.duplicates.errorChecks.formulaRefersToEmpty",
  },
  { key: "dataValidation", labelKey: "dataTools.duplicates.errorChecks.dataValidation" },
  {
    key: "leadingTrailingSpaces",
    labelKey: "dataTools.duplicates.errorChecks.leadingTrailingSpaces",
  },
  { key: "calculatedColumn", labelKey: "dataTools.duplicates.errorChecks.calculatedColumn" },
  {
    key: "calculationIncomplete",
    labelKey: "dataTools.duplicates.errorChecks.calculationIncomplete",
  },
  { key: "irregularDate", labelKey: "dataTools.duplicates.errorChecks.irregularDate" },
];

const allRulesSelected = computed(() => ERROR_CHECK_RULE_KEYS.every((key) => draft.value[key]));
const isDefaultRules = computed(() =>
  ERROR_CHECK_RULE_KEYS.every((key) => draft.value[key] === DEFAULT_ERROR_CHECK_SETTINGS[key]),
);

function restoreDraft(): void {
  draft.value = { ...DEFAULT_ERROR_CHECK_SETTINGS, ...props.settings };
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
function selectAllRules(): void {
  const next = { ...draft.value };
  for (const key of ERROR_CHECK_RULE_KEYS) next[key] = true;
  draft.value = next;
}
function restoreDefaultRules(): void {
  const next = { ...draft.value };
  for (const key of ERROR_CHECK_RULE_KEYS) next[key] = DEFAULT_ERROR_CHECK_SETTINGS[key];
  draft.value = next;
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
    v-if="visible"
    role="dialog"
    aria-modal="true"
    placement="center"
    width="min(620px, calc(100vw - 32px))"
    :visible="visible"
    :header="t('dataTools.duplicates.errorChecks.title')"
    :aria-label="t('dataTools.duplicates.errorChecks.title')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="close"
  >
    <TForm
      v-if="visible"
      class="duplicate-error-check-options-dialog sheetcraft-form-grid"
      label-align="left"
      :label-width="locale === 'zh-CN' ? 92 : 140"
      :prevent-submit-default="true"
    >
      <section class="duplicate-error-check-options-dialog__card">
        <h3>{{ t("dataTools.duplicates.errorChecks.settings") }}</h3>
        <div class="duplicate-error-check-options-dialog__settings-row">
          <TCheckbox
            v-model="draft.enabled"
            class="duplicate-error-check-options-dialog__enabled"
            data-duplicate-error-checks-enabled
          >
            {{ t("dataTools.duplicates.errorChecks.enabled") }}
          </TCheckbox>
          <TButton
            size="small"
            :theme="resetIgnored ? 'primary' : 'default'"
            :variant="resetIgnored ? 'outline' : 'base'"
            :disabled="ignoredCount === 0"
            :title="
              ignoredCount === 0
                ? t('dataTools.duplicates.errorChecks.resetIgnoredHint')
                : undefined
            "
            :aria-pressed="resetIgnored"
            data-duplicate-error-reset-ignored
            @click="toggleResetIgnored"
            >{{
              t("dataTools.duplicates.errorChecks.resetIgnored", { count: ignoredCount })
            }}</TButton
          >
        </div>
        <TFormItem
          class="duplicate-error-check-options-dialog__color-item"
          :label="t('dataTools.duplicates.errorChecks.indicatorColor')"
        >
          <div class="duplicate-error-check-options-dialog__color-control">
            <ColorPaletteSelect
              :model-value="draft.indicatorColor"
              :label="t('dataTools.duplicates.errorChecks.indicatorColor')"
              default-color="#008a00"
              :default-label="t('dataTools.duplicates.errorChecks.automaticColor')"
              :disabled="!draft.enabled"
              size="small"
              show-value
              data-error-indicator-color-control
              @select="draft.indicatorColor = $event"
            />
          </div>
        </TFormItem>
      </section>

      <section class="duplicate-error-check-options-dialog__card">
        <div class="duplicate-error-check-options-dialog__card-header">
          <h3>{{ t("dataTools.duplicates.errorChecks.rules") }}</h3>
          <div class="duplicate-error-check-options-dialog__rule-actions">
            <TButton
              size="small"
              variant="text"
              theme="default"
              :disabled="!draft.enabled || allRulesSelected"
              data-duplicate-error-select-all
              @click="selectAllRules"
              >{{ t("dataTools.duplicates.errorChecks.selectAllRules") }}</TButton
            >
            <TButton
              size="small"
              variant="text"
              theme="default"
              :disabled="!draft.enabled || isDefaultRules"
              data-duplicate-error-restore-defaults
              @click="restoreDefaultRules"
              >{{ t("dataTools.duplicates.errorChecks.restoreDefaultRules") }}</TButton
            >
          </div>
        </div>
        <div class="duplicate-error-check-options-dialog__rules">
          <TCheckbox
            v-for="item in RULE_ITEMS"
            :key="item.key"
            v-model="draft[item.key]"
            :disabled="!draft.enabled"
            :data-error-check-rule="item.key"
          >
            <span class="duplicate-error-check-options-dialog__rule-label">{{
              t(item.labelKey)
            }}</span>
          </TCheckbox>
        </div>
      </section>
    </TForm>
    <template #footer>
      <DialogFooter
        :status="
          resetIgnored
            ? t('dataTools.duplicates.errorChecks.resetPending', { count: ignoredCount })
            : undefined
        "
        theme="info"
      >
        <TButton theme="default" variant="base" data-duplicate-error-cancel @click="close">{{
          t("dataTools.duplicates.errorChecks.cancel")
        }}</TButton>
        <TButton theme="primary" variant="base" data-duplicate-error-confirm @click="confirm">{{
          t("dataTools.duplicates.errorChecks.confirm")
        }}</TButton>
      </DialogFooter>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.duplicate-error-check-options-dialog {
  display: grid;
  gap: 12px;
  min-width: 0;
  color: var(--sheetcraft-text-primary);
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);

  &__card {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px 14px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }

  &__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  &__rule-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  &__settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  &__color-control {
    width: 180px;
    max-width: 100%;
  }

  h3 {
    margin: 0;
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    font-weight: var(--sheetcraft-font-weight-semibold);
  }

  &__rules {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    justify-items: start;
    gap: 8px 16px;
  }

  &__rule-label {
    min-width: 0;
    white-space: normal;
  }
}

@media (max-width: 520px) {
  .duplicate-error-check-options-dialog__rules {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
