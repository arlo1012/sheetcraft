<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import { useI18n } from "vue-i18n";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import type {
  FloatingImageResizeDirection,
  FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { MessageKey } from "../../../shared/i18n";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";

const props = withDefaults(
  defineProps<{
    rect: ShapeFrameRect;
    rotation: number;
    fragment: FloatingImageViewportFragment;
    paneClip: Rect;
    locale?: string;
    disabled?: boolean;
    selectionKey?: string;
    showHandles?: boolean;
    showAction?: boolean;
    showFormat?: boolean;
  }>(),
  { showHandles: true, showAction: true },
);
const emit = defineEmits<{
  move: [event: PointerEvent];
  resize: [direction: FloatingImageResizeDirection, event: PointerEvent];
  rotate: [event: PointerEvent];
  nudgeRotation: [degrees: number];
  ungroup: [];
  format: [];
}>();
const composer = useI18n({ useScope: "global" });
const rootElement = ref<HTMLElement | null>(null);
const actionElement = ref<HTMLDivElement | null>(null);
const label = (key: MessageKey): string =>
  props.locale ? composer.t(key, {}, { locale: props.locale }) : composer.t(key);
const resizeLabels: Record<FloatingImageResizeDirection, MessageKey> = {
  n: "image.resizeTop",
  s: "image.resizeBottom",
  w: "image.resizeLeft",
  e: "image.resizeRight",
  nw: "image.resizeTopLeft",
  ne: "image.resizeTopRight",
  sw: "image.resizeBottomLeft",
  se: "image.resizeBottomRight",
};
const directions: FloatingImageResizeDirection[] = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];
// rect is the canonical sheet frame. The host supplies its complete viewport
// projection in fragment.rect, including unrotated layout size, for each pane.
const frame = computed(() => props.fragment.rect);
const point = (local: { x: number; y: number }) =>
  pictureFrameLocalToWorld(frame.value, props.rotation, local);
function owns(p: { x: number; y: number }): boolean {
  const clip = props.paneClip;
  return p.x >= clip.x && p.x < clip.x + clip.width && p.y >= clip.y && p.y < clip.y + clip.height;
}
const clipStyle = computed<CSSProperties>(() => ({
  left: `${props.paneClip.x - props.fragment.clippedRect.x}px`,
  top: `${props.paneClip.y - props.fragment.clippedRect.y}px`,
  width: `${Math.max(0, props.paneClip.width)}px`,
  height: `${Math.max(0, props.paneClip.height)}px`,
}));
function pointStyle(p: { x: number; y: number }): CSSProperties {
  return { left: `${p.x - props.paneClip.x}px`, top: `${p.y - props.paneClip.y}px` };
}
const frameX = computed(() => frame.value.x - props.paneClip.x);
const frameY = computed(() => frame.value.y - props.paneClip.y);
const frameTransform = computed(
  () =>
    `rotate(${props.rotation} ${frameX.value + frame.value.width / 2} ${frameY.value + frame.value.height / 2})`,
);
const sizes = computed(() =>
  directions
    .map((direction) => ({
      direction,
      resize: selectionActions.value.resize(direction),
      point: point({
        x: frame.value.width * (direction.includes("w") ? 0 : direction.includes("e") ? 1 : 0.5),
        y: frame.value.height * (direction.includes("n") ? 0 : direction.includes("s") ? 1 : 0.5),
      }),
    }))
    .filter((handle) => owns(handle.point)),
);
const rotation = computed(() => point({ x: frame.value.width / 2, y: -24 }));
const actionOpen = computed(
  () =>
    !props.disabled &&
    props.showHandles &&
    props.showAction &&
    props.fragment.clippedRect.width > 0 &&
    props.fragment.clippedRect.height > 0,
);
const floatingAnchor = computed<FloatingReference | null>(() => {
  const element = rootElement.value;
  if (!element) return null;
  // The host chooses one visible fragment for the action. Its root is located
  // at clippedRect, so offscreen frame corners never hide or move this anchor.
  const visible = props.fragment.clippedRect;
  return {
    contextElement: element,
    getBoundingClientRect() {
      const host = element.getBoundingClientRect();
      return new DOMRect(
        host.left,
        host.top,
        host.width > 0 ? host.width : visible.width,
        host.height > 0 ? host.height : visible.height,
      );
    },
  };
});
const { floatingStyles: actionStyle } = useFloatingPanel(
  floatingAnchor,
  actionElement,
  actionOpen,
  {
    placement: "right-start",
    offset: 12,
  },
);
function enabled(selectionKey: string | undefined, needsHandles = false): boolean {
  return (
    selectionKey === props.selectionKey && !props.disabled && (!needsHandles || props.showHandles)
  );
}
function move(event: PointerEvent, selectionKey: string | undefined): void {
  if (!enabled(selectionKey) || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  emit("move", event);
}
function resize(
  direction: FloatingImageResizeDirection,
  event: PointerEvent,
  selectionKey: string | undefined,
): void {
  if (!enabled(selectionKey, true) || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  emit("resize", direction, event);
}
function rotate(event: PointerEvent, selectionKey: string | undefined): void {
  if (!enabled(selectionKey, true) || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  emit("rotate", event);
}
function rotateKey(event: KeyboardEvent, selectionKey: string | undefined): void {
  if (
    !enabled(selectionKey, true) ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  emit(
    "nudgeRotation",
    (event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1) * (event.shiftKey ? 15 : 1),
  );
}
// Rendered callbacks keep their selection owner so delayed native and floating
// actions cannot be applied to the next group after the host changes selection.
const selectionActions = computed(() => {
  const selectionKey = props.selectionKey;
  return {
    move: (event: PointerEvent) => move(event, selectionKey),
    resize: (direction: FloatingImageResizeDirection) => (event: PointerEvent) =>
      resize(direction, event, selectionKey),
    rotate: (event: PointerEvent) => rotate(event, selectionKey),
    rotateKey: (event: KeyboardEvent) => rotateKey(event, selectionKey),
    format: (event: MouseEvent) => {
      event.stopPropagation();
      if (enabled(selectionKey, true) && actionOpen.value && props.showFormat) emit("format");
    },
    ungroup: (event: MouseEvent) => {
      event.stopPropagation();
      if (enabled(selectionKey, true) && actionOpen.value) emit("ungroup");
    },
  };
});
</script>

<template>
  <div
    ref="rootElement"
    class="shape-group-selection"
    data-shape-group-selection
    :data-shape-group-selection-owner="selectionKey"
  >
    <div class="shape-group-selection__clip" :style="clipStyle" data-shape-group-selection-clip>
      <svg
        class="shape-group-selection__frame"
        :width="Math.max(0, paneClip.width)"
        :height="Math.max(0, paneClip.height)"
        aria-hidden="true"
      >
        <g :transform="frameTransform">
          <rect
            :x="frameX"
            :y="frameY"
            :width="frame.width"
            :height="frame.height"
            fill="none"
            stroke="transparent"
            stroke-width="8"
            :pointer-events="disabled ? 'none' : 'stroke'"
            class="shape-group-selection__move"
            data-shape-group-move
            v-on="{ pointerdown: selectionActions.move }"
            @dblclick.prevent.stop
          />
          <rect
            :x="frameX"
            :y="frameY"
            :width="frame.width"
            :height="frame.height"
            fill="none"
            class="shape-group-selection__outline"
            data-shape-group-outline
          />
          <line
            v-if="showHandles"
            :x1="frameX + frame.width / 2"
            :y1="frameY"
            :x2="frameX + frame.width / 2"
            :y2="frameY - 24"
            class="shape-group-selection__stem"
            data-shape-group-rotation-stem
          />
        </g>
      </svg>
      <button
        v-for="handle in showHandles ? sizes : []"
        :key="handle.direction"
        type="button"
        tabindex="-1"
        :disabled="disabled"
        class="shape-group-selection__handle"
        :style="pointStyle(handle.point)"
        :aria-label="label(resizeLabels[handle.direction])"
        :data-shape-group-resize="handle.direction"
        v-on="{ pointerdown: handle.resize }"
        @dblclick.prevent.stop
      />
      <button
        v-if="showHandles && owns(rotation)"
        type="button"
        :disabled="disabled"
        class="shape-group-selection__handle is-rotation"
        :style="pointStyle(rotation)"
        :aria-label="label('drawing.rotateShape')"
        :title="label('drawing.rotateShape')"
        data-shape-group-rotate
        v-on="{ pointerdown: selectionActions.rotate, keydown: selectionActions.rotateKey }"
        @dblclick.prevent.stop
      />
    </div>
    <Teleport to="body">
      <div
        v-if="actionOpen"
        ref="actionElement"
        :style="actionStyle"
        class="shape-group-selection__actions"
        @pointerdown.stop
        @click.stop
      >
        <button
          v-if="showFormat"
          type="button"
          :disabled="disabled"
          :aria-label="label('drawing.formatGroup')"
          data-shape-group-format
          v-on="{ click: selectionActions.format }"
        >
          {{ label("drawing.formatGroup") }}
        </button>
        <button
          type="button"
          :disabled="disabled"
          class="shape-group-selection__ungroup"
          :aria-label="label('picture.ungroup')"
          :title="label('picture.ungroup')"
          data-shape-group-ungroup
          :data-shape-group-action-owner="selectionKey"
          @pointerdown.stop
          v-on="{ click: selectionActions.ungroup }"
          @dblclick.prevent.stop
        >
          {{ label("picture.ungroup") }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/floating/floating-panel" as panel;
.shape-group-selection {
  &__actions {
    display: flex;
    gap: 4px;
    align-items: center;
    pointer-events: auto;
    z-index: var(--sheetcraft-layer-toolbar);
    @include panel.toolbar-surface(var(--sheetcraft-layer-toolbar));
    padding: 4px;
    button {
      font: inherit;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
      padding: 4px 6px;
      white-space: nowrap;
    }
  }
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
  &__clip {
    position: absolute;
    overflow: hidden;
    pointer-events: none;
  }
  &__frame {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  &__move {
    cursor: move;
    touch-action: none;
  }
  &__outline,
  &__stem {
    stroke: var(--sheetcraft-action-primary);
    stroke-width: 1px;
    pointer-events: none;
  }
  &__handle {
    position: absolute;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    touch-action: none;
    cursor: crosshair;
    &::after {
      content: "";
      position: absolute;
      inset: 4px;
      border: 1px solid var(--sheetcraft-action-primary);
      border-radius: 50%;
      background: var(--sheetcraft-surface-panel);
      box-shadow: 0 0 0 1px var(--sheetcraft-surface-panel);
    }
    &.is-rotation::after {
      inset: 3px;
      background: var(--sheetcraft-action-primary);
    }
    &:hover:not(:disabled)::after {
      box-shadow: 0 0 0 2px var(--sheetcraft-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
      border-radius: var(--sheetcraft-radius-default);
    }
    &:disabled {
      cursor: default;
      opacity: 0.45;
      pointer-events: none;
    }
  }
  &__ungroup {
    height: 28px;
    padding: 0 8px;
    color: var(--sheetcraft-text-primary);
    font-family: var(--sheetcraft-font-sans);
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    white-space: nowrap;
    cursor: pointer;
    pointer-events: auto;
    &:hover:not(:disabled) {
      background: var(--sheetcraft-icon-button-hover-bg);
    }
    &:disabled {
      cursor: default;
      opacity: 0.45;
      pointer-events: none;
    }
  }
}
</style>
