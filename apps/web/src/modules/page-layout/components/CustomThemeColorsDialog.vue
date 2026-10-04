<script setup lang="ts">
import { computed, ref, watch, watchPostEffect } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import ThemeColorPreview from "./ThemeColorPreview.vue";

export type ThemeColorScheme = {
  name: string;
  dark1: string;
  light1: string;
  dark2: string;
  light2: string;
  accentColors: [string, string, string, string, string, string];
  hyperlink: string;
  followedHyperlink: string;
};
type DirectColorField = Exclude<keyof ThemeColorScheme, "name" | "accentColors">;
type ColorField = DirectColorField | `accent${number}`;
const props = defineProps<{ visible: boolean; colors: ThemeColorScheme }>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [colors: ThemeColorScheme];
}>();
const { t } = useAppI18n();
const draft = ref<ThemeColorScheme>(clone(props.colors));
const error = ref<string | null>(null);
const nameInputRef = ref<HTMLElement | null>(null);
const fields = computed<ReadonlyArray<readonly [ColorField, string]>>(() => [
  ["light1", t("pageTools.light1")] as const,
  ["dark1", t("pageTools.dark1")] as const,
  ["light2", t("pageTools.light2")] as const,
  ["dark2", t("pageTools.dark2")] as const,
  ...Array.from(
    { length: 6 },
    (_, index) =>
      [
        `accent${index + 1}` as ColorField,
        t("pageTools.accentColor", { index: index + 1 }),
      ] as const,
  ),
  ["hyperlink", t("pageTools.hyperlink")] as const,
  ["followedHyperlink", t("pageTools.followedHyperlink")] as const,
]);
function clone(colors: ThemeColorScheme): ThemeColorScheme {
  return { ...colors, accentColors: [...colors.accentColors] as ThemeColorScheme["accentColors"] };
}
function colorFor(field: ColorField): string {
  if (field.startsWith("accent"))
    return draft.value.accentColors[Number(field.slice(6)) - 1] ?? "#000000";
  return draft.value[field as DirectColorField];
}
function setColor(field: ColorField, value: string | null): void {
  if (!value) return;
  if (field.startsWith("accent")) draft.value.accentColors[Number(field.slice(6)) - 1] = value;
  else draft.value[field as DirectColorField] = value;
}
function close(): void {
  emit("update:visible", false);
}
watchPostEffect(() => {
  const input = nameInputRef.value?.querySelector<HTMLInputElement>("input");
  if (input) input.setAttribute("aria-label", t("pageTools.themeSchemeName"));
});
function save(): void {
  if (!draft.value.name.trim()) {
    error.value = t("pageTools.themeNameRequired");
    return;
  }
  emit("save", clone({ ...draft.value, name: draft.value.name.trim() }));
  close();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      draft.value = clone(props.colors);
      error.value = null;
    }
  },
);
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('pageTools.customThemeColors')"
    :confirm-btn="t('pageTools.save')"
    :cancel-btn="t('pageTools.cancel')"
    width="min(620px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="save"
    @close="close"
  >
    <TForm class="custom-theme-colors-dialog" label-align="top">
      <TFormItem :label="t('pageTools.themeSchemeName')">
        <div ref="nameInputRef" class="custom-theme-colors-dialog__name">
          <TInput v-model="draft.name" autofocus clearable :status="error ? 'error' : undefined" />
        </div>
      </TFormItem>
      <p v-if="error" class="custom-theme-colors-dialog__error" role="alert">{{ error }}</p>
      <div class="custom-theme-colors-dialog__content">
        <section
          class="custom-theme-colors-dialog__colors"
          :aria-label="t('pageTools.themeColorSlots')"
        >
          <strong>{{ t("pageTools.themeColorSlots") }}</strong>
          <TFormItem
            v-for="[field, label] in fields"
            :key="field"
            class="custom-theme-colors-dialog__color-row"
            :label="label"
            label-align="left"
            label-width="180px"
          >
            <ColorPaletteSelect
              :model-value="colorFor(field)"
              :label="label"
              :show-default="false"
              @select="setColor(field, $event)"
            />
          </TFormItem>
        </section>
        <section class="custom-theme-colors-dialog__preview" :aria-label="t('pageTools.preview')">
          <strong>{{ t("pageTools.preview") }}</strong>
          <div class="custom-theme-colors-dialog__preview-grid">
            <ThemeColorPreview
              :label="t('pageTools.lightModePreview', { index: 1 })"
              :background="draft.light1"
              :foreground="draft.dark1"
              :accent-colors="draft.accentColors"
            />
            <ThemeColorPreview
              :label="t('pageTools.lightModePreview', { index: 2 })"
              :background="draft.light2"
              :foreground="draft.dark2"
              :accent-colors="draft.accentColors"
            />
            <ThemeColorPreview
              :label="t('pageTools.darkModePreview', { index: 1 })"
              :background="draft.dark1"
              :foreground="draft.light1"
              :accent-colors="draft.accentColors"
            />
            <ThemeColorPreview
              :label="t('pageTools.darkModePreview', { index: 2 })"
              :background="draft.dark2"
              :foreground="draft.light2"
              :accent-colors="draft.accentColors"
            />
          </div>
        </section>
      </div>
    </TForm>
  </TDialog>
</template>

<style scoped lang="scss">
@use "../../../shared/option-list/option-list";

.custom-theme-colors-dialog {
  @include option-list.scrollbar;

  display: grid;
  max-height: calc(100vh - 180px);
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}
.custom-theme-colors-dialog__error {
  margin: -8px 0 0;
  color: var(--idea-status-error);
  font-size: 12px;
  line-height: 18px;
}
.custom-theme-colors-dialog__name {
  width: 100%;
}
.custom-theme-colors-dialog__content {
  display: grid;
  grid-template-columns: minmax(260px, 1.1fr) minmax(0, 1fr);
  gap: 16px;
}
.custom-theme-colors-dialog__colors {
  display: grid;
  align-content: start;
  gap: 8px;
}
.custom-theme-colors-dialog__color-row {
  margin-bottom: 0;
}
.custom-theme-colors-dialog__preview {
  display: grid;
  align-content: start;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--idea-border-subtle);
}
.custom-theme-colors-dialog__content strong {
  font-size: 12px;
  line-height: 20px;
}
.custom-theme-colors-dialog__preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 8px;
}
@media (max-width: 560px) {
  .custom-theme-colors-dialog__content {
    grid-template-columns: minmax(0, 1fr);
  }
  .custom-theme-colors-dialog__preview {
    padding: 12px 0 0;
    border-top: 1px solid var(--idea-border-subtle);
    border-left: 0;
  }
}
</style>
