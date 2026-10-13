<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch, type CSSProperties } from "vue";
import { Check } from "lucide-vue-next";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import { isShapeFreePathClosed } from "@sheetcraft/core/shape-free-path";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { createContextMenuPoint, useContextMenu } from "../../../shared/menu/useContextMenu";
import { listFreeShapePoints, type FreeShapePoint } from "../free-shape-point-layout";
import {
  getDrawingShapeGeometry,
  getStandardShapeSvgPaths,
  standardShapeSvgTransform,
  standardShapeFlipPoint,
} from "../shape-geometry";

import type {
  FreeShapePointAction as PointAction,
  FreeShapePointActionHandler as PointActionHandler,
} from "../free-shape-edit-actions";
import {
  canDeleteClosedFreeShapeSegment,
  getFreeShapeSegmentType,
} from "../free-shape-point-operations";
const props = withDefaults(
  defineProps<{
    drawing: SheetGraphicDrawing;
    fragment: FloatingImageViewportFragment;
    paneClip: Rect;
    activeVertex?: number;
    locale?: "en-US" | "zh-CN";
    disabled?: boolean;
    handler: PointActionHandler;
  }>(),
  { activeVertex: 0, locale: "en-US", disabled: false },
);
const emit = defineEmits<{
  move: [point: FreeShapePoint, event: PointerEvent];
  nudge: [point: FreeShapePoint, delta: { x: number; y: number }];
  selectVertex: [index: number];
}>();
const messages = {
  "en-US": {
    menu: "Edit Points",
    vertex: "Edit point",
    start: "Edit start point",
    end: "Edit end point",
    control: "Edit control",
    forVertex: "for point",
    add: "Add Point",
    delete: "Delete Point",
    segment: "Edit segment",
    deleteSegment: "Delete Segment",
    straightSegment: "Straight Segment",
    curvedSegment: "Curved Segment",
    close: "Close Path",
    open: "Open Path",
    smooth: "Smooth Point",
    straight: "Straight Point",
    corner: "Corner Point",
    exit: "Exit Edit Points",
    rejected: "This change couldn’t be applied. Your current point and path are preserved.",
  },
  "zh-CN": {
    menu: "编辑顶点",
    vertex: "编辑顶点",
    start: "编辑起点",
    end: "编辑终点",
    control: "编辑控制点",
    forVertex: "所属顶点",
    add: "添加顶点",
    delete: "删除顶点",
    segment: "编辑线段",
    deleteSegment: "删除线段",
    straightSegment: "直线段",
    curvedSegment: "曲线段",
    close: "闭合路径",
    open: "开放路径",
    smooth: "平滑顶点",
    straight: "直线顶点",
    corner: "角部顶点",
    exit: "退出顶点编辑",
    rejected: "无法应用此更改，已保留当前顶点和路径。",
  },
} as const;
const labels = computed(() => messages[props.locale]);
const editPaths = computed(() => getStandardShapeSvgPaths(getDrawingShapeGeometry(props.drawing)));
const segmentPaths = computed(() => {
  const commands = getDrawingShapeGeometry(props.drawing)?.paths[0]?.commands;
  if (!commands?.length || !props.drawing.shapePath) return [];
  const first = commands[0]!;
  if (first[0] !== "M") return [];
  return commands.slice(1).flatMap((command, offset) => {
    const index = offset + 1,
      previous = commands[index - 1]!;
    if (previous[0] === "Z") return [];
    const x = previous[previous.length - 2],
      y = previous[previous.length - 1];
    const segment = command[0] === "Z" ? ["L", first[1], first[2]] : command;
    if (segment.slice(1).every((value, coordinate) => value === (coordinate % 2 ? y : x)))
      return [];
    const hull = [{ x: Number(x), y: Number(y) }];
    for (let coordinate = 1; coordinate < segment.length; coordinate += 2)
      hull.push({ x: Number(segment[coordinate]), y: Number(segment[coordinate + 1]) });
    const projected = hull.map((point) =>
      pictureFrameLocalToWorld(
        props.fragment.rect,
        props.drawing.rotation,
        standardShapeFlipPoint(props.drawing, point),
      ),
    );
    const clip = props.paneClip;
    if (
      Math.max(...projected.map((point) => point.x)) < clip.x ||
      Math.min(...projected.map((point) => point.x)) >= clip.x + clip.width ||
      Math.max(...projected.map((point) => point.y)) < clip.y ||
      Math.min(...projected.map((point) => point.y)) >= clip.y + clip.height
    )
      return [];
    // Commands are normalized numeric geometry. Each hit stroke owns one exact
    // authored segment, including the implicit closing edge, without fill hits.
    const endpointX = command[command.length - 2],
      endpointY = command[command.length - 1];
    const seam =
      command[0] === "Z" ||
      (commands.at(-1)?.[0] === "Z" &&
        index === commands.length - 2 &&
        endpointX === first[1] &&
        endpointY === first[2]);
    return [{ index, vertexIndex: seam ? 0 : index, d: `M ${x} ${y} ${segment.join(" ")}` }];
  });
});
const editTransform = computed(
  () =>
    `translate(${props.fragment.rect.x - props.paneClip.x} ${props.fragment.rect.y - props.paneClip.y}) rotate(${props.drawing.rotation} ${props.drawing.width / 2} ${props.drawing.height / 2}) ${standardShapeSvgTransform(props.drawing) ?? ""}`,
);
const points = computed(() =>
  listFreeShapePoints(props.drawing).map((descriptor) => ({
    descriptor,
    world: pictureFrameLocalToWorld(
      props.fragment.rect,
      props.drawing.rotation,
      standardShapeFlipPoint(props.drawing, descriptor.position),
    ),
  })),
);
function owns(point: { x: number; y: number }): boolean {
  const clip = props.paneClip;
  return (
    point.x >= clip.x &&
    point.x < clip.x + clip.width &&
    point.y >= clip.y &&
    point.y < clip.y + clip.height
  );
}
function pointStyle(point: { x: number; y: number }): CSSProperties {
  return {
    left: `${point.x - props.fragment.clippedRect.x}px`,
    top: `${point.y - props.fragment.clippedRect.y}px`,
  };
}
const coincidentEndpoints = computed(() => {
  if (!props.drawing.shapePath || isShapeFreePathClosed(props.drawing.shapePath)) return;
  const vertices = points.value.filter((point) => point.descriptor.role === "vertex");
  const first = vertices[0],
    last = vertices.at(-1);
  if (
    !first ||
    !last ||
    first === last ||
    first.descriptor.position.x !== last.descriptor.position.x ||
    first.descriptor.position.y !== last.descriptor.position.y
  )
    return;
  return { start: first.descriptor.commandIndex, end: last.descriptor.commandIndex };
});
function endpointRole(point: FreeShapePoint): "start" | "end" | undefined {
  const endpoints = coincidentEndpoints.value;
  if (point.role !== "vertex" || !endpoints) return;
  if (point.commandIndex === endpoints.start) return "start";
  if (point.commandIndex === endpoints.end) return "end";
  return;
}
const vertices = computed(() =>
  points.value
    .filter((point) => point.descriptor.role === "vertex" && owns(point.world))
    .map((point) => {
      const endpoint = endpointRole(point.descriptor);
      return {
        ...point,
        endpoint,
        // Display-only separation leaves canonical ownership and drag descriptors untouched.
        display: {
          x: point.world.x + (endpoint === "start" ? -3 : endpoint === "end" ? 3 : 0),
          y: point.world.y,
        },
      };
    }),
);
const endpointGuides = computed(() => vertices.value.filter((point) => point.endpoint));
const activeControls = computed(() =>
  points.value.filter(
    (point) =>
      point.descriptor.role !== "vertex" && point.descriptor.vertexIndex === props.activeVertex,
  ),
);
const controls = computed(() => activeControls.value.filter((point) => owns(point.world)));
const activePoint = computed(() =>
  points.value.find(
    (point) =>
      point.descriptor.role === "vertex" && point.descriptor.vertexIndex === props.activeVertex,
  ),
);
const connectorStyle = computed<CSSProperties>(() => ({
  left: `${props.paneClip.x - props.fragment.clippedRect.x}px`,
  top: `${props.paneClip.y - props.fragment.clippedRect.y}px`,
  width: `${props.paneClip.width}px`,
  height: `${props.paneClip.height}px`,
}));
function pointLabel(point: FreeShapePoint): string {
  if (point.role === "vertex") {
    const endpoint = endpointRole(point);
    return `${endpoint ? labels.value[endpoint] : labels.value.vertex} ${point.vertexIndex + 1}`;
  }
  return `${labels.value.control} ${point.role === "control1" ? 1 : 2}, ${labels.value.forVertex} ${point.vertexIndex + 1}`;
}
function startMove(point: FreeShapePoint, event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return;
  (event.currentTarget as HTMLElement | null)?.focus();
  emit("selectVertex", point.vertexIndex);
  emit("move", point, event);
}

type MenuSession = {
  owner: SheetGraphicDrawing;
  path: SheetGraphicDrawing["shapePath"];
  fragment: FloatingImageViewportFragment;
  clip: Rect;
  handler: PointActionHandler;
  generation: number;
  vertexIndex: number;
  kind: "vertex" | "segment";
  actions: Record<PointAction, () => void>;
};
const menu = shallowRef<MenuSession | null>(null);
const anchor = shallowRef<FloatingReference | null>(null);
const rejected = ref(false);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const panelRef = computed<HTMLElement | null>(() => surfaceRef.value?.rootElement ?? null);
const menuOpen = computed(() => menu.value !== null);
let generation = 0;
let mounted = true;
function closeMenu(): void {
  generation++;
  menu.value = null;
  rejected.value = false;
}
const { floatingStyles, dismiss } = useContextMenu({
  anchor,
  panelRef,
  open: menuOpen,
  surfaceRef,
  offset: 4,
  onDismiss: closeMenu,
});
function isCurrent(session: MenuSession): boolean {
  return (
    mounted &&
    !props.disabled &&
    menu.value === session &&
    generation === session.generation &&
    props.drawing === session.owner &&
    props.handler === session.handler &&
    props.drawing.shapePath === session.path &&
    props.fragment === session.fragment &&
    props.paneClip === session.clip
  );
}
function applyAction(session: MenuSession, action: PointAction): void {
  if (!isCurrent(session)) return;
  let accepted = false;
  try {
    accepted =
      session.handler(
        action,
        session.kind === "segment" && action === "close" ? 0 : session.vertexIndex,
      ) === true;
  } catch {
    // The owner retains the model and history; rejection keeps this menu available for retry.
  }
  if (!isCurrent(session)) return;
  if (accepted) dismiss("programmatic", true);
  else rejected.value = true;
}
function openMenuTarget(
  index: number,
  kind: "vertex" | "segment",
  reference: FloatingReference,
): void {
  if (props.disabled || !mounted) return;
  if (kind === "segment" && !getFreeShapeSegmentType(props.drawing, index)) return;
  generation++;
  const session: MenuSession = {
    owner: props.drawing,
    path: props.drawing.shapePath,
    fragment: props.fragment,
    clip: props.paneClip,
    handler: props.handler,
    generation,
    vertexIndex: index,
    kind,
    // Each callback closes over this exact opening, rather than reading a newer menu target.
    actions: {
      add: () => applyAction(session, kind === "segment" ? "add-segment" : "add"),
      delete: () => applyAction(session, "delete"),
      smooth: () => applyAction(session, "smooth"),
      straight: () => applyAction(session, "straight"),
      corner: () => applyAction(session, "corner"),
      close: () => applyAction(session, "close"),
      open: () => applyAction(session, "open"),
      exit: () => applyAction(session, "exit"),
      "delete-segment": () => applyAction(session, "delete-segment"),
      "add-segment": () => applyAction(session, "add-segment"),
      "straight-segment": () => applyAction(session, "straight-segment"),
      "curved-segment": () => applyAction(session, "curved-segment"),
    },
  };
  anchor.value = reference;
  rejected.value = false;
  menu.value = session;
  if (kind === "vertex") emit("selectVertex", index);
  else
    emit(
      "selectVertex",
      segmentPaths.value.find((segment) => segment.index === index)?.vertexIndex ?? 0,
    );
}
function openMenu(point: FreeShapePoint, reference: FloatingReference): void {
  if (point.role === "vertex") openMenuTarget(point.vertexIndex, "vertex", reference);
}
function segmentContextMenu(index: number, event: MouseEvent): void {
  openMenuTarget(
    index,
    "segment",
    createContextMenuPoint(event, event.currentTarget as Element | null),
  );
}
function segmentKey(index: number, event: KeyboardEvent): void {
  if (props.disabled || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (
    event.key !== "ContextMenu" &&
    !(event.key === "F10" && event.shiftKey) &&
    event.key !== "Enter"
  )
    return;
  const target = event.currentTarget;
  if (!(target instanceof Element)) return;
  event.preventDefault();
  event.stopPropagation();
  openMenuTarget(index, "segment", target);
}
function contextMenu(point: FreeShapePoint, event: MouseEvent): void {
  openMenu(point, createContextMenuPoint(event, event.currentTarget as Element | null));
}
function handleKey(point: FreeShapePoint, event: KeyboardEvent): void {
  if (props.disabled || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (
    point.role === "vertex" &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    openMenu(point, button);
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  const delta = {
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
  }[event.key];
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  emit("selectVertex", point.vertexIndex);
  emit("nudge", point, delta);
}
const menuPointType = computed(
  () => menu.value?.owner.shapePath?.pointTypes?.[menu.value.vertexIndex] ?? "corner",
);
const menuSegmentType = computed(() =>
  menu.value?.kind === "segment"
    ? getFreeShapeSegmentType(menu.value.owner, menu.value.vertexIndex)
    : undefined,
);
const menuClosedPath = computed(
  () => !!menu.value?.owner.shapePath && isShapeFreePathClosed(menu.value.owner.shapePath),
);
watch(
  () => [
    props.drawing,
    props.drawing.shapePath,
    props.handler,
    props.disabled,
    props.fragment,
    props.paneClip,
  ],
  closeMenu,
  {
    flush: "sync",
  },
);
onBeforeUnmount(() => {
  mounted = false;
  closeMenu();
});
</script>

<template>
  <div class="free-shape-point-selection" data-free-shape-point-selection>
    <svg
      v-if="editPaths.length || (activePoint && activeControls.length) || endpointGuides.length"
      class="free-shape-point-selection__connectors"
      :style="connectorStyle"
    >
      <g :transform="editTransform">
        <path
          v-for="segment in segmentPaths"
          :key="`segment-${segment.index}`"
          :d="segment.d"
          class="free-shape-point-selection__segment"
          fill="none"
          stroke="transparent"
          stroke-width="12"
          vector-effect="non-scaling-stroke"
          role="button"
          :tabindex="disabled ? -1 : 0"
          :aria-label="`${labels.segment} ${segment.index}`"
          :aria-disabled="disabled"
          :data-free-shape-segment="segment.index"
          @pointerdown.stop
          @click.stop
          @contextmenu.prevent.stop="segmentContextMenu(segment.index, $event)"
          @keydown="segmentKey(segment.index, $event)"
          @dblclick.prevent.stop
        />
        <path
          v-for="(path, index) in editPaths"
          :key="index"
          :d="path.d"
          fill="none"
          stroke="#dc2626"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
          data-free-shape-edit-path
        />
      </g>
      <line
        v-for="point in activePoint ? activeControls : []"
        :key="`${point.descriptor.commandIndex}-${point.descriptor.role}`"
        :x1="activePoint!.world.x - paneClip.x"
        :y1="activePoint!.world.y - paneClip.y"
        :x2="point.world.x - paneClip.x"
        :y2="point.world.y - paneClip.y"
        data-free-shape-control-connector
      />
      <line
        v-for="point in endpointGuides"
        :key="`endpoint-${point.endpoint}`"
        :x1="point.world.x - paneClip.x"
        :y1="point.world.y - paneClip.y"
        :x2="point.display.x - paneClip.x"
        :y2="point.display.y - paneClip.y"
        :data-free-shape-endpoint-guide="point.endpoint"
      />
    </svg>
    <button
      v-for="point in vertices"
      :key="point.descriptor.commandIndex"
      type="button"
      class="free-shape-point-selection__handle is-vertex"
      :class="{
        'is-active': point.descriptor.vertexIndex === activeVertex,
        'is-coincident-endpoint': point.endpoint,
        'is-endpoint-end': point.endpoint === 'end',
      }"
      :style="pointStyle(point.display)"
      :disabled="disabled"
      :aria-label="pointLabel(point.descriptor)"
      :aria-pressed="point.descriptor.vertexIndex === activeVertex"
      :data-free-shape-vertex="point.descriptor.vertexIndex"
      :data-free-shape-endpoint="point.endpoint"
      @pointerdown.prevent.stop="startMove(point.descriptor, $event)"
      @keydown="handleKey(point.descriptor, $event)"
      @contextmenu.prevent.stop="contextMenu(point.descriptor, $event)"
      @dblclick.prevent.stop
    />
    <button
      v-for="point in controls"
      :key="`${point.descriptor.commandIndex}-${point.descriptor.role}`"
      type="button"
      class="free-shape-point-selection__handle is-control"
      :style="pointStyle(point.world)"
      :disabled="disabled"
      :aria-label="pointLabel(point.descriptor)"
      :data-free-shape-control="point.descriptor.role"
      :data-free-shape-command-index="point.descriptor.commandIndex"
      @pointerdown.prevent.stop="startMove(point.descriptor, $event)"
      @keydown="handleKey(point.descriptor, $event)"
      @contextmenu.prevent.stop
      @dblclick.prevent.stop
    />
    <Teleport to="body">
      <MenuSurface
        v-if="menu"
        ref="surfaceRef"
        :style="floatingStyles"
        :label="labels.menu"
        data-free-shape-point-menu
        @pointerdown.stop
        @click.stop
        @contextmenu.prevent.stop
        @dblclick.prevent.stop
      >
        <MenuItem
          :disabled="disabled"
          data-free-shape-point-action="add"
          @select="menu.actions.add"
        >
          {{ labels.add }}
        </MenuItem>
        <MenuItem
          v-if="menu.kind === 'vertex'"
          :disabled="disabled"
          data-free-shape-point-action="delete"
          @select="menu.actions.delete"
        >
          {{ labels.delete }}
        </MenuItem>
        <MenuItem
          v-else
          :disabled="disabled || !canDeleteClosedFreeShapeSegment(menu.owner, menu.vertexIndex)"
          data-free-shape-point-action="delete-segment"
          @select="menu.actions['delete-segment']"
        >
          {{ labels.deleteSegment }}
        </MenuItem>
        <MenuSeparator v-if="menu.kind === 'vertex' || !menuClosedPath" />
        <MenuItem
          v-if="menuClosedPath && menu.kind === 'vertex'"
          :disabled="disabled"
          data-free-shape-point-action="open"
          @select="menu.actions.open"
        >
          {{ labels.open }}
        </MenuItem>
        <MenuItem
          v-else-if="!menuClosedPath"
          :disabled="disabled"
          data-free-shape-point-action="close"
          @select="menu.actions.close"
        >
          {{ labels.close }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          v-if="menu.kind === 'vertex'"
          role="menuitemradio"
          :aria-checked="menuPointType === 'smooth'"
          :disabled="disabled"
          data-free-shape-point-action="smooth"
          @select="menu.actions.smooth"
        >
          <template #icon><Check v-if="menuPointType === 'smooth'" /></template>
          {{ labels.smooth }}
        </MenuItem>
        <MenuItem
          v-if="menu.kind === 'vertex'"
          role="menuitemradio"
          :aria-checked="menuPointType === 'straight'"
          :disabled="disabled"
          data-free-shape-point-action="straight"
          @select="menu.actions.straight"
        >
          <template #icon><Check v-if="menuPointType === 'straight'" /></template>
          {{ labels.straight }}
        </MenuItem>
        <MenuItem
          v-if="menu.kind === 'vertex'"
          role="menuitemradio"
          :aria-checked="menuPointType === 'corner'"
          :disabled="disabled"
          data-free-shape-point-action="corner"
          @select="menu.actions.corner"
        >
          <template #icon><Check v-if="menuPointType === 'corner'" /></template>
          {{ labels.corner }}
        </MenuItem>
        <MenuItem
          v-if="menu.kind === 'segment'"
          role="menuitemradio"
          :aria-checked="menuSegmentType === 'straight'"
          :disabled="disabled"
          data-free-shape-point-action="straight-segment"
          @select="menu.actions['straight-segment']"
        >
          <template #icon><Check v-if="menuSegmentType === 'straight'" /></template>
          {{ labels.straightSegment }}
        </MenuItem>
        <MenuItem
          v-if="menu.kind === 'segment'"
          role="menuitemradio"
          :aria-checked="menuSegmentType === 'curved'"
          :disabled="disabled"
          data-free-shape-point-action="curved-segment"
          @select="menu.actions['curved-segment']"
        >
          <template #icon><Check v-if="menuSegmentType === 'curved'" /></template>
          {{ labels.curvedSegment }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          :disabled="disabled"
          data-free-shape-point-action="exit"
          @select="menu.actions.exit"
        >
          {{ labels.exit }}
        </MenuItem>
        <li v-if="rejected" role="none" class="free-shape-point-selection__feedback">
          <span role="status" aria-live="polite">{{ labels.rejected }}</span>
        </li>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.free-shape-point-selection {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;

  &__connectors {
    position: absolute;
    overflow: hidden;
    stroke: var(--sheetcraft-action-primary);
    stroke-width: 1;
    pointer-events: none;
  }

  &__segment {
    pointer-events: stroke;
    cursor: context-menu;

    &:focus-visible {
      stroke: var(--sheetcraft-action-primary);
      stroke-opacity: 0.3;
    }
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
      background: var(--sheetcraft-surface-panel);
    }

    &.is-vertex::after {
      background: var(--sheetcraft-text-primary);
      border-color: var(--sheetcraft-text-primary);
    }

    &.is-coincident-endpoint {
      width: 8px;
      height: 8px;

      &::after {
        inset: 0;
      }
    }

    &.is-endpoint-end::after {
      background: var(--sheetcraft-surface-panel);
    }

    &.is-active::after {
      background: var(--sheetcraft-action-primary);
      border-color: var(--sheetcraft-action-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: 2px;
    }

    &:disabled {
      cursor: default;
    }
  }

  &__feedback {
    max-width: 240px;
    padding: var(--sheetcraft-space-2) var(--sheetcraft-menu-item-padding-inline, 14px);
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: normal;
  }
}
</style>
