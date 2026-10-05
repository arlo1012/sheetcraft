<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef } from "vue";
import type { CellAddress, CellNote, CellNoteBox } from "@idea10/core/workbook";
import { getCellAddressLabel } from "@idea10/core/coordinates";
import { useAppI18n } from "../../../shared/i18n";
import { DEFAULT_NOTE_BOX } from "../../../shared/cell-notes/note-box";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import SheetCellNote from "./SheetCellNote.vue";

const props = defineProps<{
  address: CellAddress;
  origin: { x: number; y: number };
  scale: number;
  note?: CellNote;
  draft?: { text: string; author: string; box?: CellNoteBox };
  error?: string;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  edit: [address: CellAddress];
  save: [payload: { text: string; author: string; restoreFocus?: boolean }];
  cancel: [];
  updateBox: [payload: { address: CellAddress; box: CellNoteBox }];
  enter: [];
  leave: [];
}>();
const { t } = useAppI18n();
const rootRef = ref<HTMLElement | null>(null);
const editorRef = ref<InstanceType<typeof SheetCellNote> | null>(null);
const selected = ref(false);
const boxPreview = shallowRef<CellNoteBox>();
const displayedBox = computed(
  () => boxPreview.value ?? props.draft?.box ?? props.note?.box ?? DEFAULT_NOTE_BOX,
);
const anchor = computed(() => {
  const box = displayedBox.value;
  const x = props.origin.x + box.offsetX * props.scale;
  const y = props.origin.y + box.offsetY * props.scale;
  return markRaw({ getBoundingClientRect: () => new DOMRect(x, y, 0, 0) });
});
const { floatingStyles } = useFloatingPanel(
  anchor,
  rootRef,
  computed(() => true),
  {
    placement: "right-start",
    offset: 0,
    avoidCollisions: false,
  },
);
function onPointerDown(event: PointerEvent): void {
  event.stopPropagation();
  if (!props.readOnly) selected.value = true;
  onNoteBoxPointerDown(event);
}
function outsidePointerDown(target: Node): void {
  if (rootRef.value?.contains(target)) return;
  selected.value = false;
  if (props.draft) editorRef.value?.dismiss();
}
function deselect(): void {
  selected.value = false;
  clearNoteBoxGesture();
}
defineExpose({ outsidePointerDown, deselect });
let noteBoxGesture:
  | {
      pointerId: number;
      address: CellAddress;
      startX: number;
      startY: number;
      box: CellNoteBox;
      handle?: string;
    }
  | undefined;
function clearNoteBoxGesture(): void {
  window.removeEventListener("pointermove", onNoteBoxPointerMove);
  window.removeEventListener("pointerup", onNoteBoxPointerUp);
  window.removeEventListener("pointercancel", cancelNoteBoxGesture);
  noteBoxGesture = undefined;
  boxPreview.value = undefined;
}
function cancelNoteBoxGesture(event?: PointerEvent): void {
  if (event && noteBoxGesture?.pointerId !== event.pointerId) return;
  clearNoteBoxGesture();
}
function onNoteBoxPointerDown(event: PointerEvent): void {
  if (props.readOnly || event.button !== 0) return;
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, button"))
    return;
  const handle = event.target instanceof HTMLElement ? event.target.dataset.noteResize : undefined;
  noteBoxGesture = {
    pointerId: event.pointerId,
    address: { ...props.address },
    startX: event.clientX,
    startY: event.clientY,
    box: { ...displayedBox.value },
    handle,
  };
  rootRef.value?.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", onNoteBoxPointerMove);
  window.addEventListener("pointerup", onNoteBoxPointerUp);
  window.addEventListener("pointercancel", cancelNoteBoxGesture);
  event.preventDefault();
}
function onNoteBoxPointerMove(event: PointerEvent): void {
  const gesture = noteBoxGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const dx = (event.clientX - gesture.startX) / props.scale;
  const dy = (event.clientY - gesture.startY) / props.scale;
  const box = { ...gesture.box };
  if (!gesture.handle) {
    box.offsetX += dx;
    box.offsetY += dy;
  } else {
    if (gesture.handle.includes("e")) box.width = Math.min(2000, Math.max(80, box.width + dx));
    if (gesture.handle.includes("s")) box.height = Math.min(2000, Math.max(40, box.height + dy));
    if (gesture.handle.includes("w")) {
      box.width = Math.min(2000, Math.max(80, box.width - dx));
      box.offsetX += gesture.box.width - box.width;
    }
    if (gesture.handle.includes("n")) {
      box.height = Math.min(2000, Math.max(40, box.height - dy));
      box.offsetY += gesture.box.height - box.height;
    }
  }
  boxPreview.value = box;
}
function onNoteBoxPointerUp(event: PointerEvent): void {
  const gesture = noteBoxGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const box = boxPreview.value;
  clearNoteBoxGesture();
  if (box) emit("updateBox", { address: gesture.address, box });
}
const noteConnectorStyle = computed(() => {
  const box = displayedBox.value;
  return { left: `${-box.offsetX * props.scale}px`, top: `${-box.offsetY * props.scale}px` };
});
const noteConnectorEnd = computed(() => {
  const box = displayedBox.value;
  return {
    x: (box.offsetX + (box.offsetX + box.width / 2 < 0 ? box.width : 0)) * props.scale,
    y: (box.offsetY + Math.min(10, box.height / 2)) * props.scale,
  };
});

onBeforeUnmount(clearNoteBoxGesture);
</script>

<template>
  <Teleport to="body">
    <div
      ref="rootRef"
      class="sheet-note-preview"
      :class="{ 'is-selected': selected || draft }"
      :data-note-address="getCellAddressLabel(address)"
      :style="[
        floatingStyles,
        {
          '--note-width': `${displayedBox.width * scale}px`,
          '--note-height': `${displayedBox.height * scale}px`,
          '--note-scale': scale,
        },
      ]"
      @pointerenter="emit('enter')"
      @pointerleave="emit('leave')"
      @pointerdown="onPointerDown"
    >
      <svg class="sheet-note-preview__connector" :style="noteConnectorStyle" aria-hidden="true">
        <line x1="0" y1="0" :x2="noteConnectorEnd.x" :y2="noteConnectorEnd.y" />
      </svg>
      <FloatingPanelSurface
        appearance="note"
        :label="`${t('review.noteText')} · ${t('review.address')}: ${getCellAddressLabel(address)}`"
        role="group"
        layer="popover"
        :scrollable="false"
        :constrain-to-viewport="false"
        class="sheet-note-preview__surface"
      >
        <SheetCellNote
          ref="editorRef"
          :note="note"
          :draft="draft"
          :error="error"
          :read-only="readOnly"
          @edit="!readOnly && emit('edit', address)"
          @save="emit('save', $event)"
          @cancel="emit('cancel')"
        />
      </FloatingPanelSurface>
      <template v-if="!readOnly && (selected || draft)">
        <span
          v-for="handle in ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']"
          :key="handle"
          class="sheet-note-preview__handle"
          :class="`is-${handle}`"
          :data-note-resize="handle"
        />
      </template>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-note-preview {
  position: fixed;
  z-index: var(--idea-layer-popover);

  width: var(--note-width);
  height: var(--note-height);
  cursor: move;
  touch-action: none;

  &__connector {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    stroke: var(--idea-note-border);
    stroke-width: 1px;
  }

  &__surface {
    overflow: hidden;
    width: var(--note-width);
    height: var(--note-height);
    box-sizing: border-box;
  }

  &__handle {
    position: absolute;
    z-index: 2;
    width: 6px;
    height: 6px;
    margin: -3px;
    border: 1px solid var(--idea-note-border);
    background: var(--idea-note-background);
  }
  &__handle.is-n {
    top: 0;
    left: 50%;
    cursor: ns-resize;
  }
  &__handle.is-ne {
    top: 0;
    right: 0;
    cursor: nesw-resize;
  }
  &__handle.is-e {
    top: 50%;
    right: 0;
    cursor: ew-resize;
  }
  &__handle.is-se {
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
  }
  &__handle.is-s {
    bottom: 0;
    left: 50%;
    cursor: ns-resize;
  }
  &__handle.is-sw {
    bottom: 0;
    left: 0;
    cursor: nesw-resize;
  }
  &__handle.is-w {
    top: 50%;
    left: 0;
    cursor: ew-resize;
  }
  &__handle.is-nw {
    top: 0;
    left: 0;
    cursor: nwse-resize;
  }
}
</style>
