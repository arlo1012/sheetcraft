<script setup lang="ts">
import { computed } from "vue";
import { previewHeaderFooterRuns } from "../header-footer-text";
import type {
  HeaderFooterEditTarget,
  HeaderFooterPart,
  HeaderFooterSection,
  HeaderFooterVariant,
} from "../header-footer-editor";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    value: string;
    section: HeaderFooterSection;
    part: HeaderFooterPart;
    variant: HeaderFooterVariant;
    pageNumber?: number;
    pageCount: number;
    sheetName: string;
    disabled: boolean;
    fileName?: string;
    now?: Date;
    fontScale?: number;
    placeholder?: string;
    uiScale?: number;
  }>(),
  { fileName: "Workbook.xlsx", now: undefined, fontScale: 1, placeholder: undefined, uiScale: 1 },
);
const emit = defineEmits<{ open: [target: HeaderFooterEditTarget] }>();
const { t, locale } = useAppI18n();
const now = props.now ?? new Date();
const label = computed(() =>
  t(
    props.section === "header"
      ? props.part === "left"
        ? "pageLayout.headerLeft"
        : props.part === "center"
          ? "pageLayout.headerCenter"
          : "pageLayout.headerRight"
      : props.part === "left"
        ? "pageLayout.footerLeft"
        : props.part === "center"
          ? "pageLayout.footerCenter"
          : "pageLayout.footerRight",
  ),
);
const previewRuns = computed(() =>
  previewHeaderFooterRuns(props.value, {
    pageNumber: props.pageNumber,
    pageCount: props.pageCount,
    sheetName: props.sheetName,
    fileName: props.fileName,
    now,
    locale: locale.value,
  }),
);
const hasPreviewText = computed(() => previewRuns.value.some((run) => run.text.length > 0));
function open(): void {
  if (!props.disabled)
    emit("open", { section: props.section, part: props.part, variant: props.variant });
}
</script>

<template>
  <button
    type="button"
    class="page-header-footer-field__preview"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    :style="{ textAlign: part }"
    data-page-header-footer
    :data-page-section="section"
    :data-page-part="part"
    @click="open"
  >
    <span v-if="!hasPreviewText && placeholder" class="page-header-footer-field__placeholder">{{
      placeholder
    }}</span>
    <span
      v-for="(run, index) in previewRuns"
      :key="index"
      :style="{
        fontFamily: run.format.fontFamily,
        fontSize: `${(run.format.fontSize * 4 * fontScale) / 3}px`,
        lineHeight: 1.2,
        fontWeight: run.format.bold ? 700 : 400,
        fontStyle: run.format.italic ? 'italic' : 'normal',
        textDecoration: run.format.underline ? 'underline' : 'none',
        color: `#${run.format.color}`,
      }"
      >{{ run.text }}</span
    >
  </button>
</template>

<style scoped lang="scss">
.page-header-footer-field {
  &__preview {
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 2px 6px;
    border: 0;
    background: transparent;
    white-space: pre;
    overflow: hidden;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
    &:disabled {
      cursor: default;
    }
  }
  &__placeholder {
    color: var(--idea-text-muted);
    font-family: var(--idea-font-sans);
    font-size: calc(20px * v-bind(uiScale));
    line-height: calc(24px * v-bind(uiScale));
  }
}
</style>
