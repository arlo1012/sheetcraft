<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS, type FreezePanes } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { useFreezeDrag, type FreezeAxis } from "../composables/useFreezeDrag";
import type {
  FreezeHandleTarget,
  SheetFreezeDragOverlay,
  SheetFreezeHandlesOverlay,
} from "../rendering/overlay-types";

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
  previewChange: [preview: SheetFreezeDragOverlay | undefined];
  visualStateChange: [state: SheetFreezeHandlesOverlay];
}>();

const { t } = useAppI18n();
const { freezeDrag, start, stop } = useFreezeDrag({
  getRoot: () => props.rootElement,
  getLayout: () => props.layout,
  getHeaderSize: () => props.headerSize,
  onDragChange: (active) => emit("dragChange", active),
  onCommit: (freezePanes) => emit("freezeChange", freezePanes),
});

const rowBoundary = computed(() => props.headerSize.height + props.layout.frozenSize.height);
const columnBoundary = computed(() => props.headerSize.width + props.layout.frozenSize.width);
const hovered = ref<FreezeHandleTarget | null>(null);
const focused = ref<FreezeHandleTarget | null>(null);

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

function emitVisualState(): void {
  emit("visualStateChange", {
    visible: true,
    disabled: props.disabled,
    hovered: hovered.value,
    focused: focused.value,
  });
}

function setHovered(target: FreezeHandleTarget | null): void {
  hovered.value = target;
}

function setFocused(target: FreezeHandleTarget | null): void {
  focused.value = target;
}

watch(
  () => {
    const drag = freezeDrag.value;
    return (
      drag && {
        axis: drag.axis,
        count: drag.count,
        previewPosition: drag.previewPosition,
      }
    );
  },
  (drag) =>
    emit(
      "previewChange",
      drag
        ? {
            axis: drag.axis,
            previewPosition: drag.previewPosition,
            label: label(drag.axis, drag.count),
          }
        : undefined,
    ),
  { flush: "sync" },
);

watch([hovered, focused, () => props.disabled], emitVisualState, {
  flush: "sync",
  immediate: true,
});

watch(
  () => [props.layout.freeze.rows, props.layout.freeze.columns] as const,
  ([rows, columns]) => {
    if (rows === 0 && hovered.value === "rowBoundary") hovered.value = null;
    if (rows === 0 && focused.value === "rowBoundary") focused.value = null;
    if (columns === 0 && hovered.value === "columnBoundary") hovered.value = null;
    if (columns === 0 && focused.value === "columnBoundary") focused.value = null;
  },
  { flush: "sync" },
);

onBeforeUnmount(() => {
  stop();
  emit("previewChange", undefined);
  emit("visualStateChange", { visible: false });
});

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) stop();
  },
  { flush: "sync" },
);
</script>

<template>
  <div class="sheet-freeze-handles">
    <button
      type="button"
      class="sheet-freeze-handles__starter sheet-freeze-handles__starter--rows"
      :disabled="disabled"
      :aria-label="t('grid.freezeRows')"
      :title="t('grid.freezeRows')"
      @pointerdown.prevent.stop="start('row', $event)"
      @keydown="keyboardAdjust('row', $event)"
      @mouseenter="setHovered('rowStarter')"
      @mouseleave="setHovered(null)"
      @focus="setFocused('rowStarter')"
      @blur="setFocused(null)"
    />
    <button
      type="button"
      class="sheet-freeze-handles__starter sheet-freeze-handles__starter--columns"
      :disabled="disabled"
      :aria-label="t('grid.freezeColumns')"
      :title="t('grid.freezeColumns')"
      @pointerdown.prevent.stop="start('column', $event)"
      @keydown="keyboardAdjust('column', $event)"
      @mouseenter="setHovered('columnStarter')"
      @mouseleave="setHovered(null)"
      @focus="setFocused('columnStarter')"
      @blur="setFocused(null)"
    />
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
      @mouseenter="setHovered('rowBoundary')"
      @mouseleave="setHovered(null)"
      @focus="setFocused('rowBoundary')"
      @blur="setFocused(null)"
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
      @mouseenter="setHovered('columnBoundary')"
      @mouseleave="setHovered(null)"
      @focus="setFocused('columnBoundary')"
      @blur="setFocused(null)"
    />
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
  padding: 0;
  border: 0;
  background: transparent;
  color: transparent;
  outline: 0;
  appearance: none;
  touch-action: none;
}
.sheet-freeze-handles__starter {
  width: 16px;
  height: 16px;
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
.sheet-freeze-handles__boundary--row {
  left: 0;
  right: 0;
  height: 6px;
  transform: translateY(-3px);
  cursor: row-resize;
}
.sheet-freeze-handles__boundary--column {
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-3px);
  cursor: col-resize;
}
</style>
