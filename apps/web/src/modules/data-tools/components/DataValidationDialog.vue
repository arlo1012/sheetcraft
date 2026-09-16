<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
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
    :aria-label="t('dataTools.validation.title')"
    :visible="visible"
    :header="t('dataTools.validation.title')"
    :cancel-btn="t('dataTools.common.cancel')"
    @close="emit('close')"
    ><template #footer
      ><TButton variant="text" @click="emit('clear')">{{ t("dataTools.validation.clear") }}</TButton
      ><span class="validation-dialog__space" /><TButton variant="outline" @click="emit('close')">{{
        t("dataTools.common.cancel")
      }}</TButton
      ><TButton
        theme="primary"
        :disabled="!canApply"
        @click="emit('apply', serializeValidationDraft(draft, dateSystem))"
        >{{ t("dataTools.validation.confirm") }}</TButton
      ></template
    ><TTabs v-model="activeTab"
      ><TTabPanel value="settings" :label="t('dataTools.validation.settings')"
        ><div class="validation-dialog">
          <label
            >{{ t("dataTools.validation.allow")
            }}<TSelect v-model="draft.type" :options="types" /></label
          ><template v-if="draft.type !== 'any' && draft.type !== 'list' && draft.type !== 'custom'"
            ><label
              >{{ t("dataTools.validation.operator")
              }}<TSelect v-model="draft.operator" :options="operators" /></label
            ><label
              >{{ t("dataTools.validation.minimum")
              }}<TInput
                v-model="draft.minimum"
                :placeholder="
                  draft.type === 'date' ? 'YYYY-MM-DD' : draft.type === 'time' ? 'HH:mm' : ''
                " /></label
            ><label v-if="needsSecond"
              >{{ t("dataTools.validation.maximum")
              }}<TInput
                v-model="draft.maximum"
                :placeholder="
                  draft.type === 'date' ? 'YYYY-MM-DD' : draft.type === 'time' ? 'HH:mm' : ''
                " /></label></template
          ><label v-if="draft.type === 'list'"
            >{{ t("dataTools.validation.source") }}<TInput v-model="draft.source" /></label
          ><label v-if="draft.type === 'custom'"
            >{{ t("dataTools.validation.source") }}<TInput v-model="draft.source" /></label
          ><label
            ><TCheckbox v-model="draft.ignoreBlank" />{{
              t("dataTools.validation.ignoreBlank")
            }}</label
          ><label v-if="draft.type === 'list'"
            ><TCheckbox v-model="draft.showDropdown" />{{
              t("dataTools.validation.dropdown")
            }}</label
          >
        </div></TTabPanel
      ><TTabPanel value="input" :label="t('dataTools.validation.inputMessage')"
        ><div class="validation-dialog">
          <label
            ><TCheckbox v-model="draft.showInputMessage" />{{
              t("dataTools.validation.showMessage")
            }}</label
          ><label
            >{{ t("dataTools.validation.titleLabel") }}<TInput v-model="draft.inputTitle" /></label
          ><label
            >{{ t("dataTools.validation.message") }}<TInput v-model="draft.inputMessage"
          /></label></div></TTabPanel
      ><TTabPanel value="error" :label="t('dataTools.validation.errorAlert')"
        ><div class="validation-dialog">
          <label
            ><TCheckbox v-model="draft.showErrorAlert" />{{
              t("dataTools.validation.errorAlert")
            }}</label
          ><label
            >{{ t("dataTools.validation.style")
            }}<TSelect
              v-model="draft.errorStyle"
              :options="[
                { label: t('dataTools.validation.stop'), value: 'stop' },
                { label: t('dataTools.validation.warning'), value: 'warning' },
                { label: t('dataTools.validation.information'), value: 'information' },
              ]" /></label
          ><label
            >{{ t("dataTools.validation.titleLabel") }}<TInput v-model="draft.errorTitle" /></label
          ><label
            >{{ t("dataTools.validation.message") }}<TInput v-model="draft.errorMessage"
          /></label></div></TTabPanel></TTabs
  ></Dialog>
</template>
<style scoped lang="scss">
.validation-dialog {
  display: grid;
  gap: var(--idea-space-3);
  min-width: min(440px, calc(100vw - 64px));
  label {
    display: grid;
    gap: var(--idea-space-1);
  }
  &__space {
    flex: 1;
  }
}
</style>
