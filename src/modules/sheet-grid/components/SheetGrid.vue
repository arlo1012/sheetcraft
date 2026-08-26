<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type CSSProperties,
} from "vue";
import { formatCellValueForDisplay, formatCellValueForInput } from "../../workbook/input";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getCellValue,
  type CellAddress,
  type Sheet,
} from "../../workbook/workbook";
import {
  DEFAULT_GRID_EXTENT_POLICY,
  DEFAULT_INITIAL_GRID_EXTENT,
  createGridExtent,
  expandGridExtentForAddress,
  expandGridExtentForViewport,
  type GridExtent,
} from "../extent";
import { createSheetGeometry, getCellAddressLabel, type Point, type Size } from "../geometry";
import { areCellAddressesEqual, moveCellAddress } from "../selection";
import CellEditor from "./CellEditor.vue";
import SheetCellLayer from "./SheetCellLayer.vue";
import SheetColumnHeaders from "./SheetColumnHeaders.vue";
import SheetRowHeaders from "./SheetRowHeaders.vue";
import SheetSelectionOverlay from "./SheetSelectionOverlay.vue";

type CellEditorHandle = {
  focus: (options?: { selectAll?: boolean; clientX?: number }) => void;
};

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    initialRowCount?: number;
    initialColumnCount?: number;
    rowExpansionStep?: number;
    columnExpansionStep?: number;
    rowExpansionTail?: number;
    columnExpansionTail?: number;
  }>(),
  {
    initialRowCount: DEFAULT_INITIAL_GRID_EXTENT.rowCount,
    initialColumnCount: DEFAULT_INITIAL_GRID_EXTENT.columnCount,
    rowExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.rowCount,
    columnExpansionStep: DEFAULT_GRID_EXTENT_POLICY.growth.columnCount,
    rowExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.rowCount,
    columnExpansionTail: DEFAULT_GRID_EXTENT_POLICY.tail.columnCount,
  },
);

const emit = defineEmits<{
  commitCell: [payload: { address: CellAddress; input: string }];
  undo: [];
  redo: [];
  selectionChange: [address: CellAddress];
}>();

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 28;
const DEFAULT_VIEWPORT_SIZE: Size = { width: 960, height: 600 };

const scrollerRef = ref<HTMLDivElement | null>(null);
const editorRef = ref<CellEditorHandle | null>(null);
const activeCell = ref<CellAddress>({ row: 0, column: 0 });
const editingValue = ref("");
const isEditing = ref(false);
const isComposing = ref(false);
const scrollPosition = reactive<Point>({ x: 0, y: 0 });
const viewportSize = reactive<Size>({ ...DEFAULT_VIEWPORT_SIZE });
const gridExtent = reactive<GridExtent>(
  createGridExtent({
    rowCount: props.initialRowCount,
    columnCount: props.initialColumnCount,
  }),
);
let resizeObserver: ResizeObserver | null = null;
let compositionStartValue = "";
let shouldFinishAfterComposition = false;

const geometry = computed(() =>
  createSheetGeometry({
    rowCount: gridExtent.rowCount,
    columnCount: gridExtent.columnCount,
  }),
);
const totalSize = computed(() => geometry.value.getTotalSize());
const visibleRange = computed(() =>
  geometry.value.getVisibleRange(scrollPosition, viewportSize, 2),
);
const activeCellRect = computed(() =>
  geometry.value.getCellViewportRect(activeCell.value, scrollPosition),
);
const activeCellLabel = computed(() => getCellAddressLabel(activeCell.value));
const activeCellDisplayValue = computed(() =>
  formatCellValueForDisplay(getCellValue(props.sheet, activeCell.value)),
);
const gridCanvasStyle = computed<CSSProperties>(() => ({
  width: `${totalSize.value.width}px`,
  height: `${totalSize.value.height}px`,
}));
const gridViewportStyle = computed<CSSProperties>(() => ({
  width: `${viewportSize.width}px`,
  height: `${viewportSize.height}px`,
}));
const gridLineStyle = computed<CSSProperties>(() => ({
  backgroundPosition: `${-(scrollPosition.x % geometry.value.columnWidth)}px ${-(scrollPosition.y % geometry.value.rowHeight)}px`,
  backgroundSize: `${geometry.value.columnWidth}px ${geometry.value.rowHeight}px`,
}));

function applyGridExtent(nextExtent: GridExtent): void {
  gridExtent.rowCount = nextExtent.rowCount;
  gridExtent.columnCount = nextExtent.columnCount;
}

function getGridExtentPolicy() {
  return {
    growth: {
      rowCount: props.rowExpansionStep,
      columnCount: props.columnExpansionStep,
    },
    tail: {
      rowCount: props.rowExpansionTail,
      columnCount: props.columnExpansionTail,
    },
  };
}

function ensureGridExtentContains(address: CellAddress): void {
  applyGridExtent(expandGridExtentForAddress(gridExtent, address, getGridExtentPolicy().growth));
}

function ensureGridExtentCoversViewport(): void {
  applyGridExtent(
    expandGridExtentForViewport(
      gridExtent,
      scrollPosition,
      viewportSize,
      {
        rowHeight: geometry.value.rowHeight,
        columnWidth: geometry.value.columnWidth,
      },
      getGridExtentPolicy(),
    ),
  );
}

function updateViewportSize(): void {
  const scroller = scrollerRef.value;
  if (!scroller) {
    return;
  }

  viewportSize.width = scroller.clientWidth || DEFAULT_VIEWPORT_SIZE.width;
  viewportSize.height = scroller.clientHeight || DEFAULT_VIEWPORT_SIZE.height;
  ensureGridExtentCoversViewport();
}

function focusEditor(selectAll = false, clientX?: number): void {
  void nextTick(() => editorRef.value?.focus({ selectAll, clientX }));
}

function ensureCellVisible(address: CellAddress): void {
  const scroller = scrollerRef.value;
  if (!scroller) {
    return;
  }

  const nextScrollPosition = geometry.value.getScrollPositionForCell(
    address,
    scrollPosition,
    viewportSize,
  );
  if (nextScrollPosition.x !== scrollPosition.x) {
    scroller.scrollLeft = nextScrollPosition.x;
    scrollPosition.x = nextScrollPosition.x;
  }
  if (nextScrollPosition.y !== scrollPosition.y) {
    scroller.scrollTop = nextScrollPosition.y;
    scrollPosition.y = nextScrollPosition.y;
  }
}

function setActiveCell(address: CellAddress): void {
  activeCell.value = { ...address };
  emit("selectionChange", { ...address });
  ensureCellVisible(address);
  focusEditor();
}

function beginEdit(mode: "append" | "replace", initialValue = "", clientX?: number): void {
  editingValue.value =
    mode === "append"
      ? formatCellValueForInput(getCellValue(props.sheet, activeCell.value))
      : initialValue;
  isEditing.value = true;
  focusEditor(false, clientX);
}

function finishEdit(destination?: CellAddress, restoreFocus = true): void {
  if (isEditing.value) {
    emit("commitCell", {
      address: { ...activeCell.value },
      input: editingValue.value,
    });
  }

  isEditing.value = false;
  isComposing.value = false;
  shouldFinishAfterComposition = false;
  editingValue.value = "";
  if (destination) {
    setActiveCell(destination);
  } else if (restoreFocus) {
    focusEditor();
  }
}

function cancelEdit(restoreFocus = true): void {
  isEditing.value = false;
  isComposing.value = false;
  shouldFinishAfterComposition = false;
  editingValue.value = "";
  if (restoreFocus) {
    focusEditor();
  }
}

function moveSelection(delta: { rows?: number; columns?: number }, commitEdit: boolean): void {
  const destination = moveCellAddress(activeCell.value, delta, {
    rowCount: MAX_SHEET_ROWS,
    columnCount: MAX_SHEET_COLUMNS,
  });
  ensureGridExtentContains(destination);

  if (commitEdit) {
    finishEdit(destination);
  } else {
    setActiveCell(destination);
  }
}

function onCellMouseDown(address: CellAddress): void {
  if (isEditing.value) {
    finishEdit(address);
    return;
  }

  if (!areCellAddressesEqual(activeCell.value, address)) {
    setActiveCell(address);
  } else {
    focusEditor();
  }
}

function onCellDoubleClick(address: CellAddress, event: MouseEvent): void {
  if (!areCellAddressesEqual(activeCell.value, address)) {
    setActiveCell(address);
  }
  beginEdit("append", "", event.clientX);
}

function handleHistoryShortcut(event: KeyboardEvent): boolean {
  if (isEditing.value || (!event.ctrlKey && !event.metaKey)) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      emit("redo");
    } else {
      emit("undo");
    }
    return true;
  }
  if (key === "y") {
    event.preventDefault();
    emit("redo");
    return true;
  }

  return false;
}

function onEditorKeydown(event: KeyboardEvent): void {
  if (isComposing.value || event.isComposing) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
    return;
  }

  if (handleHistoryShortcut(event)) {
    return;
  }

  if (isEditing.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      moveSelection({ rows: event.shiftKey ? -1 : 1 }, true);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      moveSelection({ columns: event.shiftKey ? -1 : 1 }, true);
    }
    return;
  }

  const navigation: Record<string, { rows?: number; columns?: number }> = {
    ArrowUp: { rows: -1 },
    ArrowDown: { rows: 1 },
    ArrowLeft: { columns: -1 },
    ArrowRight: { columns: 1 },
    Enter: { rows: event.shiftKey ? -1 : 1 },
    Tab: { columns: event.shiftKey ? -1 : 1 },
  };
  const delta = navigation[event.key];
  if (delta) {
    event.preventDefault();
    moveSelection(delta, false);
    return;
  }

  if (event.key === "F2") {
    event.preventDefault();
    beginEdit("append");
    return;
  }

  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    beginEdit("replace", event.key);
  }
}

function onEditorInput(value: string): void {
  if (!isEditing.value) {
    isEditing.value = true;
  }
  editingValue.value = value;
}

function onCompositionStart(): void {
  compositionStartValue = editingValue.value;
  shouldFinishAfterComposition = false;
  if (!isEditing.value) {
    editingValue.value = "";
    isEditing.value = true;
  }
  isComposing.value = true;
}

function onCompositionEnd(value: string, event: CompositionEvent): void {
  isComposing.value = false;
  if (event.data === "" && value === compositionStartValue) {
    cancelEdit(!shouldFinishAfterComposition);
    return;
  }
  if (isEditing.value) {
    editingValue.value = value;
  }
  if (shouldFinishAfterComposition) {
    finishEdit(undefined, false);
  }
}

function onEditorBlur(): void {
  if (!isEditing.value) {
    return;
  }
  if (isComposing.value) {
    shouldFinishAfterComposition = true;
    return;
  }

  finishEdit(undefined, false);
}

function onScroll(event: Event): void {
  const scroller = event.currentTarget as HTMLDivElement;
  scrollPosition.x = scroller.scrollLeft;
  scrollPosition.y = scroller.scrollTop;
  ensureGridExtentCoversViewport();
}

watch(
  () => props.sheet.id,
  () => {
    activeCell.value = { row: 0, column: 0 };
    editingValue.value = "";
    isEditing.value = false;
    isComposing.value = false;
    shouldFinishAfterComposition = false;
    applyGridExtent(
      createGridExtent({
        rowCount: props.initialRowCount,
        columnCount: props.initialColumnCount,
      }),
    );
    const scroller = scrollerRef.value;
    if (scroller) {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    }
    scrollPosition.x = 0;
    scrollPosition.y = 0;
    focusEditor();
  },
);

onMounted(() => {
  updateViewportSize();
  const scroller = scrollerRef.value;
  if (scroller && typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(updateViewportSize);
    resizeObserver.observe(scroller);
  }
  focusEditor();
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <section
    class="sheet-grid"
    :style="{
      '--sheet-row-header-width': `${ROW_HEADER_WIDTH}px`,
      '--sheet-column-header-height': `${COLUMN_HEADER_HEIGHT}px`,
    }"
    :aria-label="`${sheet.name} worksheet`"
  >
    <div class="sheet-grid__corner" aria-hidden="true" />
    <SheetColumnHeaders
      :start-column="visibleRange.startColumn"
      :end-column="visibleRange.endColumn"
      :column-width="geometry.columnWidth"
      :scroll-left="scrollPosition.x"
      :active-column="activeCell.column"
    />
    <SheetRowHeaders
      :start-row="visibleRange.startRow"
      :end-row="visibleRange.endRow"
      :row-height="geometry.rowHeight"
      :scroll-top="scrollPosition.y"
      :active-row="activeCell.row"
    />

    <div
      ref="scrollerRef"
      class="sheet-grid__scroller"
      role="grid"
      :aria-label="sheet.name"
      :aria-rowcount="gridExtent.rowCount"
      :aria-colcount="gridExtent.columnCount"
      @scroll="onScroll"
    >
      <div class="sheet-grid__canvas" :style="gridCanvasStyle">
        <div class="sheet-grid__viewport" :style="gridViewportStyle">
          <SheetCellLayer
            :sheet="sheet"
            :geometry="geometry"
            :visible-range="visibleRange"
            :active-cell="activeCell"
            :scroll-position="scrollPosition"
            @cell-mousedown="onCellMouseDown"
            @cell-double-click="onCellDoubleClick"
          >
            <template #active-cell>
              <CellEditor
                ref="editorRef"
                :model-value="editingValue"
                :address-label="activeCellLabel"
                :display-value="activeCellDisplayValue"
                :editing="isEditing"
                @keydown="onEditorKeydown"
                @blur="onEditorBlur"
                @composition-start="onCompositionStart"
                @composition-end="onCompositionEnd"
                @update:model-value="onEditorInput"
              />
            </template>
          </SheetCellLayer>
          <div
            data-sheet-grid-lines
            class="sheet-grid__lines"
            :style="gridLineStyle"
            aria-hidden="true"
          />
          <SheetSelectionOverlay
            :rect="activeCellRect"
            :address-label="activeCellLabel"
            :editing="isEditing"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.sheet-grid {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-surface-primary);

  &__corner {
    position: absolute;
    inset: 0 auto auto 0;
    z-index: 5;
    width: var(--sheet-row-header-width);
    height: var(--sheet-column-header-height);
    background: var(--ui-surface-muted);
    border-right: 1px solid var(--ui-border-strong);
    border-bottom: 1px solid var(--ui-border-strong);
  }

  &__scroller {
    position: absolute;
    inset: var(--sheet-column-header-height) 0 0 var(--sheet-row-header-width);
    overflow: auto;
    background: var(--ui-surface-primary);
    outline: none;
    scrollbar-color: var(--ui-border-strong) var(--ui-surface-muted);
    scrollbar-width: thin;
  }

  &__canvas {
    position: relative;
  }

  &__viewport {
    position: sticky;
    top: 0;
    left: 0;
    overflow: hidden;
    background: var(--ui-surface-primary);
  }

  &__lines {
    position: absolute;
    inset: 0;
    z-index: 1;
    background-image:
      linear-gradient(
        to right,
        transparent calc(100% - 1px),
        var(--ui-border-default) calc(100% - 1px)
      ),
      linear-gradient(
        to bottom,
        transparent calc(100% - 1px),
        var(--ui-border-default) calc(100% - 1px)
      );
    pointer-events: none;
  }
}
</style>
