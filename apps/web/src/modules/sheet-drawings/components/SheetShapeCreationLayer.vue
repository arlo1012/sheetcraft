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
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  getFloatingImageViewportFragments,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import type { ShapeCreationRequest } from "../useShapeCreation";
import {
  createShapeDrawingFromChoice,
  shapeCreationPointFromViewport,
} from "../shape-creation-geometry";
import { getStandardShapeViewportFragments } from "../standard-shape-layout";
import DrawingContent from "./DrawingContent.vue";

const props = defineProps<{
  request: ShapeCreationRequest;
  layout: SheetViewportLayout;
  scale: number;
  readOnly: boolean;
  revision?: number;
  locale?: string;
  commit: (request: ShapeCreationRequest, drawing: SheetGraphicDrawing) => boolean;
  cancel: (request: ShapeCreationRequest) => void;
}>();
const root = ref<HTMLElement>();
const preview = shallowRef<SheetGraphicDrawing>();
const failure = ref<"invalid" | "rejected">();
let session: PointerSession | undefined;
const labels = computed(() =>
  props.locale === "zh-CN"
    ? {
        instruction: "在工作表上拖动以绘制；单击使用默认大小",
        continuous: "连续绘制",
        cancel: "结束绘制",
        retry: "重试插入",
        invalid: "此位置或大小无法绘制，请在工作表内重新拖动。",
        rejected: "插入未成功，预览已保留。请重试或结束绘制。",
      }
    : {
        instruction: "Drag on the sheet to draw; click for the default size",
        continuous: "Continuous drawing",
        cancel: "Finish drawing",
        retry: "Retry insertion",
        invalid: "This position or size cannot be drawn. Drag again within the sheet.",
        rejected: "Insertion did not succeed. Your preview is preserved; retry or finish drawing.",
      },
);
const fragments = computed(() =>
  preview.value
    ? preview.value.kind === "shape"
      ? getStandardShapeViewportFragments(preview.value, props.layout)
      : getFloatingImageViewportFragments(preview.value, props.layout)
    : [],
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
function point(event: MouseEvent) {
  const bounds = root.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / props.scale,
    y: (event.clientY - (bounds?.top ?? 0)) / props.scale,
  };
}
function retry(): void {
  if (props.readOnly || !preview.value) return;
  const value = preview.value;
  if (props.commit(props.request, value)) {
    preview.value = undefined;
    failure.value = undefined;
  } else failure.value = "rejected";
}
function start(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    props.readOnly ||
    (event.target instanceof Element && event.target.closest("[data-shape-creation-controls]"))
  )
    return;
  const request = props.request,
    layout = props.layout,
    scale = props.scale,
    revision = props.revision;
  const startPoint = shapeCreationPointFromViewport(point(event), layout);
  if (!startPoint) return;
  event.preventDefault();
  event.stopPropagation();
  root.value?.focus();
  failure.value = undefined;
  preview.value = undefined;
  const valid = () =>
    props.request === request &&
    props.layout === layout &&
    props.scale === scale &&
    props.revision === revision &&
    !props.readOnly;
  let moved = false;
  const update = (next: MouseEvent) => {
    if (!valid()) {
      session?.cancel();
      return;
    }
    moved ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) >= 3;
    const end = shapeCreationPointFromViewport(point(next), layout, startPoint.paneId);
    preview.value = end
      ? (createShapeDrawingFromChoice({
          base: request.base,
          choice: request.choice,
          start: startPoint.point,
          end: end.point,
          layout,
          mode: moved ? "drag" : "click",
          shiftKey: next.shiftKey,
        }) ?? undefined)
      : undefined;
  };
  update(event);
  session = startPointerSession({
    event,
    captureTarget: root.value,
    onMove: update,
    onEnd: (next) => {
      update(next);
      if (!valid()) {
        preview.value = undefined;
        return;
      }
      const value = preview.value;
      if (!value) {
        failure.value = "invalid";
        return;
      }
      if (props.commit(request, value)) {
        preview.value = undefined;
        failure.value = undefined;
      } else failure.value = "rejected";
    },
    onCancel: () => {
      preview.value = undefined;
      failure.value = undefined;
    },
  });
}
function cancel(): void {
  session?.cancel();
  props.cancel(props.request);
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
  // Do not own shortcuts or dismissal in another dialog, form, or menu.
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest('[role="dialog"], [role="menu"], input, textarea, [contenteditable="true"]')
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}
onMounted(() => {
  root.value?.focus({ preventScroll: true });
  window.addEventListener("keydown", keydown, true);
});
onBeforeUnmount(() => {
  session?.cancel();
  window.removeEventListener("keydown", keydown, true);
});
watch(
  () => [props.request, props.layout, props.scale, props.revision, props.readOnly],
  () => {
    session?.cancel();
    preview.value = undefined;
    failure.value = undefined;
  },
  { flush: "sync" },
);
</script>
<template>
  <div
    ref="root"
    class="shape-creation-layer"
    tabindex="-1"
    data-shape-creation-layer
    @pointerdown="start"
  >
    <div class="shape-creation-layer__controls" data-shape-creation-controls>
      <span>{{ request.choice.label[locale === "zh-CN" ? "zh-CN" : "en-US"] }}</span>
      <span v-if="request.continuous" class="shape-creation-layer__mode">{{
        labels.continuous
      }}</span>
      <button
        v-if="failure === 'rejected' && preview"
        type="button"
        :disabled="readOnly"
        @click="retry"
      >
        {{ labels.retry }}
      </button>
      <button type="button" @click="cancel">{{ labels.cancel }}</button>
    </div>
    <div class="shape-creation-layer__hint" role="status">
      {{ failure ? labels[failure] : labels.instruction }}
    </div>
    <div
      v-for="fragment in fragments"
      :key="fragment.paneId"
      class="shape-creation-layer__fragment"
      :style="fragmentStyle(fragment)"
    >
      <div class="shape-creation-layer__preview" :style="contentStyle(fragment)">
        <DrawingContent v-if="preview" :drawing="preview" />
      </div>
    </div>
  </div>
</template>
<style scoped lang="scss">
.shape-creation-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  cursor: crosshair;
  touch-action: none;
  outline: none;
  pointer-events: auto;
  &__fragment {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
  }
  &__preview {
    position: absolute;
    pointer-events: none;
    opacity: 0.75;
  }
  &__controls {
    position: absolute;
    top: 12px;
    right: 12px;
    max-width: calc(100% - 24px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 8px;
    background: var(--sheetcraft-surface-default);
    box-shadow: var(--sheetcraft-shadow-menu);
    cursor: default;
    z-index: 1;
  }
  &__controls span {
    color: var(--sheetcraft-text-primary);
    font-size: 12px;
    white-space: nowrap;
  }
  &__controls button {
    padding: 4px 8px;
    border: 1px solid var(--sheetcraft-border-default);
    border-radius: 4px;
    background: var(--sheetcraft-surface-default);
    color: var(--sheetcraft-text-primary);
    cursor: pointer;
    white-space: nowrap;
    &:hover {
      background: var(--sheetcraft-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
    }
  }
  &__hint {
    position: absolute;
    bottom: 12px;
    left: 12px;
    max-width: calc(100% - 24px);
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--sheetcraft-text-secondary);
    background: var(--sheetcraft-surface-default);
    font-size: 12px;
    pointer-events: none;
  }
}
</style>
