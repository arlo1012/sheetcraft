<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { CellNote } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    note?: CellNote;
    draft?: { text: string; author: string };
    error?: string;
    readOnly?: boolean;
  }>(),
  { error: "", readOnly: false },
);
const emit = defineEmits<{
  edit: [];
  save: [payload: { text: string; author: string; restoreFocus?: boolean }];
  cancel: [];
}>();
const { t } = useAppI18n();
const rootElement = ref<HTMLElement | null>(null);
const textAreaRef = ref<HTMLTextAreaElement | null>(null);
const draftText = ref("");
const draftAuthor = ref("");

const editing = () => Boolean(props.draft);

function resetDraft(): void {
  draftText.value = props.draft?.text ?? "";
  draftAuthor.value = props.draft?.author ?? "";
}

function save(restoreFocus = true): void {
  if (!props.draft || props.readOnly) return;
  emit("save", { text: draftText.value, author: draftAuthor.value.trim(), restoreFocus });
}

function cancel(): void {
  if (props.draft) emit("cancel");
}

function dismiss(): void {
  if (!props.draft) return;
  if (!props.note && !draftText.value.trim()) {
    cancel();
    return;
  }
  save(false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    save();
  }
}

function edit(): void {
  if (!props.draft && !props.readOnly) emit("edit");
}

watch(
  [() => props.draft?.text, () => props.draft?.author],
  () => {
    resetDraft();
    if (props.draft && !props.readOnly) void nextTick(() => textAreaRef.value?.focus());
  },
  { immediate: true },
);

defineExpose({ rootElement, save, cancel, dismiss });
</script>

<template>
  <div
    ref="rootElement"
    class="sheet-cell-note"
    :class="{ 'is-editing': editing() }"
    @keydown="onKeydown"
  >
    <template v-if="editing()">
      <input
        v-model="draftAuthor"
        class="sheet-cell-note__author-input"
        :aria-label="t('review.author')"
        autocomplete="name"
        spellcheck="false"
        :disabled="readOnly"
      />
      <textarea
        ref="textAreaRef"
        v-model="draftText"
        class="sheet-cell-note__text-input"
        :aria-label="t('review.noteText')"
        :disabled="readOnly"
      />
      <p v-if="error" class="sheet-cell-note__error" role="alert">{{ error }}</p>
    </template>
    <button
      v-else
      type="button"
      class="sheet-cell-note__view"
      :aria-label="`${t('review.noteText')}: ${note?.text ?? ''}`"
      @click="edit"
    >
      <strong>{{ note?.author?.trim() || t("review.anonymous") }}:</strong>
      <span class="sheet-cell-note__body">{{ note?.text }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.sheet-cell-note {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 2px 3px;
  color: var(--sheetcraft-note-text);
  font-family: SimSun, "Songti SC", serif;
  font-size: calc(12px * var(--note-scale, 1));
  line-height: calc(16px * var(--note-scale, 1));

  &__view,
  &__text-input {
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__view {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 0;
    overflow-wrap: anywhere;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: pre-wrap;
    cursor: text;
  }

  &__body {
    display: block;
  }

  &__author-input,
  &__text-input {
    box-sizing: border-box;
    display: block;
    width: 100%;
    margin: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
  }

  &__author-input {
    flex-shrink: 0;
    height: calc(16px * var(--note-scale, 1));
    padding: 0;
    font-weight: 700;
  }

  &__text-input {
    flex: 1;
    min-height: 0;
    padding: 0;
    resize: none;
    white-space: pre-wrap;
  }

  &__error {
    margin: 0;
    color: var(--sheetcraft-status-error);
    font-family: var(--sheetcraft-font-sans);
    font-size: 11px;
    line-height: 14px;
  }
}
</style>
