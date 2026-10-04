<script setup lang="ts">
import { computed, ref, watch, watchPostEffect } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";

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
  ["dark1", t("pageTools.dark1")] as const,
  ["light1", t("pageTools.light1")] as const,
  ["dark2", t("pageTools.dark2")] as const,
  ["light2", t("pageTools.light2")] as const,
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
const previewColors = computed(() => [
  draft.value.dark1,
  draft.value.light1,
  ...draft.value.accentColors,
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
    width="min(680px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="save"
    @close="close"
  >
    <TForm class="custom-theme-colors-dialog" label-align="top">
      <TFormItem :label="t('pageTools.themeSchemeName')"
        ><span ref="nameInputRef"
          ><TInput v-model="draft.name" autofocus :status="error ? 'error' : undefined" /></span
      ></TFormItem>
      <p v-if="error" class="custom-theme-colors-dialog__error" role="alert">{{ error }}</p>
      <div class="custom-theme-colors-dialog__colors">
        <TFormItem v-for="[field, label] in fields" :key="field" :label="label">
          <ColorPaletteSelect
            :model-value="colorFor(field)"
            :label="label"
            :show-default="false"
            @select="setColor(field, $event)"
          />
        </TFormItem>
      </div>
      <section class="custom-theme-colors-dialog__preview" :aria-label="t('pageTools.preview')">
        <strong>{{ t("pageTools.preview") }}</strong
        ><span
          ><i
            v-for="(color, index) in previewColors"
            :key="index"
            :style="{ backgroundColor: color }"
        /></span>
      </section>
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
.custom-theme-colors-dialog__colors {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.custom-theme-colors-dialog__preview {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--idea-border-subtle);
  font-size: 12px;
  line-height: 20px;
}
.custom-theme-colors-dialog__preview span {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 3px;
  max-width: 260px;
}
.custom-theme-colors-dialog__preview i {
  height: 20px;
}
</style>
