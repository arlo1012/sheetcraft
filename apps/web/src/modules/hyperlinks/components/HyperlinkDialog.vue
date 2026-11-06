<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { TabPanel as TTabPanel, Tabs as TTabs } from "tdesign-vue-next/es/tabs";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import type { HyperlinkDraft, HyperlinkInput } from "../useHyperlinksController";
import {
  readHyperlinkTarget,
  createLocationHyperlink,
  createEmailHyperlink,
  type HyperlinkKind,
} from "../hyperlink-target";

const props = withDefaults(
  defineProps<{
    draft: HyperlinkDraft;
    error?: string;
    sheets?: readonly { id: string; name: string }[];
    currentSheetName?: string;
  }>(),
  { sheets: () => [], currentSheetName: "" },
);
const emit = defineEmits<{ confirm: [value: HyperlinkInput]; remove: []; cancel: [] }>();
const { t, locale } = useAppI18n();
const displayText = ref(props.draft.displayText);
const initial = readHyperlinkTarget(props.draft.target, props.currentSheetName);
const kind = ref<HyperlinkKind>(initial.kind);
const webAddress = ref(initial.webAddress);
const sheetName = ref(initial.sheetName);
const cellReference = ref(initial.cellReference);
const emailAddress = ref(initial.emailAddress);
const emailSubject = ref(initial.emailSubject);
const target = computed(() => {
  if (kind.value === "web") return webAddress.value;
  if (kind.value === "email") {
    if (
      initial.kind === "email" &&
      emailAddress.value === initial.emailAddress &&
      emailSubject.value === initial.emailSubject
    )
      return props.draft.target;
    return createEmailHyperlink(emailAddress.value, emailSubject.value, initial.emailParameters);
  }
  if (
    initial.kind === "location" &&
    sheetName.value === initial.sheetName &&
    cellReference.value === initial.cellReference
  )
    return props.draft.target;
  return createLocationHyperlink(sheetName.value, cellReference.value);
});
const tooltip = ref(props.draft.tooltip);
</script>

<template>
  <Dialog
    :visible="true"
    :header="t(draft.hasLink ? 'hyperlinks.edit' : 'hyperlinks.insert')"
    :confirm-btn="{ content: t('hyperlinks.confirm'), disabled: !target.trim() }"
    :cancel-btn="t('hyperlinks.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(600px, calc(100vw - 32px))"
    placement="center"
    @confirm="emit('confirm', { target, tooltip, displayText })"
    @close="emit('cancel')"
  >
    <Form
      class="hyperlink-dialog sheetcraft-form-grid"
      label-align="right"
      :label-width="locale === 'zh-CN' ? 100 : 136"
      :prevent-submit-default="true"
    >
      <FormItem :label="t('hyperlinks.displayText')">
        <TInput
          v-model="displayText"
          :disabled="!draft.canEditDisplay"
          v-native-control="{ attributes: { 'aria-label': t('hyperlinks.displayText') } }"
          data-hyperlink-text
        />
      </FormItem>
      <p v-if="!draft.canEditDisplay" class="hyperlink-dialog__hint">
        {{ t("hyperlinks.formulaTextHint") }}
      </p>
      <TTabs v-model="kind" class="hyperlink-dialog__targets">
        <TTabPanel value="web" :label="t('hyperlinks.web')">
          <div class="hyperlink-dialog__target-fields">
            <FormItem :label="t('hyperlinks.address')">
              <TInput
                v-model="webAddress"
                placeholder="https://"
                autofocus
                v-native-control="{ attributes: { 'aria-label': t('hyperlinks.address') } }"
                data-hyperlink-target
              />
            </FormItem>
          </div>
        </TTabPanel>
        <TTabPanel value="location" :label="t('hyperlinks.location')">
          <div class="hyperlink-dialog__target-fields">
            <FormItem :label="t('hyperlinks.sheet')">
              <TSelect
                v-model="sheetName"
                v-native-control="{ attributes: { 'aria-label': t('hyperlinks.sheet') } }"
                :options="sheets.map((sheet) => ({ value: sheet.name, label: sheet.name }))"
                data-hyperlink-sheet
              />
            </FormItem>
            <FormItem :label="t('hyperlinks.cellReference')">
              <TInput
                v-model="cellReference"
                placeholder="A1"
                v-native-control="{ attributes: { 'aria-label': t('hyperlinks.cellReference') } }"
                data-hyperlink-reference
              />
            </FormItem>
          </div>
        </TTabPanel>
        <TTabPanel value="email" :label="t('hyperlinks.email')">
          <div class="hyperlink-dialog__target-fields">
            <FormItem :label="t('hyperlinks.emailAddress')">
              <TInput
                v-model="emailAddress"
                v-native-control="{ attributes: { 'aria-label': t('hyperlinks.emailAddress') } }"
                data-hyperlink-email
              />
            </FormItem>
            <FormItem :label="t('hyperlinks.emailSubject')">
              <TInput
                v-model="emailSubject"
                v-native-control="{ attributes: { 'aria-label': t('hyperlinks.emailSubject') } }"
                data-hyperlink-subject
              />
            </FormItem>
          </div>
        </TTabPanel>
      </TTabs>
      <FormItem :label="t('hyperlinks.tooltip')">
        <TInput
          v-model="tooltip"
          v-native-control="{ attributes: { 'aria-label': t('hyperlinks.tooltip') } }"
          data-hyperlink-tooltip
        />
      </FormItem>
      <p v-if="error" class="hyperlink-dialog__error" role="alert">{{ error }}</p>
      <TButton
        v-if="draft.hasLink"
        class="hyperlink-dialog__remove"
        theme="default"
        variant="base"
        @click="emit('remove')"
        >{{ t("hyperlinks.remove") }}</TButton
      >
    </Form>
  </Dialog>
</template>

<style scoped lang="scss">
.hyperlink-dialog {
  display: grid;
  gap: 12px;
  align-items: center;
  &__targets {
    min-width: 0;
  }
  &__target-fields {
    display: grid;
    gap: 12px;
    align-items: center;
    padding-block: 16px;
  }
  &__hint,
  &__error {
    margin: 0;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
  &__remove {
    justify-self: start;
  }
}
</style>
