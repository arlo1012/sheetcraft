<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { ColorPicker as TColorPicker } from "tdesign-vue-next/es/color-picker";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import {
  Bold,
  Calendar,
  Check,
  Clock,
  File,
  Files,
  Hash,
  Italic,
  Sheet,
  Underline,
  X,
} from "lucide-vue-next";
import {
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterOptions,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import type { HeaderFooterEditorAction, HeaderFooterEditContext } from "../header-footer-editor";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";

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
  <RibbonToolbar
    class="page-header-footer-toolbar"
    :label="t('pageLayout.headerFooterTools')"
    data-page-header-footer-toolbar
  >
    <section
      v-if="context"
      class="page-header-footer-toolbar__group"
      data-ribbon-group="header-footer-format"
      role="group"
      :aria-label="t('pageLayout.headerFooterFormatting')"
    >
      <div class="page-header-footer-toolbar__format">
        <div class="page-header-footer-toolbar__row">
          <label class="page-header-footer-toolbar__font">
            <span class="ui-visually-hidden">{{ t("pageLayout.headerFooterFont") }}</span>
            <TSelect
              :model-value="context.format.fontFamily"
              :options="fonts"
              :disabled="disabled"
              @change="selectFont"
            />
          </label>
          <label class="page-header-footer-toolbar__size">
            <span class="ui-visually-hidden">{{ t("pageLayout.headerFooterFontSize") }}</span>
            <TSelect
              :model-value="context.format.fontSize"
              :options="sizes"
              :disabled="disabled"
              @change="selectSize"
            />
          </label>
        </div>
        <div class="page-header-footer-toolbar__row">
          <RibbonButton
            :label="t('pageLayout.headerFooterBold')"
            :disabled="disabled"
            :pressed="context.format.bold"
            @activate="format({ bold: !context.format.bold })"
            ><Bold
          /></RibbonButton>
          <RibbonButton
            :label="t('pageLayout.headerFooterItalic')"
            :disabled="disabled"
            :pressed="context.format.italic"
            @activate="format({ italic: !context.format.italic })"
            ><Italic
          /></RibbonButton>
          <RibbonButton
            :label="t('pageLayout.headerFooterUnderline')"
            :disabled="disabled"
            :pressed="context.format.underline"
            @activate="format({ underline: !context.format.underline })"
            ><Underline
          /></RibbonButton>
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
        </div>
      </div>
    </section>
    <section
      v-if="context"
      class="page-header-footer-toolbar__group"
      data-ribbon-group="header-footer-fields"
      role="group"
      :aria-label="t('pageLayout.headerFooterFields')"
    >
      <div class="page-header-footer-toolbar__fields">
        <RibbonButton
          :label="t('pageLayout.headerFooterPageNumber')"
          :text="t('pageLayout.headerFooterPageNumber')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'pageNumber' })"
          ><Hash
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterPageCount')"
          :text="t('pageLayout.headerFooterPageCount')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'pageCount' })"
          ><Files
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterSheetName')"
          :text="t('pageLayout.headerFooterSheetName')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'sheetName' })"
          ><Sheet
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterFileName')"
          :text="t('pageLayout.headerFooterFileName')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'fileName' })"
          ><File
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterDate')"
          :text="t('pageLayout.headerFooterDate')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'date' })"
          ><Calendar
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterTime')"
          :text="t('pageLayout.headerFooterTime')"
          :disabled="disabled"
          @activate="emit('action', { type: 'insertField', field: 'time' })"
          ><Clock
        /></RibbonButton>
      </div>
    </section>
    <section
      class="page-header-footer-toolbar__group"
      data-ribbon-group="header-footer-options"
      role="group"
      :aria-label="t('pageLayout.headerFooterOptions')"
    >
      <div class="page-header-footer-toolbar__options">
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
      </div>
    </section>
    <section
      v-if="context"
      class="page-header-footer-toolbar__group"
      data-ribbon-group="header-footer-edit"
    >
      <div class="page-header-footer-toolbar__actions">
        <RibbonButton
          :label="t('pageLayout.headerFooterFinish')"
          :text="t('pageLayout.headerFooterFinish')"
          :disabled="disabled"
          @activate="emit('action', { type: 'finish' })"
          ><Check
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterCancel')"
          :text="t('pageLayout.headerFooterCancel')"
          :disabled="disabled"
          @activate="emit('action', { type: 'cancel' })"
          ><X
        /></RibbonButton>
      </div>
    </section>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.page-header-footer-toolbar {
  &__group {
    @include ribbon.columns;
  }

  &__format {
    @include ribbon.stack;
  }

  &__row {
    @include ribbon.row;
  }

  &__font {
    width: 125px;
  }

  &__size {
    width: 65px;
  }

  &__fields,
  &__actions,
  &__options {
    @include ribbon.two-rows;
    grid-auto-flow: column;
    align-items: center;
    column-gap: 8px;
  }
}
</style>
