<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { GripHorizontal, GripVertical } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type FreezePanes } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { useFreezeDrag, type FreezeAxis } from "../composables/useFreezeDrag";

const props = withDefaults(
  defineProps<{
    layout: SheetViewportLayout;
    headerSize: { width: number; height: number };
    rootElement: HTMLElement | null;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  freezeChange: [freezePanes: FreezePanes];
  dragChange: [active: boolean];
}>();

const { t } = useAppI18n();
const { freezeDrag, start, stop } = useFreezeDrag({
  getRoot: () => props.rootElement,
  getLayout: () => props.layout,
  getHeaderSize: () => props.headerSize,
  onDragChange: (active) => emit("dragChange", active),
  onCommit: (freezePanes) => emit("freezeChange", freezePanes),
});

const preview = computed(() => freezeDrag.value);
const rowBoundary = computed(() => props.headerSize.height + props.layout.frozenSize.height);
const columnBoundary = computed(() => props.headerSize.width + props.layout.frozenSize.width);

function label(axis: FreezeAxis, count: number): string {
  if (count === 0) return t(axis === "row" ? "grid.unfreezeRows" : "grid.unfreezeColumns");
  return t(axis === "row" ? "grid.freezeRowCount" : "grid.freezeColumnCount", { count });
}

function keyboardAdjust(axis: FreezeAxis, event: KeyboardEvent): void {
  const decrease = axis === "row" ? event.key === "ArrowUp" : event.key === "ArrowLeft";
  const increase = axis === "row" ? event.key === "ArrowDown" : event.key === "ArrowRight";
  if (!decrease && !increase) return;
  event.preventDefault();
  const current = axis === "row" ? props.layout.freeze.rows : props.layout.freeze.columns;
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  const next = Math.min(maximum, Math.max(0, current + (increase ? 1 : -1)));
  if (next === current) return;
  emit("freezeChange", {
    rows: axis === "row" ? next : props.layout.freeze.rows,
    columns: axis === "column" ? next : props.layout.freeze.columns,
  });
}

onBeforeUnmount(stop);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) stop();
  },
  { flush: "sync" },
);
</script>

<template>
  <div class="sheet-freeze-handles" :class="{ 'is-dragging': preview }" aria-live="polite">
    <button
      type="button"
      class="sheet-freeze-handles__starter sheet-freeze-handles__starter--rows"
      :disabled="disabled"
      :aria-label="t('grid.freezeRows')"
      :title="t('grid.freezeRows')"
      @pointerdown.prevent.stop="start('row', $event)"
      @keydown="keyboardAdjust('row', $event)"
    >
      <GripHorizontal :size="12" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="sheet-freeze-handles__starter sheet-freeze-handles__starter--columns"
      :disabled="disabled"
      :aria-label="t('grid.freezeColumns')"
      :title="t('grid.freezeColumns')"
      @pointerdown.prevent.stop="start('column', $event)"
      @keydown="keyboardAdjust('column', $event)"
    >
      <GripVertical :size="12" aria-hidden="true" />
    </button>
    <button
      v-if="layout.freeze.rows > 0"
      type="button"
      class="sheet-freeze-handles__boundary sheet-freeze-handles__boundary--row"
      :style="{ top: `${rowBoundary}px` }"
      :disabled="disabled"
      :aria-label="label('row', layout.freeze.rows)"
      :title="label('row', layout.freeze.rows)"
      @pointerdown.prevent.stop="start('row', $event)"
      @keydown="keyboardAdjust('row', $event)"
    />
    <button
      v-if="layout.freeze.columns > 0"
      type="button"
      class="sheet-freeze-handles__boundary sheet-freeze-handles__boundary--column"
      :style="{ left: `${columnBoundary}px` }"
      :disabled="disabled"
      :aria-label="label('column', layout.freeze.columns)"
      :title="label('column', layout.freeze.columns)"
      @pointerdown.prevent.stop="start('column', $event)"
      @keydown="keyboardAdjust('column', $event)"
    />
    <div
      v-if="preview"
      class="sheet-freeze-handles__preview"
      :class="`is-${preview.axis}`"
      :style="
        preview.axis === 'row'
          ? { top: `${headerSize.height + preview.previewPosition}px` }
          : { left: `${headerSize.width + preview.previewPosition}px` }
      "
      aria-hidden="true"
    >
      <span>{{ label(preview.axis, preview.count) }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-freeze-handles {
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
}
.sheet-freeze-handles__starter,
.sheet-freeze-handles__boundary {
  position: absolute;
  pointer-events: auto;
  display: grid;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--idea-text-secondary);
  touch-action: none;
}
.sheet-freeze-handles__starter {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--idea-icon-button-hover-bg);
    color: var(--idea-action-primary);
    outline: none;
  }
}
.sheet-freeze-handles__starter--rows {
  left: calc(var(--sheet-row-header-width) - 18px);
  top: 2px;
  cursor: row-resize;
}
.sheet-freeze-handles__starter--columns {
  left: 2px;
  top: calc(var(--sheet-column-header-height) - 18px);
  cursor: col-resize;
}
.sheet-freeze-handles__boundary {
  opacity: 0.72;
  &::after {
    content: "";
    position: absolute;
    background: var(--idea-text-muted);
    pointer-events: none;
  }
  &:hover:not(:disabled),
  &:focus-visible {
    opacity: 1;
    outline: none;
    &::after {
      background: var(--idea-action-primary);
    }
  }
}
.sheet-freeze-handles__boundary--row {
  left: 0;
  right: 0;
  height: 6px;
  transform: translateY(-3px);
  cursor: row-resize;
  &::after {
    left: 0;
    right: 0;
    height: 1px;
  }
}
.sheet-freeze-handles__boundary--column {
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-3px);
  cursor: col-resize;
  &::after {
    top: 0;
    bottom: 0;
    width: 1px;
  }
}
.sheet-freeze-handles__preview {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background: var(--idea-action-primary);
}
.sheet-freeze-handles__preview.is-row {
  left: var(--sheet-row-header-width);
  right: 0;
  height: 2px;
  transform: translateY(-1px);
}
.sheet-freeze-handles__preview.is-column {
  top: var(--sheet-column-header-height);
  bottom: 0;
  width: 2px;
  transform: translateX(-1px);
}
.sheet-freeze-handles__preview span {
  position: absolute;
  padding: 3px 6px;
  border-radius: var(--idea-radius-small);
  background: var(--idea-action-primary);
  color: var(--idea-text-inverse);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}
.sheet-freeze-handles__preview.is-row span {
  right: 8px;
  top: 4px;
}
.sheet-freeze-handles__preview.is-column span {
  left: 4px;
  bottom: 8px;
}
</style>
