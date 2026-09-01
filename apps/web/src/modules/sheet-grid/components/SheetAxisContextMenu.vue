<script setup lang="ts">
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eraser,
  Scaling,
  Trash2,
} from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { SheetDimensionAxis } from "@idea10/core/workbook";

const props = defineProps<{
  axis: SheetDimensionAxis;
  selectionCount: number;
  maxBeforeCount: number;
  maxAfterCount: number;
  currentSize?: number;
  minimumSize: number;
  maximumSize: number;
  anchor: FloatingReference;
}>();

const emit = defineEmits<{
  insert: [payload: { direction: "before" | "after"; count: number }];
  resize: [size: number];
  delete: [];
  clear: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuRef = ref<HTMLDivElement | null>(null);
const countDraft = ref<InputNumberValue>(props.selectionCount);
const sizeDraft = ref<InputNumberValue | undefined>(props.currentSize);
const menuOpen = computed(() => true);
const menuAnchor = computed(() => props.anchor);
const { floatingStyles: menuStyle } = useFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
});
const maximumInsertCount = computed(() => Math.max(props.maxBeforeCount, props.maxAfterCount));
const insertCount = computed(() =>
  normalizeInteger(countDraft.value, 1, Math.max(1, maximumInsertCount.value)),
);
const axisUnit = computed(() =>
  t(props.axis === "row" ? "axisMenu.rowUnit" : "axisMenu.columnUnit"),
);

watch(
  () => props.selectionCount,
  (count) => {
    countDraft.value = count;
  },
);
watch(
  () => props.currentSize,
  (size) => {
    sizeDraft.value = size;
  },
);

function normalizeInteger(
  value: InputNumberValue | undefined,
  minimum: number,
  maximum: number,
): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
}

function normalizeInsertCount(): number {
  countDraft.value = insertCount.value;
  return insertCount.value;
}

function requestInsert(direction: "before" | "after"): void {
  emit("insert", { direction, count: normalizeInsertCount() });
}

function requestResize(): void {
  if (sizeDraft.value === undefined || sizeDraft.value === "") {
    return;
  }
  const size = normalizeInteger(sizeDraft.value, props.minimumSize, props.maximumSize);
  sizeDraft.value = size;
  if (size === props.currentSize) {
    return;
  }
  emit("resize", size);
}

function updateCountDraft(value: InputNumberValue): void {
  countDraft.value = value;
}

function updateSizeDraft(value: InputNumberValue): void {
  sizeDraft.value = value;
}

function blurNumberInput(_value: InputNumberValue, context: { e: KeyboardEvent }): void {
  (context.e.target as HTMLInputElement).blur();
}

function getInsertLabel(direction: "before" | "after"): string {
  const count = insertCount.value;
  let key: MessageKey;
  if (props.axis === "row") {
    key =
      direction === "before"
        ? count === 1
          ? "axisMenu.insertRowAboveOne"
          : "axisMenu.insertRowsAbove"
        : count === 1
          ? "axisMenu.insertRowBelowOne"
          : "axisMenu.insertRowsBelow";
  } else {
    key =
      direction === "before"
        ? count === 1
          ? "axisMenu.insertColumnBeforeOne"
          : "axisMenu.insertColumnsBefore"
        : count === 1
          ? "axisMenu.insertColumnAfterOne"
          : "axisMenu.insertColumnsAfter";
  }
  return t(key, { count });
}

function getSelectionActionLabel(action: "delete" | "clear"): string {
  const count = props.selectionCount;
  const key: MessageKey =
    props.axis === "row"
      ? action === "delete"
        ? count === 1
          ? "axisMenu.deleteRowOne"
          : "axisMenu.deleteRows"
        : count === 1
          ? "axisMenu.clearRowOne"
          : "axisMenu.clearRows"
      : action === "delete"
        ? count === 1
          ? "axisMenu.deleteColumnOne"
          : "axisMenu.deleteColumns"
        : count === 1
          ? "axisMenu.clearColumnOne"
          : "axisMenu.clearColumns";
  return t(key, { count });
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuRef.value?.contains(event.target as Node)) {
    emit("close", false);
  }
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close", true);
  }
}

function onPopoverKeydown(event: KeyboardEvent): void {
  if (event.target instanceof HTMLInputElement) {
    return;
  }
  const items = [
    ...(menuRef.value?.querySelectorAll<HTMLButtonElement>("[data-axis-action]:not(:disabled)") ??
      []),
  ];
  const currentIndex = items.indexOf(event.target as HTMLButtonElement);
  let nextIndex: number | undefined;
  if (event.key === "ArrowDown") {
    nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
  } else if (event.key === "ArrowUp") {
    nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = items.length - 1;
  }
  if (nextIndex !== undefined) {
    event.preventDefault();
    items[nextIndex]?.focus();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
  void nextTick(() =>
    menuRef.value?.querySelector<HTMLButtonElement>("[data-axis-action]:not(:disabled)")?.focus(),
  );
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="sheet-axis-context-menu"
      :style="menuStyle"
      role="dialog"
      aria-modal="false"
      :aria-label="t(axis === 'row' ? 'axisMenu.rowActions' : 'axisMenu.columnActions')"
      @contextmenu.prevent
      @keydown="onPopoverKeydown"
    >
      <label class="sheet-axis-context-menu__count-row">
        <span>{{ t("axisMenu.insertCount") }}</span>
        <TInputNumber
          class="sheet-axis-context-menu__number-input"
          theme="normal"
          size="small"
          align="right"
          :model-value="countDraft"
          :min="1"
          :max="Math.max(1, maximumInsertCount)"
          :decimal-places="0"
          :step="1"
          :allow-input-over-limit="true"
          @change="updateCountDraft"
          @blur="normalizeInsertCount"
          @enter="blurNumberInput"
        />
        <span>{{ axisUnit }}</span>
      </label>
      <TButton
        type="button"
        variant="text"
        size="small"
        block
        class="sheet-axis-context-menu__action"
        data-axis-action="insert-before"
        :disabled="insertCount > maxBeforeCount"
        @click="requestInsert('before')"
      >
        <template #icon>
          <ArrowUp v-if="axis === 'row'" :size="15" aria-hidden="true" />
          <ArrowLeft v-else :size="15" aria-hidden="true" />
        </template>
        {{ getInsertLabel("before") }}
      </TButton>
      <TButton
        type="button"
        variant="text"
        size="small"
        block
        class="sheet-axis-context-menu__action"
        data-axis-action="insert-after"
        :disabled="insertCount > maxAfterCount"
        @click="requestInsert('after')"
      >
        <template #icon>
          <ArrowDown v-if="axis === 'row'" :size="15" aria-hidden="true" />
          <ArrowRight v-else :size="15" aria-hidden="true" />
        </template>
        {{ getInsertLabel("after") }}
      </TButton>

      <label v-if="currentSize !== undefined" class="sheet-axis-context-menu__size-row">
        <Scaling :size="15" aria-hidden="true" />
        <span>{{ t(axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth") }}</span>
        <TInputNumber
          class="sheet-axis-context-menu__number-input"
          theme="normal"
          size="small"
          align="right"
          :model-value="sizeDraft"
          :min="minimumSize"
          :max="maximumSize"
          :decimal-places="0"
          :step="1"
          :allow-input-over-limit="true"
          @change="updateSizeDraft"
          @blur="requestResize"
          @enter="blurNumberInput"
        />
        <span>{{ t("axisMenu.pixels") }}</span>
      </label>

      <div class="sheet-axis-context-menu__separator" role="separator" />
      <TButton
        type="button"
        theme="danger"
        variant="text"
        size="small"
        block
        class="sheet-axis-context-menu__action"
        data-axis-action="delete"
        @click="emit('delete')"
      >
        <template #icon>
          <Trash2 :size="15" aria-hidden="true" />
        </template>
        {{ getSelectionActionLabel("delete") }}
      </TButton>
      <TButton
        type="button"
        variant="text"
        size="small"
        block
        class="sheet-axis-context-menu__action"
        data-axis-action="clear"
        @click="emit('clear')"
      >
        <template #icon>
          <Eraser :size="15" aria-hidden="true" />
        </template>
        {{ getSelectionActionLabel("clear") }}
      </TButton>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-axis-context-menu {
  z-index: 100;
  display: grid;
  width: 272px;
  max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
  max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
  padding: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-floating);

  &__action {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    justify-content: stretch;
    width: 100%;
    min-height: 32px;
    padding: 0 8px;
    font-size: 12px;
    letter-spacing: 0;
    text-align: left;
  }

  &__number-input {
    width: 56px;
    min-width: 0;
  }

  &__count-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px auto;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    color: var(--idea-text-secondary);
    font-size: 12px;

    > span:last-child {
      padding-left: 5px;
    }
  }

  &__size-row {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 56px auto;
    align-items: center;
    min-height: 34px;
    padding: 0 8px;
    color: var(--idea-text-primary);
    font-size: 12px;

    > span:last-child {
      padding-left: 5px;
      color: var(--idea-text-secondary);
    }
  }

  &__separator {
    height: 1px;
    margin: 4px -4px;
    background: var(--idea-border-subtle);
  }
}
</style>
