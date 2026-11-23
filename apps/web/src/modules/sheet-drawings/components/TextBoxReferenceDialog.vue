<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import type { TextBoxReferenceDialog } from "../useTextBoxReference";
const props = defineProps<{
  request: TextBoxReferenceDialog;
  disabled: boolean;
  busy: boolean;
  error?: "invalid" | "stale" | "unavailable" | "apply";
  suspended?: boolean;
  selectReference: (current: string) => Promise<string | undefined>;
}>();
const { t } = useAppI18n();
const source = ref(props.request.initial);
const sourceSheetId = ref(props.request.sheetId);
const sheets = computed(() =>
  props.request.sheets.map((sheet) => ({ value: sheet.id, label: sheet.name })),
);
const preview = computed(() => props.request.preview(source.value, sourceSheetId.value));
function confirm() {
  if (!props.disabled) void props.request.confirm(source.value, sourceSheetId.value);
}
</script>
<template>
  <Dialog
    :visible="!suspended"
    :header="t('drawing.textBoxReferenceTitle')"
    width="min(480px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-btn="{
      content: t(
        request.replacesContent
          ? 'drawing.textBoxReferenceReplace'
          : 'drawing.textBoxReferenceApply',
      ),
      disabled,
      loading: busy,
    }"
    :cancel-btn="{ content: t('picture.cancel'), disabled: busy }"
    @confirm="confirm"
    @close="request.close"
  >
    <div class="textbox-reference-dialog" data-textbox-reference-dialog>
      <p class="textbox-reference-dialog__name">{{ request.name }}</p>
      <p v-if="request.linked" class="textbox-reference-dialog__hint">
        {{ t("drawing.textBoxReferenceReadonly") }}
      </p>
      <Form
        class="textbox-reference-dialog__form sheetcraft-form-grid"
        label-align="top"
        :prevent-submit-default="true"
      >
        <FormItem :label="t('drawing.textBoxReferenceSheet')"
          ><Select
            v-model="sourceSheetId"
            :options="sheets"
            :disabled="disabled"
            v-native-control="{ attributes: { 'aria-label': t('drawing.textBoxReferenceSheet') } }"
        /></FormItem>
        <FormItem :label="t('drawing.textBoxReferenceSource')"
          ><div class="textbox-reference-dialog__reference">
            <RangeReferenceInput
              v-model="source"
              :label="t('drawing.textBoxReferenceSource')"
              :disabled="disabled"
              :select-reference="selectReference"
            /></div></FormItem
      ></Form>
      <p class="textbox-reference-dialog__hint">{{ t("drawing.textBoxReferenceHint") }}</p>
      <p v-if="request.replacesContent" class="textbox-reference-dialog__warning">
        {{ t("drawing.textBoxReferenceOverwrite") }}
      </p>
      <div class="textbox-reference-dialog__preview" aria-live="polite">
        <strong>{{ t("drawing.preview") }}</strong
        ><span>{{
          preview === undefined
            ? t("drawing.textBoxReferenceInvalid")
            : preview || t("drawing.textBoxReferenceBlank")
        }}</span>
      </div>
      <p v-if="error" role="alert">
        {{
          t(
            error === "invalid"
              ? "drawing.textBoxReferenceInvalid"
              : error === "stale"
                ? "drawing.textBoxReferenceStale"
                : error === "unavailable"
                  ? "drawing.textBoxReferenceUnavailable"
                  : "drawing.changeRejected",
          )
        }}
      </p>
      <Button
        v-if="request.linked"
        theme="default"
        variant="base"
        :disabled="disabled"
        @click="request.unlink"
        >{{ t("drawing.textBoxReferenceUnlink") }}</Button
      >
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.textbox-reference-dialog {
  display: grid;
  gap: 10px;
  p {
    margin: 0;
  }
  &__form {
    display: grid;
    gap: 10px;
  }
  &__reference {
    width: 100%;
  }
  &__name {
    font-weight: 600;
  }
  &__hint {
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 1.6;
  }
  &__warning {
    color: var(--sheetcraft-status-warning-strong);
    line-height: 1.6;
  }
  &__preview {
    display: grid;
    gap: 6px;
    min-height: 64px;
    max-height: 168px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    background: var(--sheetcraft-surface-dialog-card);
    border-radius: var(--sheetcraft-radius-dialog-card);
  }
}
</style>
