<script setup lang="ts">
import { shapePresetPathToSvg } from "@sheetcraft/core/shape-presets";
import { getPictureCropShapeGeometry } from "../picture-crop-shape";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watchPostEffect,
  type CSSProperties,
} from "vue";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";
import type { ResolvedPictureFrame, PicturePoint } from "@sheetcraft/core/picture-frame";
import type { FramedPictureViewportFragment } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { FloatingImageResizeDirection } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { useAppI18n } from "../../../shared/i18n";
import {
  getPictureCropCanvasSize,
  getPictureCropViewportFragments,
  paintPictureCropSourceGhost,
  preparePictureCropPreview,
} from "../picture-crop-preview";
import SheetPictureCropHandle from "./SheetPictureCropHandle.vue";

const props = withDefaults(
  defineProps<{
    picture: FramedFloatingImage | GroupedPicture;
    geometry: ResolvedPictureFrame;
    layout: SheetViewportLayout;
    assetUrl?: string;
    /** Ancestor CSS zoom; geometry stays in unscaled SheetGrid body coordinates. */
    scale?: number;
  }>(),
  { scale: 1 },
);
const emit = defineEmits<{
  start: [direction: FloatingImageResizeDirection | "source", event: PointerEvent];
  keydown: [event: KeyboardEvent];
  contextmenu: [event: MouseEvent];
}>();
const { t } = useAppI18n();
const overlay = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const revision = ref(0);
let disposed = false;
let observer: ResizeObserver | undefined;
const invalidate = (): void => {
  if (!disposed) revision.value++;
};
const cache = createCanvasImageCache(invalidate);
// Compute the complete preflight before render or source-cache access. Bad source
// ratios, content, or stale geometry cannot initiate resource preparation.
const preview = computed(() => preparePictureCropPreview(props.picture, props.geometry));
const fragments = computed(() => getPictureCropViewportFragments(preview.value, props.layout));
const canvasStyle = computed<CSSProperties>(() => ({
  width: `${props.layout.viewportSize.width}px`,
  height: `${props.layout.viewportSize.height}px`,
}));
const fragmentStyle = (fragment: FramedPictureViewportFragment): CSSProperties => ({
  left: `${fragment.clippedBounds.x}px`,
  top: `${fragment.clippedBounds.y}px`,
  width: `${fragment.clippedBounds.width}px`,
  height: `${fragment.clippedBounds.height}px`,
});
function localPoint(point: PicturePoint, fragment: FramedPictureViewportFragment): PicturePoint {
  return { x: point.x - fragment.clippedBounds.x, y: point.y - fragment.clippedBounds.y };
}
const polygon = (fragment: FramedPictureViewportFragment): string =>
  fragment.geometry.corners
    .map((point) => {
      const local = localPoint(point, fragment);
      return `${local.x},${local.y}`;
    })
    .join(" ");
const mask = computed(() =>
  getPictureCropShapeGeometry(
    props.picture.frame.cropShape,
    props.geometry.rect.width,
    props.geometry.rect.height,
  ),
);
const maskPaths = computed(() =>
  mask.value?.paths.filter((path) => path.filled).map((path) => shapePresetPathToSvg(path)),
);
function maskTransform(fragment: FramedPictureViewportFragment): string {
  const r = fragment.geometry.rect,
    angle = fragment.geometry.angleDeg;
  return `translate(${r.x - fragment.clippedBounds.x} ${r.y - fragment.clippedBounds.y}) rotate(${angle} ${r.width / 2} ${r.height / 2})`;
}
function gridPath(fragment: FramedPictureViewportFragment): string {
  const [nw, ne, se, sw] = fragment.geometry.corners;
  const interpolate = (a: PicturePoint, b: PicturePoint, ratio: number): PicturePoint => ({
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  });
  const line = (a: PicturePoint, b: PicturePoint): string => {
    const from = localPoint(a, fragment),
      to = localPoint(b, fragment);
    return `M${from.x},${from.y} L${to.x},${to.y}`;
  };
  return [1 / 3, 2 / 3]
    .flatMap((ratio) => [
      line(interpolate(nw, ne, ratio), interpolate(sw, se, ratio)),
      line(interpolate(nw, sw, ratio), interpolate(ne, se, ratio)),
    ])
    .join(" ");
}
function start(direction: FloatingImageResizeDirection | "source", event: PointerEvent): void {
  // Right-click must remain available to the host's picture context menu.
  if (event.button !== 0) return;
  overlay.value?.focus({ preventScroll: true });
  emit("start", direction, event);
}

watchPostEffect(() => {
  const prepared = preview.value;
  const layout = props.layout;
  const scale = props.scale;
  const url = props.assetUrl;
  void revision.value;
  const surface = canvas.value;
  const size = getPictureCropCanvasSize(layout.viewportSize, window.devicePixelRatio || 1, scale);
  cache.retain(new Set(url && !prepared.picture.hidden ? [url] : []));
  if (!surface) return;
  if (surface.width !== size.width) surface.width = size.width;
  if (surface.height !== size.height) surface.height = size.height;
  const context = surface.getContext("2d");
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, surface.width, surface.height);
  if (
    !url ||
    prepared.picture.hidden ||
    layout.viewportSize.width <= 0 ||
    layout.viewportSize.height <= 0
  )
    return;
  const decoded = cache.get(url);
  if (!decoded) return;
  context.setTransform(size.scaleX, 0, 0, size.scaleY, 0, 0);
  paintPictureCropSourceGhost(context, decoded, prepared, layout);
});

onMounted(() => {
  window.addEventListener("resize", invalidate);
  if (typeof ResizeObserver !== "undefined" && overlay.value) {
    observer = new ResizeObserver(invalidate);
    observer.observe(overlay.value);
  }
});
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  window.removeEventListener("resize", invalidate);
  cache.dispose();
});
</script>

<template>
  <div
    ref="overlay"
    class="sheet-picture-crop-overlay"
    tabindex="0"
    role="group"
    :aria-label="t('image.cropSelection')"
    :data-picture-crop-owner="preview.picture.id"
    data-image-crop-overlay
    data-picture-crop-overlay
    @keydown.stop="emit('keydown', $event)"
    @contextmenu.prevent.stop="emit('contextmenu', $event)"
  >
    <canvas
      ref="canvas"
      class="sheet-picture-crop-overlay__source"
      :style="canvasStyle"
      aria-hidden="true"
    />
    <div
      v-for="fragment in fragments"
      :key="fragment.paneId"
      class="sheet-picture-crop-overlay__fragment"
      :style="fragmentStyle(fragment)"
      :data-picture-crop-pane="fragment.paneId"
    >
      <svg
        class="sheet-picture-crop-overlay__frame"
        :width="fragment.clippedBounds.width"
        :height="fragment.clippedBounds.height"
        aria-hidden="true"
      >
        <polygon
          class="sheet-picture-crop-overlay__body"
          :points="polygon(fragment)"
          v-if="!maskPaths"
          data-picture-crop-source
          data-image-crop-selection
          @pointerdown.prevent.stop="start('source', $event)"
          @dblclick.prevent.stop
        />
        <polygon
          v-if="maskPaths"
          class="sheet-picture-crop-overlay__outline"
          :points="polygon(fragment)"
        />
        <path
          v-for="(path, index) in maskPaths"
          :key="index"
          class="sheet-picture-crop-overlay__body"
          :d="path"
          :transform="maskTransform(fragment)"
          fill-rule="nonzero"
          data-picture-crop-source
          data-image-crop-selection
          @pointerdown.prevent.stop="start('source', $event)"
          @dblclick.prevent.stop
        />
        <path class="sheet-picture-crop-overlay__grid" :d="gridPath(fragment)" />
      </svg>
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="n" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="s" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="w" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="e" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="nw" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="ne" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="sw" @start="start" />
      <SheetPictureCropHandle :fragment="fragment" :layout="layout" direction="se" @start="start" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-picture-crop-overlay {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
  outline: none;

  &__source {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  &__fragment {
    position: absolute;
    pointer-events: none;
  }
  &__frame {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  &__body {
    fill: transparent;
    stroke: white;
    stroke-width: 1;
    pointer-events: fill;
    cursor: move;
    touch-action: none;
  }
  &__outline {
    fill: none;
    stroke: white;
    stroke-width: 1;
    pointer-events: none;
  }
  &__grid {
    fill: none;
    stroke: rgb(255 255 255 / 55%);
    stroke-width: 1;
    pointer-events: none;
  }
}
</style>
