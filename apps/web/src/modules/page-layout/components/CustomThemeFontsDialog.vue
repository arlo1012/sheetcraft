<script setup lang="ts">
import { computed, ref, watch, watchPostEffect } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import LocalFontAccess from "../../../shared/cell-text/LocalFontAccess.vue";

export type ThemeFontScheme = {
  name: string;
  headingFont: string;
  bodyFont: string;
  headingEastAsia: string;
  bodyEastAsia: string;
};
const props = defineProps<{ visible: boolean; fonts: ThemeFontScheme }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; save: [fonts: ThemeFontScheme] }>();
const { t } = useAppI18n();
const draft = ref<ThemeFontScheme>({ ...props.fonts });
const error = ref<string | null>(null);
const nameInputRef = ref<HTMLElement | null>(null);
const { fontOptions } = useFontCatalog(() => [
  draft.value.headingFont,
  draft.value.bodyFont,
  draft.value.headingEastAsia,
  draft.value.bodyEastAsia,
]);
const westernHeadingStyle = computed(() => ({
  fontFamily: `'${draft.value.headingFont}', sans-serif`,
}));
const westernBodyStyle = computed(() => ({ fontFamily: `'${draft.value.bodyFont}', sans-serif` }));
const eastAsiaHeadingStyle = computed(() => ({
  fontFamily: `'${draft.value.headingEastAsia}', sans-serif`,
}));
const eastAsiaBodyStyle = computed(() => ({
  fontFamily: `'${draft.value.bodyEastAsia}', sans-serif`,
}));
function close(): void {
  emit("update:visible", false);
}
watchPostEffect(() => {
  const input = nameInputRef.value?.querySelector<HTMLInputElement>("input");
  if (input) input.setAttribute("aria-label", t("pageTools.themeSchemeName"));
});
function save(): void {
  const next = {
    ...draft.value,
    name: draft.value.name.trim(),
    headingFont: draft.value.headingFont.trim(),
    bodyFont: draft.value.bodyFont.trim(),
    headingEastAsia: draft.value.headingEastAsia.trim(),
    bodyEastAsia: draft.value.bodyEastAsia.trim(),
  };
  if (!next.name) {
    error.value = t("pageTools.themeNameRequired");
    return;
  }
  if (!next.headingFont || !next.bodyFont || !next.headingEastAsia || !next.bodyEastAsia) {
    error.value = t("pageTools.themeFontRequired");
    return;
  }
  emit("save", next);
  close();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      draft.value = { ...props.fonts };
      error.value = null;
    }
  },
);
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('pageTools.customThemeFonts')"
    :confirm-btn="t('pageTools.save')"
    :cancel-btn="t('pageTools.cancel')"
    width="min(660px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="save"
    @close="close"
  >
    <TForm class="custom-theme-fonts-dialog sheetcraft-form-grid" label-align="top">
      <TFormItem :label="t('pageTools.themeSchemeName')" label-align="left" label-width="48px">
        <div ref="nameInputRef" class="custom-theme-fonts-dialog__name">
          <TInput v-model="draft.name" autofocus clearable :status="error ? 'error' : undefined" />
        </div>
      </TFormItem>
      <p v-if="error" class="custom-theme-fonts-dialog__error" role="alert">{{ error }}</p>
      <div class="custom-theme-fonts-dialog__content">
        <div class="custom-theme-fonts-dialog__fields">
          <section :aria-label="t('pageTools.westernFonts')">
            <strong>{{ t("pageTools.westernFonts") }}</strong>
            <TFormItem :label="t('pageTools.westernHeadingFont')"
              ><TSelect v-model="draft.headingFont" filterable creatable :options="fontOptions"
            /></TFormItem>
            <TFormItem :label="t('pageTools.westernBodyFont')"
              ><TSelect v-model="draft.bodyFont" filterable creatable :options="fontOptions"
            /></TFormItem>
          </section>
          <section :aria-label="t('pageTools.chineseFonts')">
            <strong>{{ t("pageTools.chineseFonts") }}</strong>
            <TFormItem :label="t('pageTools.chineseHeadingFont')"
              ><TSelect v-model="draft.headingEastAsia" filterable creatable :options="fontOptions"
            /></TFormItem>
            <TFormItem :label="t('pageTools.chineseBodyFont')"
              ><TSelect v-model="draft.bodyEastAsia" filterable creatable :options="fontOptions"
            /></TFormItem>
          </section>
        </div>
        <section class="custom-theme-fonts-dialog__preview" :aria-label="t('pageTools.preview')">
          <strong>{{ t("pageTools.preview") }}</strong>
          <span>{{ t("pageTools.customStylePreview") }}</span>
          <div class="custom-theme-fonts-dialog__preview-sheet">
            <section :aria-label="t('pageTools.westernFonts')">
              <p :style="westernHeadingStyle">Heading</p>
              <p :style="westernBodyStyle">Body text, body text, body text.</p>
            </section>
            <section :aria-label="t('pageTools.chineseFonts')">
              <p :style="eastAsiaHeadingStyle">{{ t("pageTools.headingPreview") }}</p>
              <p :style="eastAsiaBodyStyle">{{ t("pageTools.bodyPreview") }}</p>
            </section>
          </div>
        </section>
      </div>
      <LocalFontAccess />
    </TForm>
  </TDialog>
</template>

<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.custom-theme-fonts-dialog {
  @include option-list.scrollbar;

  display: grid;
  max-height: calc(100vh - 180px);
  gap: 24px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}
.custom-theme-fonts-dialog__name {
  width: 100%;
}
.custom-theme-fonts-dialog__error {
  margin: -8px 0 0;
  color: var(--sheetcraft-status-error);
  font-size: 12px;
  line-height: 18px;
}
.custom-theme-fonts-dialog__content {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.custom-theme-fonts-dialog__fields {
  display: grid;
  gap: 12px;
}
.custom-theme-fonts-dialog__fields section {
  display: grid;
  gap: 6px;
}
.custom-theme-fonts-dialog__fields strong,
.custom-theme-fonts-dialog__preview > strong {
  font-size: 14px;
  line-height: 22px;
}
.custom-theme-fonts-dialog__preview {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 6px;
  min-width: 0;
}
.custom-theme-fonts-dialog__preview-sheet {
  display: grid;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  min-height: 240px;
  padding: 24px 32px;
  background: var(--sheetcraft-surface-panel);
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: var(--sheetcraft-radius-default);
}
.custom-theme-fonts-dialog__preview-sheet section {
  display: grid;
  align-content: center;
  gap: 12px;
  padding: 16px 0;

  + section {
    border-top: 1px solid var(--sheetcraft-border-subtle);
  }
}
.custom-theme-fonts-dialog__preview span {
  font-size: 12px;
  line-height: 20px;
}
.custom-theme-fonts-dialog__preview p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 20px;
}
.custom-theme-fonts-dialog__preview p:first-of-type {
  font-size: 14px;
  line-height: 22px;
}
@media (max-width: 560px) {
  .custom-theme-fonts-dialog__content {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
