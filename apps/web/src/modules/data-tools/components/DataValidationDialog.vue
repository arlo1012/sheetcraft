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
  }>(),
  { initial: undefined, dateSystem: "1900" },
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
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    placement="center"
    width="min(640px, calc(100vw - 32px))"
    :aria-label="t('dataTools.validation.title')"
    :visible="visible"
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
              <TInput
                v-model="draft.minimum"
                :aria-label="t('dataTools.validation.minimum')"
                :placeholder="
                  draft.type === 'date' ? 'YYYY-MM-DD' : draft.type === 'time' ? 'HH:mm' : ''
                "
              />
            </div>
            <div v-if="needsSecond" class="validation-dialog__field">
              <span>{{ t("dataTools.validation.maximum") }}</span>
              <TInput
                v-model="draft.maximum"
                :aria-label="t('dataTools.validation.maximum')"
                :placeholder="
                  draft.type === 'date' ? 'YYYY-MM-DD' : draft.type === 'time' ? 'HH:mm' : ''
                "
              />
            </div>
          </template>
          <div
            v-if="draft.type === 'list' || draft.type === 'custom'"
            class="validation-dialog__field"
          >
            <span>{{ t("dataTools.validation.source") }}</span>
            <TInput v-model="draft.source" :aria-label="t('dataTools.validation.source')" />
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
          <TCheckbox v-model="draft.showInputMessage">{{
            t("dataTools.validation.showMessage")
          }}</TCheckbox>
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
          <TCheckbox v-model="draft.showErrorAlert">{{
            t("dataTools.validation.errorAlert")
          }}</TCheckbox>
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
      <div class="validation-dialog__footer">
        <TButton variant="text" @click="emit('clear')">{{
          t("dataTools.validation.clear")
        }}</TButton>
        <div class="validation-dialog__actions">
          <TButton variant="outline" @click="emit('close')">{{
            t("dataTools.common.cancel")
          }}</TButton>
          <TButton
            theme="primary"
            :disabled="!canApply"
            @click="emit('apply', serializeValidationDraft(draft, dateSystem))"
            >{{ t("dataTools.validation.confirm") }}</TButton
          >
        </div>
      </div>
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

  &__footer,
  &__actions {
    display: flex;
    align-items: center;
    gap: var(--idea-space-4);
  }

  &__footer {
    justify-content: space-between;
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
