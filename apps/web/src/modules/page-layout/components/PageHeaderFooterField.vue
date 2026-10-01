<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import {
  DEFAULT_HEADER_FOOTER_FORMAT,
  decodeHeaderFooterText,
  encodeHeaderFooterText,
  parseHeaderFooterRuns,
  previewHeaderFooterRuns,
  type HeaderFooterFormat,
} from "../header-footer-text";
import type {
  HeaderFooterActionRequest,
  HeaderFooterEditContext,
  HeaderFooterPart,
  HeaderFooterSection,
  HeaderFooterVariant,
} from "../header-footer-editor";
import {
  headerFooterLabels,
  insertAtSelection,
  mergeHeaderFooterFormat,
} from "../useHeaderFooterFields";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    value: string;
    section: HeaderFooterSection;
    part: HeaderFooterPart;
    pageNumber?: number;
    pageCount: number;
    sheetName: string;
    disabled: boolean;
    variant?: HeaderFooterVariant;
    fileName?: string;
    now?: Date;
    actionRequest?: HeaderFooterActionRequest;
    fontScale?: number;
    placeholder?: string;
    rowActive?: boolean;
    uiScale?: number;
  }>(),
  {
    variant: "odd",
    fileName: "Workbook.xlsx",
    now: undefined,
    actionRequest: undefined,
    fontScale: 1,
    placeholder: undefined,
    rowActive: false,
    uiScale: 1,
  },
);
const emit = defineEmits<{
  change: [value: string];
  edit: [context: HeaderFooterEditContext | undefined];
}>();
const { t, locale } = useAppI18n();
const textarea = ref<{ $el?: HTMLElement }>();
const editing = ref(false);
const draft = ref("");
const selection = ref({ start: 0, end: 0 });
const format = ref<HeaderFooterFormat>({ ...DEFAULT_HEADER_FOOTER_FORMAT });
const formatDirty = ref(false);
const composing = ref(false);
const labels = computed(() => headerFooterLabels(t));
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
function context(): HeaderFooterEditContext {
  return {
    section: props.section,
    part: props.part,
    variant: props.variant,
    pageNumber: props.pageNumber,
    format: { ...format.value },
  };
}
function input(): HTMLTextAreaElement | null {
  return textarea.value?.$el?.querySelector("textarea") ?? null;
}
function captureSelection(): void {
  const element = input();
  if (element) selection.value = { start: element.selectionStart, end: element.selectionEnd };
}
function focus(): void {
  if (props.disabled || editing.value) return;
  draft.value = decodeHeaderFooterText(props.value, labels.value);
  format.value = {
    ...(parseHeaderFooterRuns(props.value)[0]?.format ?? DEFAULT_HEADER_FOOTER_FORMAT),
  };
  formatDirty.value = false;
  editing.value = true;
  emit("edit", context());
  void nextTick(() => {
    const element = input();
    if (!element) return;
    element.focus();
    element.setSelectionRange(draft.value.length, draft.value.length);
    captureSelection();
  });
}
function finish(): boolean {
  if (!editing.value) return true;
  if (composing.value) return false;
  const changed =
    draft.value !== decodeHeaderFooterText(props.value, labels.value) || formatDirty.value;
  editing.value = false;
  emit("edit", undefined);
  if (changed) emit("change", encodeHeaderFooterText(draft.value, labels.value, format.value));
  return true;
}
function cancel(): boolean {
  if (!editing.value) return true;
  editing.value = false;
  emit("edit", undefined);
  return true;
}
function isToolbarTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("[data-page-header-footer-toolbar], .page-header-footer-toolbar__popup"))
  );
}
function onBlur(event: FocusEvent): void {
  if (isToolbarTarget(event.relatedTarget)) return;
  if (event.relatedTarget) {
    finish();
    return;
  }
  window.setTimeout(() => {
    if (editing.value && !isToolbarTarget(document.activeElement)) finish();
  });
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    input()?.blur();
  } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    finish();
    input()?.blur();
  }
}
function applyAction(request: HeaderFooterActionRequest): void {
  if (!editing.value) return;
  if (request.action.type === "insertField") {
    const inserted = insertAtSelection(
      draft.value,
      selection.value.start,
      selection.value.end,
      `&[${labels.value[request.action.field]}]`,
    );
    draft.value = inserted.value;
    selection.value = { start: inserted.caret, end: inserted.caret };
    void nextTick(() => {
      const element = input();
      element?.focus();
      element?.setSelectionRange(inserted.caret, inserted.caret);
    });
  } else if (request.action.type === "format") {
    format.value = mergeHeaderFooterFormat(format.value, request.action.patch);
    formatDirty.value = true;
    emit("edit", context());
  } else if (request.action.type === "finish") finish();
  else cancel();
}
function finishEditing(): boolean {
  return finish();
}
function hasPendingEdit(): boolean {
  return editing.value;
}
defineExpose({ finishEditing, hasPendingEdit });
onBeforeUnmount(() => {
  if (editing.value && !composing.value) finish();
});
watch(
  () => props.actionRequest?.sequence,
  () => {
    if (props.actionRequest) applyAction(props.actionRequest);
  },
);
</script>

<template>
  <label
    class="page-header-footer-field"
    :class="{ 'is-editing': editing, 'is-row-active': rowActive }"
    :style="{ textAlign: part }"
  >
    <span class="ui-visually-hidden">{{ label }}</span>
    <TTextarea
      v-if="editing"
      ref="textarea"
      :model-value="draft"
      :disabled="disabled"
      :maxlength="1024"
      :aria-label="label"
      :title="label"
      :style="{ fontSize: `${(format.fontSize * 4 * fontScale) / 3}px`, lineHeight: 1.2 }"
      autosize
      borderless
      data-page-header-footer
      :data-page-section="section"
      :data-page-part="part"
      @update:model-value="draft = String($event)"
      @blur="(_value, context) => onBlur(context.e)"
      @select="captureSelection"
      @click="captureSelection"
      @keyup="captureSelection"
      @compositionstart="composing = true"
      @compositionend="composing = false"
      @keydown="(_value, context) => keydown(context.e)"
    />
    <button
      v-else
      type="button"
      class="page-header-footer-field__preview"
      :disabled="disabled"
      :aria-label="label"
      :title="label"
      data-page-header-footer
      :data-page-section="section"
      :data-page-part="part"
      @focus="focus"
      @click="focus"
    >
      <span v-if="!value && placeholder" class="page-header-footer-field__placeholder">{{
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
  </label>
</template>

<style scoped lang="scss">
.page-header-footer-field {
  display: block;
  min-width: 0;
  white-space: pre-wrap;
  &__preview {
    width: 100%;
    min-height: 28px;
    padding: 2px 6px;
    border: 0;
    background: transparent;
    text-align: inherit;
    white-space: pre;
    cursor: text;
  }
  &__placeholder {
    color: var(--idea-text-muted);
    font-family: var(--idea-font-sans);
    font-size: calc(20px * v-bind(uiScale));
    line-height: calc(24px * v-bind(uiScale));
  }
  &.is-row-active &__preview {
    outline: 1px solid var(--idea-border-control);
    outline-offset: -1px;
  }
  &.is-editing &__preview,
  &.is-editing :deep(textarea) {
    outline: 2px solid var(--idea-action-primary);
    outline-offset: -1px;
  }
  &.is-editing :deep(textarea) {
    min-height: 28px;
    padding: 2px 6px;
    resize: none;
    text-align: inherit;
    white-space: pre;
    overflow-wrap: normal;
    overflow-x: auto;
  }
}
</style>
