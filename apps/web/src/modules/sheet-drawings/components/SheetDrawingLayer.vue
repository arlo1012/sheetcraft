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
import FreeShapePointSelection from "./FreeShapePointSelection.vue";
import StandardShapeSelection from "./StandardShapeSelection.vue";
import {
  getDrawingShapeGeometry,
  moveStandardShapeAdjustment,
  standardShapeWorldToLocal,
  standardShapeFlipPoint,
} from "../shape-geometry";
import { getStandardShapeViewportFragments, resizeStandardShapeBy } from "../standard-shape-layout";
import { getShapeLineLocalEndpoints, moveStandardShapeEndpoint } from "../shape-endpoint-layout";
import {
  listFreeShapePoints,
  moveFreeShapePoint,
  setFreeShapePointType,
  toggleClosedFreeShape,
  type FreeShapePointDescriptor,
} from "../free-shape-point-layout";
import { addFreeShapePoint, deleteFreeShapePoint } from "../free-shape-point-operations";
import DrawingContent from "./DrawingContent.vue";
import { shapeDrawingContainsWorldPoint } from "../shape-line-paint";
import {
  detailedShapeContainsWorldPoint,
  type ShapeDetailedPresentation,
} from "../shape-detailed-presentation";
const props = defineProps<{
  drawings: readonly SheetDrawing[];
  applyUpdate?: (drawing: SheetDrawing, expected: SheetDrawing) => boolean;
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
  selectionChange: [id: string | null];
  format: [drawing: SheetGraphicDrawing];
  backgroundPointer: [event: PointerEvent];
  controlChange: [id: string, value: unknown];
}>();
const rasterDensity = computed(() =>
  Math.max(
    1,
    Math.min(8, props.scale * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1)),
  ),
);
const layerElement = ref<HTMLElement>();
const selectedId = ref<string | null>(null);
watch(selectedId, (id) => emit("selectionChange", id), { flush: "sync" });
const pointEditingId = ref<string | null>(null);
const activeVertex = ref(0);
const pointRejected = ref(false);
watch(
  () => props.selectedDrawingId,
  (id) => {
    selectedId.value = id ?? null;
    if (pointEditingId.value && pointEditingId.value !== id) pointEditingId.value = null;
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
  return (
    drawing.kind === "shape" && !!(drawing.shapeGeometry || drawing.shapePath || drawing.shapeStyle)
  );
}
const detailedPresentations = new Map<string, ShapeDetailedPresentation>();
function acceptDetailedPaint(
  fragment: DrawingFragment,
  presentation: ShapeDetailedPresentation | undefined,
) {
  const key = `${fragment.drawing.id}:${fragment.paneId}`;
  if (presentation?.drawing === fragment.drawing) detailedPresentations.set(key, presentation);
  else detailedPresentations.delete(key);
}
type DrawingFragment = FloatingImageViewportFragment & {
  drawing: SheetDrawing;
  standard: boolean;
};
const preview = shallowRef<SheetDrawing>();
let session: PointerSession | undefined;
const fragments = computed<DrawingFragment[]>(() =>
  props.drawings.flatMap((original) => {
    const drawing = preview.value?.id === original.id ? preview.value : original;
    const standard = isStandard(drawing);
    const shape = standard && getDrawingShapeGeometry(drawing);
    const projected =
      standard && shape
        ? getStandardShapeViewportFragments(drawing, props.layout, selectedId.value === drawing.id)
        : getFloatingImageViewportFragments(drawing, props.layout);
    return projected.map((fragment) => ({ ...fragment, drawing, standard }));
  }),
);
const formatTarget = computed(() => {
  const visible = fragments.value.filter(
    (f) =>
      f.drawing.id === selectedId.value &&
      f.drawing.kind === "shape" &&
      f.drawing.id !== pointEditingId.value,
  );
  return visible.sort(
    (a, b) =>
      b.clippedRect.width * b.clippedRect.height - a.clippedRect.width * a.clippedRect.height,
  )[0];
});
const formatTriggerStyle = computed(() => {
  const f = formatTarget.value;
  if (!f) return {};
  const clip = props.layout.panes[f.paneId].clip;
  return {
    left: `${Math.max(clip.x + 4, Math.min(clip.x + clip.width - 32, f.rect.x + f.rect.width + 12))}px`,
    top: `${Math.max(clip.y + 4, Math.min(clip.y + clip.height - 32, f.rect.y))}px`,
  };
});
function formatSelected() {
  const d = formatTarget.value?.drawing;
  if (
    d?.kind === "shape" &&
    !props.readOnly &&
    props.drawings.find((item) => item.id === d.id) === d
  )
    emit("format", d);
}
function commitUpdate(next: SheetDrawing, owner: SheetDrawing): boolean {
  if (
    props.readOnly ||
    props.drawings.find((item) => item.id === owner.id) !== owner ||
    (isStandard(next) && !getDrawingShapeGeometry(next))
  )
    return false;
  if (next === owner) {
    pointRejected.value = false;
    return true;
  }
  let accepted = false;
  try {
    if (props.applyUpdate) accepted = props.applyUpdate(next, owner) === true;
    else {
      emit("update", next);
      accepted = true;
    }
  } catch {
    accepted = false;
  }
  if (pointEditingId.value === owner.id) pointRejected.value = !accepted;
  return accepted;
}
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
function viewportPoint(event: { clientX: number; clientY: number }): {
  x: number;
  y: number;
} {
  const bounds = layerElement.value?.getBoundingClientRect();
  return {
    x: (event.clientX - (bounds?.left ?? 0)) / props.scale,
    y: (event.clientY - (bounds?.top ?? 0)) / props.scale,
  };
}
function hits(fragment: DrawingFragment, event: MouseEvent): boolean {
  if (!fragment.standard) return true;
  if (!isStandard(fragment.drawing)) return false;
  const shape = getDrawingShapeGeometry(fragment.drawing);
  if (!shape) return event.target instanceof Element && !!event.target.closest('[role="status"]');
  if (fragment.drawing.shapeStyle) {
    if (
      event.target instanceof Element &&
      event.target.closest('[role="status"], [data-standard-shape-text]')
    )
      return true;
    return detailedShapeContainsWorldPoint(
      fragment.drawing,
      fragment.rect,
      viewportPoint(event),
      detailedPresentations.get(`${fragment.drawing.id}:${fragment.paneId}`),
    );
  }
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
  mode: "move" | "rotate" | "adjust" | "endpoint" | "point" = "move",
  index?: number,
  freePoint?: FreeShapePointDescriptor,
): void {
  const drawing = fragment.drawing;
  const owner = props.drawings.find((item) => item.id === drawing.id);
  if (!owner || owner !== drawing || (mode === "point" && pointEditingId.value !== drawing.id))
    return;
  if (event.button !== 0) return;
  if (!direction && mode === "move" && !hits(fragment, event)) {
    emit("backgroundPointer", event);
    return;
  }
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
    (mode !== "point" || pointEditingId.value === drawing.id) &&
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
  const freePosition =
    isStandard(drawing) && mode === "point" && freePoint
      ? listFreeShapePoints(drawing).find(
          (p) => p.commandIndex === freePoint.commandIndex && p.role === freePoint.role,
        )?.position
      : undefined;
  const freeOrigin =
    freePosition && isStandard(drawing)
      ? pictureFrameLocalToWorld(
          fragment.rect,
          drawing.rotation,
          standardShapeFlipPoint(drawing, freePosition),
        )
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
    } else if (isStandard(drawing) && mode === "point" && freePoint && freeOrigin) {
      preview.value = moveFreeShapePoint(
        drawing,
        freePoint,
        {
          x: freeOrigin.x + delta.x - paneTranslation.x,
          y: freeOrigin.y + delta.y - paneTranslation.y,
        },
        layout,
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
      if (valid() && next) commitUpdate(next, owner);
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
  if (isStandard(fragment.drawing) && fragment.drawing.shapePath) {
    selectedId.value = fragment.drawing.id;
    pointEditingId.value = fragment.drawing.id;
    activeVertex.value = 0;
    emit("select");
  } else emit("edit", fragment.drawing);
}
function pointContext(fragment: DrawingFragment, event: MouseEvent): void {
  if (
    !isStandard(fragment.drawing) ||
    !fragment.drawing.shapePath ||
    props.readOnly ||
    props.drawings.find((item) => item.id === fragment.drawing.id) !== fragment.drawing ||
    !hits(fragment, event)
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  selectedId.value = fragment.drawing.id;
  pointEditingId.value = fragment.drawing.id;
  activeVertex.value = 0;
  emit("select");
}
function nudgeFreePoint(
  drawing: SheetGraphicDrawing,
  point: FreeShapePointDescriptor,
  delta: { x: number; y: number },
): void {
  if (
    pointEditingId.value !== drawing.id ||
    props.readOnly ||
    props.drawings.find((item) => item.id === drawing.id) !== drawing
  )
    return;
  const position = listFreeShapePoints(drawing).find(
      (p) => p.commandIndex === point.commandIndex && p.role === point.role,
    )?.position,
    rect = getFloatingImageSheetRect(drawing, props.layout);
  if (!position || !rect) return;
  const origin = pictureFrameLocalToWorld(
    rect,
    drawing.rotation,
    standardShapeFlipPoint(drawing, position),
  );
  const next = moveFreeShapePoint(
    drawing,
    point,
    { x: origin.x + delta.x, y: origin.y + delta.y },
    props.layout,
  );
  if (next) commitUpdate(next, drawing);
}
type PointAction = "add" | "delete" | "smooth" | "straight" | "corner" | "close" | "open" | "exit";
const pointHandlers = new WeakMap<
  SheetGraphicDrawing,
  (action: PointAction, index: number) => boolean
>();
function pointHandler(drawing: SheetGraphicDrawing) {
  let handler = pointHandlers.get(drawing);
  if (!handler) {
    handler = (action, index) => pointAction(drawing, action, index);
    pointHandlers.set(drawing, handler);
  }
  return handler;
}
function selectFreeVertex(drawing: SheetGraphicDrawing, index: number): void {
  if (
    props.readOnly ||
    pointEditingId.value !== drawing.id ||
    props.drawings.find((item) => item.id === drawing.id) !== drawing ||
    !listFreeShapePoints(drawing).some((p) => p.role === "vertex" && p.commandIndex === index)
  )
    return;
  activeVertex.value = index;
}
function pointAction(
  drawing: SheetGraphicDrawing,
  action: "add" | "delete" | "smooth" | "straight" | "corner" | "close" | "open" | "exit",
  index: number,
): boolean {
  if (
    props.readOnly ||
    props.drawings.find((item) => item.id === drawing.id) !== drawing ||
    pointEditingId.value !== drawing.id
  )
    return false;
  if (action === "exit") {
    pointEditingId.value = null;
    pointRejected.value = false;
    return true;
  }
  const vertices = listFreeShapePoints(drawing).filter((p) => p.role === "vertex");
  const at = vertices.findIndex((p) => p.commandIndex === index);
  if (at < 0) return false;
  let next: SheetGraphicDrawing | undefined;
  if (action === "add") {
    const segment = drawing.shapePath!.commands[index + 1] ? index + 1 : undefined;
    if (segment !== undefined) next = addFreeShapePoint(drawing, segment, props.layout);
  } else if (action === "delete") next = deleteFreeShapePoint(drawing, index, props.layout);
  else if (action === "close" || action === "open")
    next = toggleClosedFreeShape(drawing, action === "close", props.layout, index);
  else next = setFreeShapePointType(drawing, index, action, props.layout);
  if (!next || !getDrawingShapeGeometry(next)) return false;
  const nextVertices = listFreeShapePoints(next).filter((p) => p.role === "vertex");
  const nextIndex =
    action === "open"
      ? 0
      : action === "add"
        ? at + 1
        : action === "delete"
          ? Math.min(at, nextVertices.length - 1)
          : at;
  if (!commitUpdate(next, drawing)) return false;
  activeVertex.value = nextVertices[nextIndex]?.commandIndex ?? 0;
  return true;
}
function nudgeAdjustment(
  drawing: SheetGraphicDrawing,
  index: number,
  delta: { x: number; y: number },
): void {
  if (props.readOnly || props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  const shape = getDrawingShapeGeometry(drawing);
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
  if (geometry) commitUpdate({ ...drawing, shapeGeometry: geometry }, drawing);
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
  if (next) commitUpdate(next, drawing);
}
function nudgeRotation(drawing: SheetGraphicDrawing, degrees: number): void {
  if (props.readOnly || props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  const rotation = ((((drawing.rotation + degrees + 180) % 360) + 360) % 360) - 180;
  commitUpdate({ ...drawing, rotation }, drawing);
}
function keydown(drawing: SheetDrawing, event: KeyboardEvent) {
  if (props.drawings.find((item) => item.id === drawing.id) !== drawing) return;
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey)
    return;
  if (event.key === "Escape") {
    if (pointEditingId.value === drawing.id) {
      pointEditingId.value = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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
    if (moved) commitUpdate(moved, drawing);
  }
}
function clearOutside(event: PointerEvent) {
  if (
    event.target instanceof Element &&
    !event.target.closest("[data-sheet-drawing-id]") &&
    !event.target.closest(
      '[role="dialog"],[role="menu"],[role="listbox"],[data-shape-format-pane],[data-shape-format-trigger]',
    )
  ) {
    selectedId.value = null;
    pointEditingId.value = null;
  }
}
onMounted(() => document.addEventListener("pointerdown", clearOutside));
onBeforeUnmount(() => {
  detailedPresentations.clear();
  session?.cancel();
  document.removeEventListener("pointerdown", clearOutside);
});
watch(pointEditingId, () => {
  session?.cancel();
  preview.value = undefined;
  pointRejected.value = false;
});
watch(
  () => props.readOnly,
  (value) => {
    if (value) {
      session?.cancel();
      pointEditingId.value = null;
    }
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
  () => props.sheet,
  () => {
    pointEditingId.value = null;
  },
);
watch(
  () => props.drawings,
  () => {
    session?.cancel();
    preview.value = undefined;
    const editing = props.drawings.find((drawing) => drawing.id === pointEditingId.value);
    if (editing?.kind !== "shape" || !editing.shapePath) pointEditingId.value = null;
    else if (
      !listFreeShapePoints(editing).some(
        (p) => p.role === "vertex" && p.commandIndex === activeVertex.value,
      )
    )
      activeVertex.value = 0;
    if (!props.drawings.some((drawing) => drawing.id === selectedId.value)) {
      session?.cancel();
      selectedId.value = null;
      pointEditingId.value = null;
    }
  },
);
</script>
<template>
  <div ref="layerElement" class="sheet-drawing-layer">
    <button
      v-if="formatTarget && !readOnly"
      type="button"
      class="sheet-drawing-layer__format"
      :style="formatTriggerStyle"
      data-shape-format-trigger
      :aria-label="locale === 'zh-CN' ? '设置形状格式' : 'Format Shape'"
      :title="locale === 'zh-CN' ? '设置形状格式' : 'Format Shape'"
      @pointerdown.stop
      @click.stop="formatSelected"
    >
      ⋯
    </button>
    <div
      v-if="pointEditingId && pointRejected"
      role="status"
      class="sheet-drawing-layer__point-feedback"
      data-free-shape-update-rejected
    >
      {{
        locale === "zh-CN"
          ? "无法应用此顶点更改，当前路径和撤销记录已保留。"
          : "This point change could not be applied. Your path and undo history are preserved."
      }}
    </div>
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
      @contextmenu="pointContext(fragment, $event)"
      @keydown="keydown(fragment.drawing, $event)"
    >
      <div class="sheet-drawing-layer__clip">
        <div class="sheet-drawing-layer__content" :style="contentStyle(fragment)">
          <DrawingContent
            @detailed-paint="acceptDetailedPaint(fragment, $event)"
            @control-change="emit('controlChange', fragment.drawing.id, $event)"
            :drawing="fragment.drawing"
            :density="rasterDensity"
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
      <FreeShapePointSelection
        v-if="
          selectedId === fragment.drawing.id &&
          pointEditingId === fragment.drawing.id &&
          !readOnly &&
          isStandard(fragment.drawing) &&
          fragment.drawing.shapePath
        "
        :drawing="fragment.drawing"
        :fragment="fragment"
        :pane-clip="layout.panes[fragment.paneId].clip"
        :active-vertex="activeVertex"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
        :handler="pointHandler(fragment.drawing)"
        @select-vertex="
          (index) => isStandard(fragment.drawing) && selectFreeVertex(fragment.drawing, index)
        "
        @move="(point, event) => start(fragment, event, undefined, 'point', undefined, point)"
        @nudge="
          (point, delta) =>
            isStandard(fragment.drawing) && nudgeFreePoint(fragment.drawing, point, delta)
        "
      />
      <StandardShapeSelection
        v-else-if="selectedId === fragment.drawing.id && !readOnly && isStandard(fragment.drawing)"
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
  &__format {
    position: absolute;
    z-index: var(--sheetcraft-layer-toolbar);
    pointer-events: auto;
    width: 28px;
    height: 28px;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: 4px;
    background: var(--sheetcraft-surface-panel);
    color: var(--sheetcraft-text-primary);
    font-size: 20px;
    cursor: pointer;
  }
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

<style scoped>
.sheet-drawing-layer__point-feedback {
  position: absolute;
  z-index: 30;
  left: 12px;
  bottom: 12px;
  max-width: min(360px, calc(100% - 24px));
  padding: 8px 12px;
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-secondary);
  border: 1px solid var(--sheetcraft-border-control);
  border-radius: 6px;
  pointer-events: none;
  font-size: 12px;
}
</style>
