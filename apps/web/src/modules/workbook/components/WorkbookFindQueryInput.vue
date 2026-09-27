<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { AutoComplete } from "tdesign-vue-next/es/auto-complete";
import { ChevronDown } from "lucide-vue-next";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";

const props = defineProps<{ value: string; history: readonly string[] }>();
const emit = defineEmits<{
  "update:value": [value: string];
  find: [direction: "forward" | "backward"];
}>();
const { t } = useAppI18n();
const input = ref<HTMLInputElement | null>(null);
const open = ref(false);
const composing = ref(false);
const options = computed(() => [...props.history]);
const selectedEvents = new WeakSet<Event>();

function setInput(element: HTMLInputElement | HTMLTextAreaElement | null): void {
  input.value = element instanceof HTMLInputElement ? element : null;
}
function focus(): void {
  input.value?.focus({ preventScroll: true });
}
function toggleHistory(): void {
  const wasOpen = open.value;
  input.value?.blur();
  if (!wasOpen) focus();
  open.value = !wasOpen;
}
function onSelect(_value: string, { e }: { e: MouseEvent | KeyboardEvent }): void {
  selectedEvents.add(e);
  open.value = false;
}
function onEnter({ e }: { e: KeyboardEvent }): void {
  if (e.isComposing || composing.value) return;
  e.preventDefault();
  // AutoComplete selects the highlighted option later in this same key event.
  // Only an Enter that did not select a history item should run a search.
  void nextTick(() => {
    if (!selectedEvents.has(e)) emit("find", e.shiftKey ? "backward" : "forward");
  });
}
function onKeydown(event: KeyboardEvent): void {
  if (event.target !== input.value) return;
  if (event.isComposing || composing.value) {
    event.stopPropagation();
  } else if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    open.value = false;
    input.value?.blur();
  } else if (!open.value && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    input.value?.blur();
    focus();
    open.value = true;
  }
}
function onPaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData("text/plain");
  if (!text || !/[\r\n]/.test(text)) return;
  event.preventDefault();
  insertText(text.replace(/\r\n?|\n/g, "^l"));
}
function insertText(text: string): void {
  const edit = insertTextAtSelection(
    props.value,
    input.value?.selectionStart ?? props.value.length,
    input.value?.selectionEnd ?? props.value.length,
    text,
  );
  emit("update:value", edit.value);
  void nextTick(() => {
    focus();
    input.value?.setSelectionRange(edit.caret, edit.caret);
  });
}
defineExpose({ focus, insertText });
</script>

<template>
  <AutoComplete
    class="workbook-find-query-input"
    data-search-input
    v-native-control="{
      onElement: setInput,
      attributes: { 'aria-label': t('navigation.findQueryLabel'), autocomplete: 'off' },
    }"
    :value="value"
    :options="options"
    :popup-props="{ visible: open, destroyOnClose: true }"
    :filterable="false"
    :highlight-keyword="false"
    :placeholder="t('navigation.findQueryLabel')"
    :empty="t('navigation.findHistoryEmpty')"
    @change="emit('update:value', $event)"
    @blur="open = false"
    @select="onSelect"
    @enter="onEnter"
    @compositionstart="composing = true"
    @compositionend="composing = false"
    @keydown.capture="onKeydown"
    @paste.capture="onPaste"
  >
    <template #suffixIcon>
      <ChevronDown
        class="workbook-find-query-input__arrow"
        :class="{ 'is-open': open }"
        :size="14"
        role="button"
        tabindex="0"
        :aria-hidden="false"
        :aria-label="t('navigation.findHistory')"
        :aria-expanded="open"
        @mousedown.prevent
        @click.stop="toggleHistory"
        @keydown.enter.stop.prevent="toggleHistory"
        @keydown.space.stop.prevent="toggleHistory"
      />
    </template>
    <template #option="{ option }"
      ><span @mousedown.prevent>{{ option.text }}</span></template
    >
  </AutoComplete>
</template>

<style scoped lang="scss">
.workbook-find-query-input {
  width: 100%;
  min-width: 0;

  &__arrow {
    cursor: pointer;

    &.is-open {
      transform: rotate(180deg);
    }
  }
}
</style>
