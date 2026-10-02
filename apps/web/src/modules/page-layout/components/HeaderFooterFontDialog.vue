<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { CELL_FONT_FAMILY_PRESETS } from "../../../shared/cell-text/font-catalog";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { HeaderFooterFormat } from "../header-footer-text";

const props = defineProps<{
  visible: boolean;
  format: HeaderFooterFormat;
  sampleText?: string;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  confirm: [format: HeaderFooterFormat];
}>();
const { t } = useAppI18n();
const draft = ref<HeaderFooterFormat>({ ...props.format });
const fonts = computed(() =>
  [
    ...new Set<string>([
      ...CELL_FONT_FAMILY_PRESETS,
      props.format.fontFamily,
      draft.value.fontFamily,
    ]),
  ].map((value) => ({ label: value, value })),
);
const fontStyles = computed(() => [
  { value: "regular", label: t("cellFormat.fontRegular") },
  { value: "italic", label: t("pageLayout.headerFooterItalic") },
  { value: "bold", label: t("pageLayout.headerFooterBold") },
  { value: "boldItalic", label: t("cellFormat.fontBoldItalic") },
]);
const fontStyle = computed(() =>
  draft.value.bold
    ? draft.value.italic
      ? "boldItalic"
      : "bold"
    : draft.value.italic
      ? "italic"
      : "regular",
);
const previewStyle = computed(() => ({
  fontFamily: draft.value.fontFamily,
  fontSize: `${draft.value.fontSize}pt`,
  fontWeight: draft.value.bold ? "bold" : "normal",
  fontStyle: draft.value.italic ? "italic" : "normal",
  textDecoration: draft.value.underline ? "underline" : "none",
  color: `#${draft.value.color}`,
}));
function selectFont(value: unknown): void {
  if (typeof value === "string" && value.trim()) draft.value.fontFamily = value.trim();
}
function selectStyle(value: unknown): void {
  if (value !== "regular" && value !== "italic" && value !== "bold" && value !== "boldItalic")
    return;
  draft.value.bold = value === "bold" || value === "boldItalic";
  draft.value.italic = value === "italic" || value === "boldItalic";
}
function selectSize(value: number | string): void {
  const size = Number(value);
  if (Number.isFinite(size) && size >= 1 && size <= 409) draft.value.fontSize = Math.round(size);
}
function selectColor(value: string | null): void {
  draft.value.color = (value ?? "#000000").replace(/^#/, "").toUpperCase();
}
function close(): void {
  emit("update:visible", false);
}
function confirm(): void {
  emit("confirm", { ...draft.value });
  close();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) draft.value = { ...props.format };
  },
  { immediate: true },
);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('pageLayout.headerFooterFont')"
    width="min(440px, calc(100vw - 32px))"
    :confirm-btn="t('pageLayout.confirm')"
    :cancel-btn="t('pageLayout.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="confirm"
    @close="close"
  >
    <div class="header-footer-font-dialog">
      <div class="header-footer-font-dialog__controls">
        <div
          class="header-footer-font-dialog__field"
          role="group"
          :aria-label="t('pageLayout.headerFooterFont')"
        >
          <span>{{ t("pageLayout.headerFooterFont") }}</span>
          <TSelect
            :model-value="draft.fontFamily"
            :options="fonts"
            :aria-label="t('pageLayout.headerFooterFont')"
            filterable
            creatable
            data-header-footer-font="family"
            @change="selectFont"
            @create="selectFont"
          />
        </div>
        <div
          class="header-footer-font-dialog__field"
          role="group"
          :aria-label="t('cellFormat.fontStyle')"
        >
          <span>{{ t("cellFormat.fontStyle") }}</span>
          <TSelect
            :model-value="fontStyle"
            :options="fontStyles"
            :aria-label="t('cellFormat.fontStyle')"
            data-header-footer-font="style"
            @change="selectStyle"
          />
        </div>
        <div
          class="header-footer-font-dialog__field"
          role="group"
          :aria-label="t('pageLayout.headerFooterFontSize')"
        >
          <span>{{ t("pageLayout.headerFooterFontSize") }}</span>
          <TInputNumber
            :model-value="draft.fontSize"
            :min="1"
            :max="409"
            :decimal-places="0"
            theme="column"
            class="idea-input-number--persistent-controls"
            :aria-label="t('pageLayout.headerFooterFontSize')"
            data-header-footer-font="size"
            @change="selectSize"
          />
        </div>
      </div>
      <div class="header-footer-font-dialog__appearance">
        <TCheckbox :checked="draft.underline" @change="draft.underline = Boolean($event)">
          {{ t("pageLayout.headerFooterUnderline") }}
        </TCheckbox>
        <div
          class="header-footer-font-dialog__field"
          role="group"
          :aria-label="t('pageLayout.headerFooterColor')"
        >
          <span>{{ t("pageLayout.headerFooterColor") }}</span>
          <ColorPaletteSelect
            :model-value="`#${draft.color}`"
            :label="t('pageLayout.headerFooterColor')"
            show-value
            @select="selectColor"
          />
        </div>
      </div>
      <div
        class="header-footer-font-dialog__field"
        role="group"
        :aria-label="t('pageLayout.preview')"
      >
        <span>{{ t("pageLayout.preview") }}</span>
        <div class="header-footer-font-dialog__preview">
          <span :style="previewStyle">{{ sampleText || t("cellFormat.previewText") }}</span>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.header-footer-font-dialog {
  display: grid;
  gap: var(--idea-space-3);

  &__controls {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) 72px;
    gap: var(--idea-space-2);
  }

  &__field {
    display: grid;
    min-width: 0;
    gap: var(--idea-space-1);
  }

  &__appearance {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
    gap: var(--idea-space-3);
  }

  &__preview {
    display: grid;
    place-items: center;
    height: 72px;
    overflow: auto;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-small);
    background: var(--idea-surface-panel);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
}
</style>
