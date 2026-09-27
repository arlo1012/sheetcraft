<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, watchPostEffect } from "vue";
import { ChevronDown } from "lucide-vue-next";
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import type { PopupProps } from "tdesign-vue-next/es/popup";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import { useAppI18n } from "../../../shared/i18n";

const { t } = useAppI18n();

const props = defineProps<{
  value: string;
  history: readonly string[];
}>();
const emit = defineEmits<{
  "update:value": [value: string];
  find: [direction: "forward" | "backward"];
}>();

const control = ref<HTMLElement>();
const open = ref(false);
const activeIndex = ref<number>();
const composing = ref(false);
let ignorePopupCloseAfterKeyboard = false;
const listId = `workbook-find-history-${useId().replaceAll(":", "")}`;
const optionId = (index: number) => `${listId}-option-${index}`;
const nativeInput = computed(() => control.value?.querySelector<HTMLInputElement>("input") ?? null);
const hasHistory = computed(() => props.history.length > 0);
const activeDescendant = computed(() =>
  open.value && activeIndex.value !== undefined ? optionId(activeIndex.value) : undefined,
);
const popupProps: PopupProps = {
  placement: "bottom-left",
  overlayInnerStyle: (triggerElement) => ({
    width: `${triggerElement.offsetWidth}px`,
    padding: "0",
  }),
};
const inputProps = computed(() => ({
  autocomplete: "off",
}));

watchPostEffect(() => {
  const input = nativeInput.value;
  if (!input) return;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-label", t("navigation.findQueryLabel"));
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-expanded", String(open.value));
  input.setAttribute("aria-controls", listId);
  if (activeDescendant.value) input.setAttribute("aria-activedescendant", activeDescendant.value);
  else input.removeAttribute("aria-activedescendant");
});
watch(open, (visible) => {
  if (!visible) activeIndex.value = undefined;
});
watch([open, activeIndex], () => {
  if (!open.value || activeIndex.value === undefined) return;
  void nextTick(() =>
    document.getElementById(optionId(activeIndex.value!))?.scrollIntoView({ block: "nearest" }),
  );
});

function focus(): void {
  nativeInput.value?.focus({ preventScroll: true });
}
function updateValue(value: string): void {
  activeIndex.value = undefined;
  emit("update:value", value);
}
function openHistory(index?: number): void {
  open.value = true;
  activeIndex.value = index;
}
function closeHistory(): void {
  open.value = false;
}
function chooseHistory(index: number): void {
  const value = props.history[index];
  if (value === undefined) return;
  updateValue(value);
  closeHistory();
  void nextTick(focus);
}
function moveHistory(direction: 1 | -1): void {
  if (!hasHistory.value) return;
  ignorePopupCloseAfterKeyboard = true;
  void nextTick(() => {
    ignorePopupCloseAfterKeyboard = false;
  });
  const last = props.history.length - 1;
  if (!open.value || activeIndex.value === undefined) {
    openHistory(direction === 1 ? 0 : last);
    return;
  }
  activeIndex.value = (activeIndex.value + direction + props.history.length) % props.history.length;
}
function startComposition(): void {
  composing.value = true;
}
function endComposition(): void {
  composing.value = false;
}
function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing || composing.value) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    moveHistory(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    moveHistory(-1);
    return;
  }
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    closeHistory();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.stopPropagation();
  if (open.value && activeIndex.value !== undefined) chooseHistory(activeIndex.value);
  else emit("find", event.shiftKey ? "backward" : "forward");
}
function onPopupVisibleChange(visible: boolean): void {
  if (!visible && ignorePopupCloseAfterKeyboard) return;
  open.value = visible;
}
function onPaste({ e, pasteValue }: { e: ClipboardEvent; pasteValue: string }): void {
  if (!/[\r\n]/.test(pasteValue)) return;
  e.preventDefault();
  insertText(pasteValue.replace(/\r\n?|\n/g, "^l"));
}
function insertText(text: string): void {
  const input = nativeInput.value;
  const edit = insertTextAtSelection(
    props.value,
    input?.selectionStart ?? props.value.length,
    input?.selectionEnd ?? props.value.length,
    text,
  );
  updateValue(edit.value);
  void nextTick(() => {
    focus();
    nativeInput.value?.setSelectionRange(edit.caret, edit.caret);
  });
}

defineExpose({ focus, insertText });
</script>

<template>
  <div
    ref="control"
    class="workbook-find-query-input"
    data-search-input
    @keydown.capture="onKeydown"
    @compositionstart.capture="startComposition"
    @compositionend.capture="endComposition"
  >
    <TSelectInput
      class="workbook-find-query-input__control"
      :value="value"
      :input-value="value"
      :allow-input="true"
      :popup-visible="open"
      :popup-props="popupProps"
      :input-props="inputProps"
      :on-paste="onPaste"
      :placeholder="t('navigation.findQueryLabel')"
      @input-change="updateValue"
      @popup-visible-change="onPopupVisibleChange"
    >
      <template #suffixIcon>
        <ChevronDown
          :size="14"
          aria-hidden="true"
          :class="['workbook-find-query-input__arrow', { 'is-open': open }]"
        />
      </template>
      <template #panel>
        <div
          :id="listId"
          class="workbook-find-query-input__history"
          role="listbox"
          :aria-label="t('navigation.findHistory')"
        >
          <span v-if="!history.length" class="workbook-find-query-input__history-empty">
            {{ t("navigation.findHistoryEmpty") }}
          </span>
          <button
            v-for="(entry, index) in history"
            :id="optionId(index)"
            :key="`${entry}-${index}`"
            class="workbook-find-query-input__history-option"
            :class="{ 'is-active': activeIndex === index }"
            type="button"
            role="option"
            :aria-selected="activeIndex === index"
            tabindex="-1"
            @mousedown.prevent
            @click="chooseHistory(index)"
          >
            {{ entry }}
          </button>
        </div>
      </template>
    </TSelectInput>
  </div>
</template>

<style scoped lang="scss">
.workbook-find-query-input {
  min-width: 0;

  &__control {
    width: 100%;
  }

  &__arrow.is-open {
    transform: rotate(180deg);
  }

  &__history {
    max-height: 224px;
    overflow-y: auto;
    background: var(--idea-surface-panel);
  }

  &__history-empty,
  &__history-option {
    display: block;
    width: 100%;
    min-height: 28px;
    padding: 4px var(--idea-space-2);
    overflow: hidden;
    color: var(--idea-text-primary);
    font: inherit;
    line-height: var(--idea-line-height-body-small);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover,
    &.is-active {
      background: var(--idea-surface-hover);
    }
  }

  &__history-empty {
    color: var(--idea-text-secondary);
    cursor: default;
  }
}
</style>
