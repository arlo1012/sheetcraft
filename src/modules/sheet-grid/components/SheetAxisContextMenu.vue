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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from "vue";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import type { SheetDimensionAxis } from "../../workbook/workbook";

const props = defineProps<{
  axis: SheetDimensionAxis;
  selectionCount: number;
  maxBeforeCount: number;
  maxAfterCount: number;
  currentSize?: number;
  minimumSize: number;
  maximumSize: number;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  insert: [payload: { direction: "before" | "after"; count: number }];
  resize: [size: number];
  delete: [];
  clear: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuRef = ref<HTMLDivElement>();
const countDraft = ref(props.selectionCount);
const sizeDraft = ref(props.currentSize);
const menuStyle = computed<CSSProperties>(() => ({
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
}));
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

function normalizeInteger(value: number | undefined, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(value ?? minimum)));
}

function normalizeInsertCount(): number {
  countDraft.value = insertCount.value;
  return insertCount.value;
}

function requestInsert(direction: "before" | "after"): void {
  emit("insert", { direction, count: normalizeInsertCount() });
}

function requestResize(): void {
  if (sizeDraft.value === undefined) {
    return;
  }
  const size = normalizeInteger(sizeDraft.value, props.minimumSize, props.maximumSize);
  sizeDraft.value = size;
  emit("resize", size);
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
    ...(menuRef.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
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
    menuRef.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(),
  );
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
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
      <input
        v-model.number="countDraft"
        type="number"
        min="1"
        :max="Math.max(1, maximumInsertCount)"
        @change="normalizeInsertCount"
      />
      <span>{{ axisUnit }}</span>
    </label>
    <button type="button" :disabled="insertCount > maxBeforeCount" @click="requestInsert('before')">
      <ArrowUp v-if="axis === 'row'" :size="15" aria-hidden="true" />
      <ArrowLeft v-else :size="15" aria-hidden="true" />
      <span>{{ getInsertLabel("before") }}</span>
    </button>
    <button type="button" :disabled="insertCount > maxAfterCount" @click="requestInsert('after')">
      <ArrowDown v-if="axis === 'row'" :size="15" aria-hidden="true" />
      <ArrowRight v-else :size="15" aria-hidden="true" />
      <span>{{ getInsertLabel("after") }}</span>
    </button>

    <label v-if="currentSize !== undefined" class="sheet-axis-context-menu__size-row">
      <Scaling :size="15" aria-hidden="true" />
      <span>{{ t(axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth") }}</span>
      <input
        v-model.number="sizeDraft"
        type="number"
        :min="minimumSize"
        :max="maximumSize"
        @change="requestResize"
        @keydown.enter.prevent="requestResize"
      />
      <span>{{ t("axisMenu.pixels") }}</span>
    </label>

    <div class="sheet-axis-context-menu__separator" role="separator" />
    <button type="button" @click="emit('delete')">
      <Trash2 :size="15" aria-hidden="true" />
      <span>{{ getSelectionActionLabel("delete") }}</span>
    </button>
    <button type="button" @click="emit('clear')">
      <Eraser :size="15" aria-hidden="true" />
      <span>{{ getSelectionActionLabel("clear") }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.sheet-axis-context-menu {
  position: absolute;
  z-index: 20;
  display: grid;
  width: 272px;
  max-width: calc(100% - 8px);
  max-height: calc(100% - 8px);
  padding: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--ui-surface-primary);
  border: 1px solid var(--ui-border-strong);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgb(32 36 44 / 18%);

  button {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    background: transparent;
    border: 0;
    border-radius: 3px;
    color: var(--ui-text-primary);
    font: inherit;
    font-size: 12px;
    letter-spacing: 0;
    text-align: left;
    cursor: pointer;

    &:hover:not(:disabled),
    &:focus-visible {
      background: var(--ui-brand-soft);
      outline: none;
    }

    &:disabled {
      color: var(--ui-text-muted);
      cursor: not-allowed;
      opacity: 0.55;
    }
  }

  input {
    width: 48px;
    height: 24px;
    min-width: 0;
    padding: 0 4px;
    background: var(--ui-surface-primary);
    border: 1px solid var(--ui-border-default);
    border-radius: 3px;
    color: var(--ui-text-primary);
    font-size: 12px;
    letter-spacing: 0;
    text-align: right;

    &:focus-visible {
      border-color: var(--ui-brand-primary);
      outline: 1px solid var(--ui-brand-primary);
    }
  }

  &__count-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px auto;
    align-items: center;
    min-height: 32px;
    padding: 0 8px;
    color: var(--ui-text-secondary);
    font-size: 12px;

    input {
      width: 56px;
    }

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
    color: var(--ui-text-primary);
    font-size: 12px;

    input {
      width: 56px;
    }

    > span:last-child {
      padding-left: 5px;
      color: var(--ui-text-secondary);
    }
  }

  &__separator {
    height: 1px;
    margin: 4px -4px;
    background: var(--ui-border-default);
  }
}
</style>
