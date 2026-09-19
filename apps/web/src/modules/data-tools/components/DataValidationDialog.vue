<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { useAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import type { RangeReferenceSelectionOptions } from "../../../shared/range-reference/useRangeReferencePicker";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { DataValidationDraft, DataValidationInitial } from "../data-tools-types";
import {
  createValidationDraft,
  isValidationDraftComplete,
  serializeValidationDraft,
} from "../validation-draft";
const props = withDefaults(
  defineProps<{
    visible: boolean;
    initial?: DataValidationInitial;
    dateSystem?: ExcelDateSystem;
    suspended?: boolean;
    selectReference?: (
      current: string,
      options?: RangeReferenceSelectionOptions,
    ) => Promise<string | undefined>;
  }>(),
  { initial: undefined, dateSystem: "1900", suspended: false, selectReference: undefined },
);
const emit = defineEmits<{ close: []; apply: [draft: DataValidationDraft]; clear: [] }>();
const { t } = useAppI18n();
const empty = (): DataValidationDraft => ({
  type: "any",
  operator: "between",
  minimum: "",
  maximum: "",
  source: "",
  ignoreBlank: true,
  showDropdown: true,
  inputTitle: "",
  inputMessage: "",
  showInputMessage: false,
  errorTitle: "",
  errorMessage: "",
  errorStyle: "stop",
  showErrorAlert: true,
});
const draft = ref<DataValidationDraft>(empty());
const activeTab = ref("settings");
const operators = computed(() =>
  [
    "between",
    "notBetween",
    "equal",
    "notEqual",
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
  ].map((value) => ({
    value,
    label: t(
      `dataTools.filter.${value === "equal" ? "equals" : value === "notEqual" ? "notEquals" : value}` as "dataTools.filter.equals",
    ),
  })),
);
const types = computed(() =>
  ["any", "whole", "decimal", "list", "date", "time", "text-length", "custom"].map((value) => ({
    value,
    label: t(
      `dataTools.validation.${value === "text-length" ? "textLength" : value}` as "dataTools.validation.any",
    ),
  })),
);
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    activeTab.value = "settings";
    draft.value = createValidationDraft(props.initial, props.dateSystem, empty);
  },
);
const needsSecond = computed(
  () => draft.value.operator === "between" || draft.value.operator === "notBetween",
);
const canApply = computed(() => isValidationDraftComplete(draft.value, props.dateSystem));
const boundPlaceholder = computed(() =>
  t(
    draft.value.type === "date"
      ? "dataTools.validation.dateBoundPlaceholder"
      : draft.value.type === "time"
        ? "dataTools.validation.timeBoundPlaceholder"
        : "dataTools.validation.boundPlaceholder",
  ),
);
async function selectBoundReference(current: string): Promise<string | undefined> {
  return selectDraftReference(current, true);
}
async function selectSourceReference(current: string): Promise<string | undefined> {
  return selectDraftReference(current, false);
}
async function selectDraftReference(
  current: string,
  singleCell: boolean,
): Promise<string | undefined> {
  const original = draft.value;
  const selected = await props.selectReference?.(current, { singleCell });
  return props.visible && draft.value === original ? selected : undefined;
}
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    placement="center"
    dialog-class-name="data-validation-dialog"
    width="min(640px, calc(100vw - 32px))"
    :aria-label="t('dataTools.validation.title')"
    :visible="visible && !suspended"
    :header="t('dataTools.validation.title')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @close="emit('close')"
  >
    <TTabs v-model="activeTab" class="validation-dialog">
      <TTabPanel value="settings" :label="t('dataTools.validation.settings')">
        <div class="validation-dialog__form">
          <div class="validation-dialog__field">
            <span>{{ t("dataTools.validation.allow") }}</span>
            <TSelect
              v-model="draft.type"
              :options="types"
              :aria-label="t('dataTools.validation.allow')"
            />
          </div>
          <template v-if="draft.type !== 'any' && draft.type !== 'list' && draft.type !== 'custom'">
            <div class="validation-dialog__field">
              <span>{{ t("dataTools.validation.operator") }}</span>
              <TSelect
                v-model="draft.operator"
                :options="operators"
                :aria-label="t('dataTools.validation.operator')"
              />
            </div>
            <div class="validation-dialog__field">
              <span>{{ t("dataTools.validation.minimum") }}</span>
              <RangeReferenceInput
                v-model="draft.minimum"
                :label="t('dataTools.validation.minimum')"
                :pick-label="t('dataTools.validation.pickMinimum')"
                :placeholder="boundPlaceholder"
                :select-reference="selectReference ? selectBoundReference : undefined"
              />
            </div>
            <div v-if="needsSecond" class="validation-dialog__field">
              <span>{{ t("dataTools.validation.maximum") }}</span>
              <RangeReferenceInput
                v-model="draft.maximum"
                :label="t('dataTools.validation.maximum')"
                :pick-label="t('dataTools.validation.pickMaximum')"
                :placeholder="boundPlaceholder"
                :select-reference="selectReference ? selectBoundReference : undefined"
              />
            </div>
          </template>
          <div
            v-if="draft.type === 'list' || draft.type === 'custom'"
            class="validation-dialog__field"
          >
            <span>{{ t("dataTools.validation.source") }}</span>
            <RangeReferenceInput
              v-model="draft.source"
              :label="t('dataTools.validation.source')"
              :pick-label="
                t(
                  draft.type === 'custom'
                    ? 'dataTools.validation.pickFormulaReference'
                    : 'dataTools.validation.pickSource',
                )
              "
              :placeholder="
                t(
                  draft.type === 'custom'
                    ? 'dataTools.validation.formulaPlaceholder'
                    : 'dataTools.validation.listPlaceholder',
                )
              "
              :insert-reference="draft.type === 'custom'"
              :select-reference="selectReference ? selectSourceReference : undefined"
            />
          </div>
          <div class="validation-dialog__options">
            <TCheckbox v-model="draft.ignoreBlank">{{
              t("dataTools.validation.ignoreBlank")
            }}</TCheckbox>
            <TCheckbox v-if="draft.type === 'list'" v-model="draft.showDropdown">{{
              t("dataTools.validation.dropdown")
            }}</TCheckbox>
          </div>
        </div>
      </TTabPanel>
      <TTabPanel value="input" :label="t('dataTools.validation.inputMessage')">
        <div class="validation-dialog__form">
          <div class="validation-dialog__options">
            <TCheckbox v-model="draft.showInputMessage">{{
              t("dataTools.validation.showMessage")
            }}</TCheckbox>
          </div>
          <div class="validation-dialog__field">
            <span>{{ t("dataTools.validation.titleLabel") }}</span>
            <TInput v-model="draft.inputTitle" :aria-label="t('dataTools.validation.titleLabel')" />
          </div>
          <div class="validation-dialog__field validation-dialog__field--multiline">
            <span>{{ t("dataTools.validation.message") }}</span>
            <TTextarea
              v-model="draft.inputMessage"
              :aria-label="t('dataTools.validation.message')"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </div>
        </div>
      </TTabPanel>
      <TTabPanel value="error" :label="t('dataTools.validation.errorAlert')">
        <div class="validation-dialog__form">
          <div class="validation-dialog__options">
            <TCheckbox v-model="draft.showErrorAlert">{{
              t("dataTools.validation.errorAlert")
            }}</TCheckbox>
          </div>
          <div class="validation-dialog__field">
            <span>{{ t("dataTools.validation.style") }}</span>
            <TSelect
              v-model="draft.errorStyle"
              :aria-label="t('dataTools.validation.style')"
              :options="[
                { label: t('dataTools.validation.stop'), value: 'stop' },
                { label: t('dataTools.validation.warning'), value: 'warning' },
                { label: t('dataTools.validation.information'), value: 'information' },
              ]"
            />
          </div>
          <div class="validation-dialog__field">
            <span>{{ t("dataTools.validation.titleLabel") }}</span>
            <TInput v-model="draft.errorTitle" :aria-label="t('dataTools.validation.titleLabel')" />
          </div>
          <div class="validation-dialog__field validation-dialog__field--multiline">
            <span>{{ t("dataTools.validation.errorAlert") }}</span>
            <TTextarea
              v-model="draft.errorMessage"
              :aria-label="t('dataTools.validation.errorAlert')"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </div>
        </div>
      </TTabPanel>
    </TTabs>
    <template #footer>
      <TButton variant="text" @click="emit('clear')">{{ t("dataTools.validation.clear") }}</TButton>
      <TButton theme="default" @click="emit('close')">{{ t("dataTools.common.cancel") }}</TButton>
      <TButton
        theme="primary"
        :disabled="!canApply"
        @click="emit('apply', serializeValidationDraft(draft, dateSystem))"
        >{{ t("dataTools.validation.confirm") }}</TButton
      >
    </template>
  </Dialog>
</template>
<style scoped lang="scss">
.validation-dialog {
  min-width: 0;

  &__form {
    display: grid;
    padding-top: var(--idea-space-6);
    max-height: calc(100dvh - 240px);
    overflow: auto;
    align-content: start;
    gap: var(--idea-space-4);
  }

  &__field {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: var(--idea-space-4);
    min-width: 0;

    > span {
      text-align: right;
    }

    &--multiline {
      align-items: start;

      > span {
        padding-top: var(--idea-space-2);
      }
    }
  }

  &__options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--idea-space-4) var(--idea-space-6);
    padding-left: 80px;
  }

  @media (max-width: 560px) {
    &__field {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--idea-space-2);
    }

    &__options {
      padding-left: 0;
    }
  }
}
</style>
