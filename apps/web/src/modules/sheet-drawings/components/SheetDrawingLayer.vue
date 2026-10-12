<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type CSSProperties,
} from "vue";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import type { SheetDrawing, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getFloatingImageViewportFragments,
  getFloatingImageSheetRect,
  moveFloatingImageBy,
  resizeFloatingImageBy,
  type FloatingImageResizeDirection,
  type FloatingImageViewportFragment,
} from "@sheetcraft/sheet-engine/floating-image-layout";
import { getPicturePaneTranslation } from "@sheetcraft/sheet-engine/picture-frame-layout";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import SheetObjectSelection from "../../../shared/sheet-objects/SheetObjectSelection.vue";
import StandardShapeSelection from "./StandardShapeSelection.vue";
import {
  getStandardShapeGeometry,
  moveStandardShapeAdjustment,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "../shape-geometry";
import { getStandardShapeViewportFragments, resizeStandardShapeBy } from "../standard-shape-layout";
import { getShapeLineLocalEndpoints, moveStandardShapeEndpoint } from "../shape-endpoint-layout";
import DrawingContent from "./DrawingContent.vue";
import { shapeDrawingContainsWorldPoint } from "../shape-line-paint";
const props = defineProps<{
  drawings: readonly SheetDrawing[];
  selectedDrawingId?: string | null;
  sheet?: Sheet;
  evaluator?: SheetEvaluator;
  revision?: number;
  theme?: WorkbookTheme;
  imageAssetUrls?: ReadonlyMap<string, string>;
  locale?: string;
  dateSystem?: "1900" | "1904";
  layout: SheetViewportLayout;
  scale: number;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  update: [drawing: SheetDrawing];
  delete: [id: string];
  edit: [drawing: SheetDrawing];
  select: [];
  controlChange: [id: string, value: unknown];
}>();
const layerElement = ref<HTMLElement>();
const selectedId = ref<string | null>(null);
watch(
  () => props.selectedDrawingId,
  (id) => {
    selectedId.value = id ?? null;
    if (id)
      void nextTick(() => {
        const element = [
          ...(layerElement.value?.querySelectorAll<HTMLElement>("[data-sheet-drawing-id]") ?? []),
        ].find((item) => item.dataset.sheetDrawingId === id);
        element?.focus({ preventScroll: true });
      });
  },
  { immediate: true },
);
function isStandard(drawing: SheetDrawing): drawing is SheetGraphicDrawing {
  return drawing.kind === "shape" && !!drawing.shapeGeometry;
}
type DrawingFragment = FloatingImageViewportFragment & { drawing: SheetDrawing; standard: boolean };
const preview = shallowRef<SheetDrawing>();
let session: PointerSession | undefined;
const fragments = computed<DrawingFragment[]>(() =>
  props.drawings.flatMap((original) => {
    const drawing = preview.value?.id === original.id ? preview.value : original;
    const standard = isStandard(drawing);
    const shape =
      standard && getStandardShapeGeometry(drawing.shapeGeometry, drawing.width, drawing.height);
    const projected =
      standard && shape
        ? getStandardShapeViewportFragments(drawing, props.layout, selectedId.value === drawing.id)
        : getFloatingImageViewportFragments(drawing, props.layout);
    return projected.map((fragment) => ({ ...fragment, drawing, standard }));
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
function viewportPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const bounds = layerElement.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / props.scale,
    y: (event.clientY - (bounds?.top ?? 0)) / props.scale,
  };
}
function hits(fragment: DrawingFragment, event: MouseEvent): boolean {
  if (!fragment.standard) return true;
  if (!isStandard(fragment.drawing)) return false;
  const shape = getStandardShapeGeometry(
    fragment.drawing.shapeGeometry,
    fragment.drawing.width,
    fragment.drawing.height,
  );
  if (!shape) return event.target instanceof Element && !!event.target.closest('[role="status"]');
  return shapeDrawingContainsWorldPoint(
    fragment.drawing,
    shape,
    fragment.rect,
    viewportPoint(event),
  );
}
function start(
  fragment: DrawingFragment,
  event: PointerEvent,
  direction?: FloatingImageResizeDirection,
  mode: "move" | "rotate" | "adjust" | "endpoint" = "move",
  index?: number,
): void {
  const drawing = fragment.drawing;
  const owner = props.drawings.find((item) => item.id === drawing.id);
  if (!owner || owner !== drawing) return;
  if (event.button !== 0 || (!direction && mode === "move" && !hits(fragment, event))) return;
  event.preventDefault();
  event.stopPropagation();
  selectedId.value = drawing.id;
  emit("select");
  (event.currentTarget as HTMLElement)?.focus?.();
  if (props.readOnly) return;
  const sheet = props.sheet,
    revision = props.revision,
    layout = props.layout,
    scale = props.scale;
  const valid = () =>
    !props.readOnly &&
    props.sheet === sheet &&
    props.revision === revision &&
    props.layout === layout &&
    props.scale === scale &&
    props.drawings.find((item) => item.id === drawing.id) === owner;
  const origin = viewportPoint(event);
  const center = {
    x: fragment.rect.x + drawing.width / 2,
    y: fragment.rect.y + drawing.height / 2,
  };
  const endpoint =
    isStandard(drawing) && mode === "endpoint" && (index === 0 || index === 1)
      ? getShapeLineLocalEndpoints(drawing)?.[index]
      : undefined;
  const endpointOrigin =
    endpoint && isStandard(drawing)
      ? pictureFrameLocalToWorld(
          fragment.rect,
          drawing.rotation,
          standardShapeFlipPoint(drawing, endpoint),
        )
      : undefined;
  const paneTranslation = getPicturePaneTranslation(fragment.paneId, layout);
  const initialAngle = Math.atan2(origin.y - center.y, origin.x - center.x);
  const update = (point: PointerEvent | MouseEvent) => {
    if (!valid()) {
      session?.cancel();
      return;
    }
    const target = viewportPoint(point),
      delta = { x: target.x - origin.x, y: target.y - origin.y };
    if (isStandard(drawing) && mode === "rotate") {
      let rotation =
        drawing.rotation +
        ((Math.atan2(target.y - center.y, target.x - center.x) - initialAngle) * 180) / Math.PI;
      if (point.shiftKey) rotation = Math.round(rotation / 15) * 15;
      rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
      preview.value = { ...drawing, rotation };
    } else if (
      isStandard(drawing) &&
      mode === "endpoint" &&
      endpointOrigin &&
      (index === 0 || index === 1)
    ) {
      preview.value = moveStandardShapeEndpoint(
        drawing,
        index,
        {
          x: endpointOrigin.x + delta.x - paneTranslation.x,
          y: endpointOrigin.y + delta.y - paneTranslation.y,
        },
        layout,
        point.shiftKey,
      );
    } else if (isStandard(drawing) && mode === "adjust" && index !== undefined) {
      const local = standardShapeFlipPoint(
        drawing,
        standardShapeWorldToLocal(fragment.rect, drawing.rotation, target),
      );
      const geometry = moveStandardShapeAdjustment(
        drawing.shapeGeometry!,
        drawing.width,
        drawing.height,
        index,
        local,
      );
      preview.value = geometry ? { ...drawing, shapeGeometry: geometry } : undefined;
    } else
      preview.value = direction
        ? ((isStandard(drawing)
            ? resizeStandardShapeBy(drawing, direction, delta, layout, point.shiftKey)
            : resizeFloatingImageBy(drawing, direction, delta, layout, {
                minSize: 16,
                maxSize: 16384,
              })) ?? undefined)
        : (moveFloatingImageBy(drawing, delta, layout) ?? undefined);
  };
  session = startPointerSession({
    event,
    captureTarget: event.currentTarget as HTMLElement,
    onMove: update,
    onEnd: (point) => {
      update(point);
      const next = preview.value;
      preview.value = undefined;
      if (valid() && next) emit("update", next);
    },
    onCancel: () => {
      preview.value = undefined;
    },
  });
}
function edit(fragment: DrawingFragment, event: MouseEvent): void {
  if (props.drawings.find((item) => item.id === fragment.drawing.id) !== fragment.drawing) return;
  if ((props.readOnly && fragment.drawing.kind !== "attachment") || !hits(fragment, event)) return;
  event.preventDefault();
  event.stopPropagation();
  emit("edit", fragment.drawing);
}
function nudgeAdjustment(
  drawing: SheetGraphicDrawing,
  index: number,
  delta: { x: number; y: number },
): void {
  if (props.readOnly || props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  const shape = getStandardShapeGeometry(drawing.shapeGeometry, drawing.width, drawing.height);
  const position = shape?.handles[index]?.position;
  if (!position || !drawing.shapeGeometry) return;
  const geometry = moveStandardShapeAdjustment(
    drawing.shapeGeometry,
    drawing.width,
    drawing.height,
    index,
    {
      x: position.x + (drawing.shapeFlipX ? -delta.x : delta.x),
      y: position.y + (drawing.shapeFlipY ? -delta.y : delta.y),
    },
  );
  if (geometry) emit("update", { ...drawing, shapeGeometry: geometry });
}
function nudgeEndpoint(
  drawing: SheetGraphicDrawing,
  index: 0 | 1,
  delta: { x: number; y: number },
): void {
  if (props.readOnly || props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  const position = getShapeLineLocalEndpoints(drawing)?.[index];
  const rect = getFloatingImageSheetRect(drawing, props.layout);
  if (!position || !rect) return;
  const origin = pictureFrameLocalToWorld(
    rect,
    drawing.rotation,
    standardShapeFlipPoint(drawing, position),
  );
  const next = moveStandardShapeEndpoint(
    drawing,
    index,
    { x: origin.x + delta.x, y: origin.y + delta.y },
    props.layout,
  );
  if (next) emit("update", next);
}
function nudgeRotation(drawing: SheetGraphicDrawing, degrees: number): void {
  if (props.readOnly || props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  const rotation = ((((drawing.rotation + degrees + 180) % 360) + 360) % 360) - 180;
  emit("update", { ...drawing, rotation });
}
function keydown(drawing: SheetDrawing, event: KeyboardEvent) {
  if (props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (event.key === "Escape") {
    selectedId.value = null;
    event.stopPropagation();
    return;
  }
  if (drawing.kind === "attachment" && (event.key === "Enter" || event.key === "F2")) {
    event.preventDefault();
    event.stopPropagation();
    emit("edit", drawing);
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
  () => [props.sheet, props.revision, props.layout, props.scale],
  () => {
    session?.cancel();
    preview.value = undefined;
  },
);
watch(
  () => props.drawings,
  () => {
    session?.cancel();
    preview.value = undefined;
    if (!props.drawings.some((drawing) => drawing.id === selectedId.value)) {
      session?.cancel();
      selectedId.value = null;
    }
  },
);
</script>
<template>
  <div ref="layerElement" class="sheet-drawing-layer">
    <div
      v-for="fragment in fragments"
      :key="`${fragment.drawing.id}-${fragment.paneId}`"
      class="sheet-drawing-layer__object"
      :class="{ 'is-standard': fragment.standard }"
      :data-sheet-drawing-id="fragment.drawing.id"
      :style="fragmentStyle(fragment)"
      tabindex="0"
      role="group"
      :aria-label="fragment.drawing.name"
      @pointerdown="start(fragment, $event)"
      @dblclick="edit(fragment, $event)"
      @keydown="keydown(fragment.drawing, $event)"
    >
      <div class="sheet-drawing-layer__clip">
        <div class="sheet-drawing-layer__content" :style="contentStyle(fragment)">
          <DrawingContent
            @control-change="emit('controlChange', fragment.drawing.id, $event)"
            :drawing="fragment.drawing"
            :sheet="sheet"
            :evaluator="evaluator"
            :revision="revision"
            :theme="theme"
            :image-asset-urls="imageAssetUrls"
            :locale="locale"
            :date-system="dateSystem"
          />
        </div>
      </div>
      <StandardShapeSelection
        v-if="selectedId === fragment.drawing.id && !readOnly && isStandard(fragment.drawing)"
        :drawing="fragment.drawing"
        :fragment="fragment"
        :pane-clip="layout.panes[fragment.paneId].clip"
        @resize="(direction, event) => start(fragment, event, direction)"
        @rotate="(event) => start(fragment, event, undefined, 'rotate')"
        @endpoint="(index, event) => start(fragment, event, undefined, 'endpoint', index)"
        @nudge-endpoint="
          (index, delta) =>
            isStandard(fragment.drawing) && nudgeEndpoint(fragment.drawing, index, delta)
        "
        @adjust="(index, event) => start(fragment, event, undefined, 'adjust', index)"
        @nudge-adjustment="
          (index, delta) =>
            isStandard(fragment.drawing) && nudgeAdjustment(fragment.drawing, index, delta)
        "
        @nudge-rotation="
          (degrees) => isStandard(fragment.drawing) && nudgeRotation(fragment.drawing, degrees)
        "
      />
      <SheetObjectSelection
        v-else-if="selectedId === fragment.drawing.id && !readOnly"
        :fragment="fragment"
        @resize="(direction, event) => start(fragment, event, direction)"
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
    &.is-standard {
      pointer-events: none;
      overflow: hidden;
      .sheet-drawing-layer__clip {
        overflow: visible;
      }
    }
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
