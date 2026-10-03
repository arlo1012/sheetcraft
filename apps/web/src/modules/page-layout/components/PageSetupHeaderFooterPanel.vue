<script setup lang="ts">
import { computed } from "vue";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SelectValue } from "tdesign-vue-next/es/select/type";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  getSheetHeaderFooterOptions,
  type SheetHeaderFooterParts,
  type SheetHeaderFooterOptions,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import type { HeaderFooterEditTarget } from "../header-footer-editor";
import { useAppI18n } from "../../../shared/i18n";
import PageHeaderFooterField from "./PageHeaderFooterField.vue";

const setup = defineModel<SheetPageSetup>("setup", { required: true });
const props = withDefaults(defineProps<{ sheetName?: string; fileName?: string }>(), {
  sheetName: "",
  fileName: "Workbook.xlsx",
});
const emit = defineEmits<{ customEdit: [target: HeaderFooterEditTarget] }>();
const { t, locale } = useAppI18n();
const options = computed(() => getSheetHeaderFooterOptions(setup.value));
const presets = computed(() => [
  {
    value: "none",
    label: t("pageLayout.headerFooterNone"),
    parts: { left: "", center: "", right: "" },
  },
  {
    value: "page",
    label: t("pageLayout.headerFooterPageNumber"),
    parts: { left: "", center: "&P", right: "" },
  },
  {
    value: "pages",
    label: t("pageLayout.presetPageOfPages"),
    parts: { left: "", center: t("pageLayout.presetPageOfPagesText"), right: "" },
  },
  {
    value: "sheet",
    label: t("pageLayout.headerFooterSheetName"),
    parts: { left: "", center: "&A", right: "" },
  },
  {
    value: "file",
    label: t("pageLayout.headerFooterFileName"),
    parts: { left: "", center: "&F", right: "" },
  },
  {
    value: "date",
    label: t("pageLayout.headerFooterDate"),
    parts: { left: "", center: "&D", right: "" },
  },
]);
const presetOptions = computed(() => [
  ...presets.value.map(({ value, label }) => ({ value, label })),
  { value: "custom", label: t("pageLayout.headerFooterCustom") },
]);
function presetValue(parts: SheetHeaderFooterParts): string {
  return (
    presets.value.find(
      ({ parts: sample }) =>
        sample.left === parts.left &&
        sample.center === parts.center &&
        sample.right === parts.right,
    )?.value ?? "custom"
  );
}
function selectPreset(section: "header" | "footer", value: SelectValue): void {
  const preset = presets.value.find((preset) => preset.value === value);
  if (preset) setup.value = { ...setup.value, [section]: { ...preset.parts } };
  else if (value === "custom") emit("customEdit", { section, part: "left", variant: "odd" });
}
function patchOptions(patch: Partial<SheetHeaderFooterOptions>): void {
  setup.value = { ...setup.value, headerFooter: { ...options.value, ...patch } };
}
</script>

<template>
  <TForm
    class="page-setup-header-footer idea-form-grid"
    :data="setup"
    label-align="right"
    :label-width="locale === 'zh-CN' ? 96 : 144"
  >
    <section :aria-label="t('pageLayout.header')">
      <div class="page-setup-header-footer__preview" :aria-label="t('pageLayout.headerPreview')">
        <PageHeaderFooterField
          :value="setup.header.left"
          section="header"
          part="left"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
        <PageHeaderFooterField
          :value="setup.header.center"
          section="header"
          part="center"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :placeholder="setup.header.left || setup.header.right ? '' : t('pageLayout.preview')"
          :ui-scale="0.65"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
        <PageHeaderFooterField
          :value="setup.header.right"
          section="header"
          part="right"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
      </div>
      <TFormItem :label="t('pageLayout.header')"
        ><div class="page-setup-header-footer__row">
          <TSelect
            :model-value="presetValue(setup.header)"
            :options="presetOptions"
            :aria-label="t('pageLayout.header')"
            data-page-setup="header-preset"
            @change="selectPreset('header', $event)"
          /><TButton
            variant="outline"
            data-page-setup="custom-header"
            @click="emit('customEdit', { section: 'header', part: 'left', variant: 'odd' })"
            >{{ t("pageLayout.customHeader") }}</TButton
          >
        </div>
      </TFormItem>
    </section>
    <section :aria-label="t('pageLayout.footer')">
      <div class="page-setup-header-footer__preview" :aria-label="t('pageLayout.footerPreview')">
        <PageHeaderFooterField
          :value="setup.footer.left"
          section="footer"
          part="left"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
        <PageHeaderFooterField
          :value="setup.footer.center"
          section="footer"
          part="center"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :placeholder="setup.footer.left || setup.footer.right ? '' : t('pageLayout.preview')"
          :ui-scale="0.65"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
        <PageHeaderFooterField
          :value="setup.footer.right"
          section="footer"
          part="right"
          variant="odd"
          :page-number="setup.firstPageNumber ?? 1"
          :page-count="1"
          :sheet-name="props.sheetName"
          :file-name="props.fileName"
          :disabled="false"
          @open="emit('customEdit', $event)"
        />
      </div>
      <TFormItem :label="t('pageLayout.footer')"
        ><div class="page-setup-header-footer__row">
          <TSelect
            :model-value="presetValue(setup.footer)"
            :options="presetOptions"
            :aria-label="t('pageLayout.footer')"
            data-page-setup="footer-preset"
            @change="selectPreset('footer', $event)"
          /><TButton
            variant="outline"
            data-page-setup="custom-footer"
            @click="emit('customEdit', { section: 'footer', part: 'left', variant: 'odd' })"
            >{{ t("pageLayout.customFooter") }}</TButton
          >
        </div>
      </TFormItem>
    </section>
    <TFormItem :label-width="0">
      <div class="page-setup-header-footer__options">
        <TCheckbox
          :checked="options.differentOddEven"
          data-page-setup-option="different-odd-even"
          @change="patchOptions({ differentOddEven: Boolean($event) })"
          >{{ t("pageLayout.headerFooterDifferentOddEven") }}</TCheckbox
        >
        <TCheckbox
          :checked="options.differentFirst"
          data-page-setup-option="different-first"
          @change="patchOptions({ differentFirst: Boolean($event) })"
          >{{ t("pageLayout.headerFooterDifferentFirst") }}</TCheckbox
        >
        <TCheckbox
          :checked="options.scaleWithDocument"
          data-page-setup-option="scale-with-document"
          @change="patchOptions({ scaleWithDocument: Boolean($event) })"
          >{{ t("pageLayout.headerFooterScaleWithDocument") }}</TCheckbox
        >
        <TCheckbox
          :checked="options.alignWithMargins"
          data-page-setup-option="align-with-margins"
          @change="patchOptions({ alignWithMargins: Boolean($event) })"
          >{{ t("pageLayout.headerFooterAlignWithMargins") }}</TCheckbox
        >
      </div>
    </TFormItem>
  </TForm>
</template>

<style scoped lang="scss">
@use "./page-setup-panel" as panel;
.page-setup-header-footer {
  @include panel.panel;
  &__preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    height: 70px;
    margin-bottom: var(--idea-space-2);
    background: var(--idea-surface-panel);
  }
  &__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    width: 100%;
    gap: var(--idea-space-2);
    align-items: center;
  }
  &__options {
    display: grid;
    gap: var(--idea-space-2);
  }
}
</style>
