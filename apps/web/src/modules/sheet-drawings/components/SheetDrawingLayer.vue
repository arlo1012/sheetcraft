<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import type { SheetDrawing } from "@idea10/core/sheet-drawings";
import {
  getFloatingImageViewportFragments,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@idea10/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import SheetObjectSelection from "../../../shared/sheet-objects/SheetObjectSelection.vue";
import DrawingContent from "./DrawingContent.vue";
const props = defineProps<{
  drawings: readonly SheetDrawing[];
  layout: SheetViewportLayout;
  scale: number;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  update: [drawing: SheetDrawing];
  delete: [id: string];
  edit: [drawing: SheetDrawing];
  select: [];
}>();
const selectedId = ref<string | null>(null);
const preview = shallowRef<SheetDrawing>();
let session: PointerSession | undefined;
const fragments = computed(() =>
  props.drawings.flatMap((original) => {
    const drawing = preview.value?.id === original.id ? preview.value : original;
    return getFloatingImageViewportFragments(drawing, props.layout).map((fragment) => ({
      ...fragment,
      drawing,
    }));
  }),
);
function fragmentStyle(fragment: FloatingImageViewportFragment): CSSProperties {
  return {
    left: `${fragment.clippedRect.x}px`,
    top: `${fragment.clippedRect.y}px`,
    width: `${fragment.clippedRect.width}px`,
    height: `${fragment.clippedRect.height}px`,
  };
}
function contentStyle(fragment: FloatingImageViewportFragment): CSSProperties {
  return {
    left: `${fragment.rect.x - fragment.clippedRect.x}px`,
    top: `${fragment.rect.y - fragment.clippedRect.y}px`,
    width: `${fragment.rect.width}px`,
    height: `${fragment.rect.height}px`,
  };
}
function start(
  drawing: SheetDrawing,
  event: PointerEvent,
  direction?: FloatingImageResizeDirection,
) {
  if (event.button !== 0) return;
  selectedId.value = drawing.id;
  emit("select");
  (event.currentTarget as HTMLElement)?.focus();
  if (props.readOnly) return;
  const update = (point: { clientX: number; clientY: number }) => {
    const dx = (point.clientX - event.clientX) / props.scale;
    const dy = (point.clientY - event.clientY) / props.scale;
    preview.value = direction
      ? (resizeFloatingImageBy(drawing, direction, { x: dx, y: dy }, props.layout, {
          minSize: 16,
          maxSize: 16384,
        }) ?? undefined)
      : (moveFloatingImageBy(drawing, { x: dx, y: dy }, props.layout) ?? undefined);
  };
  session = startPointerSession({
    event,
    captureTarget: event.currentTarget as HTMLElement,
    onMove: update,
    onEnd: (point) => {
      update(point);
      if (preview.value) emit("update", preview.value);
      preview.value = undefined;
    },
    onCancel: () => {
      preview.value = undefined;
    },
  });
}
function keydown(drawing: SheetDrawing, event: KeyboardEvent) {
  if (event.key === "Escape") {
    selectedId.value = null;
    event.stopPropagation();
    return;
  }
  if (props.readOnly) return;
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    event.stopPropagation();
    emit("delete", drawing.id);
    return;
  }
  if (event.key === "Enter" || event.key === "F2") {
    event.preventDefault();
    event.stopPropagation();
    emit("edit", drawing);
    return;
  }
  if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const moved = moveFloatingImageBy(
      drawing,
      {
        x: event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
        y: event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
      },
      props.layout,
    );
    if (moved) emit("update", moved);
  }
}
function clearOutside(event: PointerEvent) {
  if (
    event.target instanceof Element &&
    !event.target.closest("[data-sheet-drawing-id]") &&
    !event.target.closest('[role="dialog"]')
  )
    selectedId.value = null;
}
onMounted(() => document.addEventListener("pointerdown", clearOutside));
onBeforeUnmount(() => {
  session?.cancel();
  document.removeEventListener("pointerdown", clearOutside);
});
watch(
  () => props.readOnly,
  (value) => {
    if (value) session?.cancel();
  },
);
watch(
  () => props.drawings,
  () => {
    if (!props.drawings.some((drawing) => drawing.id === selectedId.value)) {
      session?.cancel();
      selectedId.value = null;
    }
  },
);
</script>
<template>
  <div class="sheet-drawing-layer">
    <div
      v-for="fragment in fragments"
      :key="`${fragment.drawing.id}-${fragment.paneId}`"
      class="sheet-drawing-layer__object"
      :data-sheet-drawing-id="fragment.drawing.id"
      :style="fragmentStyle(fragment)"
      tabindex="0"
      role="group"
      :aria-label="fragment.drawing.name"
      @pointerdown.prevent.stop="start(fragment.drawing, $event)"
      @dblclick.prevent.stop="!readOnly && emit('edit', fragment.drawing)"
      @keydown="keydown(fragment.drawing, $event)"
    >
      <div class="sheet-drawing-layer__clip">
        <div class="sheet-drawing-layer__content" :style="contentStyle(fragment)">
          <DrawingContent :drawing="fragment.drawing" />
        </div>
      </div>
      <SheetObjectSelection
        v-if="selectedId === fragment.drawing.id && !readOnly"
        :fragment="fragment"
        @resize="(direction, event) => start(fragment.drawing, event, direction)"
      />
    </div>
  </div>
</template>
<style scoped lang="scss">
.sheet-drawing-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  &__object {
    position: absolute;
    pointer-events: auto;
    outline: none;
    cursor: move;
    touch-action: none;
  }
  &__clip {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  &__content {
    position: absolute;
    pointer-events: none;
  }
}
</style>
