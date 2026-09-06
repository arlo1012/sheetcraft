<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
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
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  insert: [payload: { direction: "before" | "after"; count: number }];
  resize: [size: number];
  delete: [];
  clear: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const countDraft = ref(String(props.selectionCount));
const sizeDraft = ref(props.currentSize === undefined ? "" : String(props.currentSize));
const menuOpen = computed(() => true);
const menuAnchor = computed(() => props.anchor);
const { floatingStyles: menuStyle } = useDismissibleFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});
const maximumInsertCount = computed(() => Math.max(props.maxBeforeCount, props.maxAfterCount));
const insertCount = computed(() =>
  normalizeInteger(countDraft.value, 1, Math.max(1, maximumInsertCount.value)),
);
const axisUnit = computed(() =>
  t(
    props.axis === "row"
      ? insertCount.value === 1
        ? "axisMenu.rowUnitOne"
        : "axisMenu.rowUnit"
      : insertCount.value === 1
        ? "axisMenu.columnUnitOne"
        : "axisMenu.columnUnit",
  ),
);

watch(
  () => props.selectionCount,
  (count) => {
    countDraft.value = String(count);
  },
);
watch(
  () => props.currentSize,
  (size) => {
    sizeDraft.value = size === undefined ? "" : String(size);
  },
);

function normalizeInteger(value: string, minimum: number, maximum: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
}

function normalizeInsertCount(): number {
  countDraft.value = String(insertCount.value);
  return insertCount.value;
}

function requestInsert(direction: "before" | "after"): void {
  if (props.readOnly) return;
  emit("insert", { direction, count: normalizeInsertCount() });
}

function requestResize(): void {
  if (props.readOnly) return;
  if (sizeDraft.value === "") {
    return;
  }
  const size = normalizeInteger(sizeDraft.value, props.minimumSize, props.maximumSize);
  sizeDraft.value = String(size);
  if (size === props.currentSize) {
    return;
  }
  emit("resize", size);
}

function updateCountDraft(event: Event): void {
  countDraft.value = (event.currentTarget as HTMLInputElement).value;
}

function updateSizeDraft(event: Event): void {
  sizeDraft.value = (event.currentTarget as HTMLInputElement).value;
}

function blurNumberInput(event: KeyboardEvent): void {
  (event.currentTarget as HTMLInputElement).blur();
}

function getInsertActionLabel(direction: "before" | "after"): string {
  const key: MessageKey =
    props.axis === "row"
      ? direction === "before"
        ? "axisMenu.insertAbove"
        : "axisMenu.insertBelow"
      : direction === "before"
        ? "axisMenu.insertBefore"
        : "axisMenu.insertAfter";
  return t(key);
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

onMounted(() => {
  void nextTick(() => menuSurfaceRef.value?.focusFirstItem());
});
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="menuSurfaceRef"
      class="sheet-axis-context-menu"
      :style="menuStyle"
      :label="t(axis === 'row' ? 'axisMenu.rowActions' : 'axisMenu.columnActions')"
    >
      <MenuItem
        data-axis-action="insert-before"
        :disabled="readOnly || insertCount > maxBeforeCount"
        :aria-label="getInsertLabel('before')"
        @select="requestInsert('before')"
      >
        {{ getInsertActionLabel("before") }}
        <template #trailing>
          <input
            class="sheet-axis-context-menu__number-input"
            data-axis-insert-count="before"
            type="number"
            inputmode="numeric"
            :disabled="readOnly || insertCount > maxBeforeCount"
            :value="countDraft"
            :min="1"
            :max="Math.max(1, maximumInsertCount)"
            step="1"
            :aria-label="getInsertLabel('before')"
            @input="updateCountDraft"
            @blur="normalizeInsertCount"
            @keydown.enter.prevent="blurNumberInput"
          />
          <span>{{ axisUnit }}</span>
        </template>
      </MenuItem>
      <MenuItem
        data-axis-action="insert-after"
        :disabled="readOnly || insertCount > maxAfterCount"
        :aria-label="getInsertLabel('after')"
        @select="requestInsert('after')"
      >
        {{ getInsertActionLabel("after") }}
        <template #trailing>
          <input
            class="sheet-axis-context-menu__number-input"
            data-axis-insert-count="after"
            type="number"
            inputmode="numeric"
            :disabled="readOnly || insertCount > maxAfterCount"
            :value="countDraft"
            :min="1"
            :max="Math.max(1, maximumInsertCount)"
            step="1"
            :aria-label="getInsertLabel('after')"
            @input="updateCountDraft"
            @blur="normalizeInsertCount"
            @keydown.enter.prevent="blurNumberInput"
          />
          <span>{{ axisUnit }}</span>
        </template>
      </MenuItem>

      <li v-if="currentSize !== undefined" class="sheet-axis-context-menu__size-row" role="none">
        <span>{{ t(axis === "row" ? "axisMenu.rowHeight" : "axisMenu.columnWidth") }}</span>
        <label class="sheet-axis-context-menu__size-field">
          <input
            class="sheet-axis-context-menu__number-input sheet-axis-context-menu__number-input--size"
            type="number"
            inputmode="numeric"
            :value="sizeDraft"
            :min="minimumSize"
            :max="maximumSize"
            step="1"
            :disabled="readOnly"
            :aria-label="t(axis === 'row' ? 'axisMenu.rowHeight' : 'axisMenu.columnWidth')"
            @input="updateSizeDraft"
            @blur="requestResize"
            @keydown.enter.prevent="blurNumberInput"
          />
          <span>{{ t("axisMenu.pixels") }}</span>
        </label>
      </li>

      <MenuSeparator />
      <MenuItem danger data-axis-action="delete" :disabled="readOnly" @select="emit('delete')">
        {{ getSelectionActionLabel("delete") }}
      </MenuItem>
      <MenuItem data-axis-action="clear" :disabled="readOnly" @select="emit('clear')">
        {{ getSelectionActionLabel("clear") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-axis-context-menu {
  z-index: 100;
  width: 195px;

  &__number-input {
    width: 38px;
    height: 22px;
    padding: 0 4px;
    appearance: textfield;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-small);
    color: var(--idea-text-primary);
    font: inherit;
    letter-spacing: 0;
    text-align: center;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    &:hover {
      border-color: var(--idea-action-primary);
    }

    &:focus {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--idea-action-focus);
    }

    &:disabled {
      background: var(--idea-surface-disabled);
      border-color: var(--idea-border-subtle);
      color: var(--idea-text-disabled);
      cursor: not-allowed;
    }

    &--size {
      width: 48px;
    }
  }

  &__size-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 30px;
    gap: 8px;
    padding: 0 14px;
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    list-style: none;
  }

  &__size-field {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--idea-text-secondary);
  }
}
</style>
