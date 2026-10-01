<script setup lang="ts">
import { computed } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { ColorPicker as TColorPicker } from "tdesign-vue-next/es/color-picker";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { Bold, Italic, Underline } from "lucide-vue-next";
import {
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterOptions,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import type { HeaderFooterEditorAction, HeaderFooterEditContext } from "../header-footer-editor";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  setup: SheetPageSetup;
  context?: HeaderFooterEditContext;
  disabled: boolean;
}>();
const emit = defineEmits<{
  action: [action: HeaderFooterEditorAction];
  optionsChange: [value: SheetHeaderFooterOptions];
}>();
const { t } = useAppI18n();
const options = computed(() => getSheetHeaderFooterOptions(props.setup));
const fonts = ["Arial", "Calibri", "Aptos", "Times New Roman", "Courier New"].map((value) => ({
  label: value,
  value,
}));
const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24].map((value) => ({
  label: String(value),
  value,
}));
function patchOptions(patch: Partial<SheetHeaderFooterOptions>): void {
  emit("optionsChange", { ...options.value, ...patch });
}
function format(patch: Extract<HeaderFooterEditorAction, { type: "format" }>["patch"]): void {
  if (props.context) emit("action", { type: "format", patch });
}
function selectFont(value: SelectValue): void {
  if (typeof value === "string") format({ fontFamily: value });
}
function selectSize(value: SelectValue): void {
  if (typeof value === "number") format({ fontSize: value });
}
function selectColor(value: string): void {
  format({ color: value.replace(/^#/, "") });
}
</script>

<template>
  <section
    class="page-header-footer-toolbar"
    :aria-label="t('pageLayout.headerFooterEditHint')"
    :aria-description="t('pageLayout.headerFooterSectionFormatHint')"
    :title="t('pageLayout.headerFooterSectionFormatHint')"
    data-page-header-footer-toolbar
  >
    <template v-if="context">
      <label>
        <span class="ui-visually-hidden">{{ t("pageLayout.headerFooterFont") }}</span>
        <TSelect
          :model-value="context.format.fontFamily"
          :options="fonts"
          :disabled="disabled"
          @change="selectFont"
        />
      </label>
      <label>
        <span class="ui-visually-hidden">{{ t("pageLayout.headerFooterFontSize") }}</span>
        <TSelect
          :model-value="context.format.fontSize"
          :options="sizes"
          :disabled="disabled"
          @change="selectSize"
        />
      </label>
      <TButton
        variant="text"
        :disabled="disabled"
        :aria-label="t('pageLayout.headerFooterBold')"
        :aria-pressed="context.format.bold"
        @click="format({ bold: !context.format.bold })"
        ><Bold :size="16"
      /></TButton>
      <TButton
        variant="text"
        :disabled="disabled"
        :aria-label="t('pageLayout.headerFooterItalic')"
        :aria-pressed="context.format.italic"
        @click="format({ italic: !context.format.italic })"
        ><Italic :size="16"
      /></TButton>
      <TButton
        variant="text"
        :disabled="disabled"
        :aria-label="t('pageLayout.headerFooterUnderline')"
        :aria-pressed="context.format.underline"
        @click="format({ underline: !context.format.underline })"
        ><Underline :size="16"
      /></TButton>
      <label>
        <span class="ui-visually-hidden">{{ t("pageLayout.headerFooterColor") }}</span>
        <TColorPicker
          :model-value="`#${context.format.color}`"
          format="HEX"
          :popup-props="{ overlayClassName: 'page-header-footer-toolbar__popup' }"
          :disabled="disabled"
          @change="selectColor"
        />
      </label>
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'pageNumber' })"
        >{{ t("pageLayout.headerFooterPageNumber") }}</TButton
      >
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'pageCount' })"
        >{{ t("pageLayout.headerFooterPageCount") }}</TButton
      >
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'sheetName' })"
        >{{ t("pageLayout.headerFooterSheetName") }}</TButton
      >
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'fileName' })"
        >{{ t("pageLayout.headerFooterFileName") }}</TButton
      >
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'date' })"
        >{{ t("pageLayout.headerFooterDate") }}</TButton
      >
      <TButton
        variant="text"
        :disabled="disabled"
        @click="emit('action', { type: 'insertField', field: 'time' })"
        >{{ t("pageLayout.headerFooterTime") }}</TButton
      >
      <TButton variant="text" :disabled="disabled" @click="emit('action', { type: 'finish' })">{{
        t("pageLayout.headerFooterFinish")
      }}</TButton>
      <TButton variant="text" :disabled="disabled" @click="emit('action', { type: 'cancel' })">{{
        t("pageLayout.headerFooterCancel")
      }}</TButton>
    </template>
    <TCheckbox
      :model-value="options.differentFirst"
      :disabled="disabled"
      @update:model-value="patchOptions({ differentFirst: Boolean($event) })"
      >{{ t("pageLayout.headerFooterDifferentFirst") }}</TCheckbox
    >
    <TCheckbox
      :model-value="options.differentOddEven"
      :disabled="disabled"
      @update:model-value="patchOptions({ differentOddEven: Boolean($event) })"
      >{{ t("pageLayout.headerFooterDifferentOddEven") }}</TCheckbox
    >
    <TCheckbox
      :model-value="options.scaleWithDocument"
      :disabled="disabled"
      @update:model-value="patchOptions({ scaleWithDocument: Boolean($event) })"
      >{{ t("pageLayout.headerFooterScaleWithDocument") }}</TCheckbox
    >
    <TCheckbox
      :model-value="options.alignWithMargins"
      :disabled="disabled"
      @update:model-value="patchOptions({ alignWithMargins: Boolean($event) })"
      >{{ t("pageLayout.headerFooterAlignWithMargins") }}</TCheckbox
    >
  </section>
</template>

<style scoped lang="scss">
.page-header-footer-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
