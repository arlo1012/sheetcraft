<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import {
  normalizeShapeLineEnds,
  type ShapeLineEndDimension,
  type ShapeLineEndKind,
  type ShapeLineEnds,
  type ShapeLineEnd,
} from "@sheetcraft/core/shape-line-ends";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { getShapeEndPaint } from "../shape-line-paint";
import { getStandardShapeGeometry, getStandardShapeSvgPaths } from "../shape-geometry";

type Endpoint = "begin" | "end";
type EndType = "none" | ShapeLineEndKind;
type SizeChoice = Readonly<{ width: ShapeLineEndDimension; length: ShapeLineEndDimension }>;
type Labels = Readonly<{
  group: string;
  begin: string;
  end: string;
  type: string;
  size: string;
  width: string;
  length: string;
  noneHint: string;
  rejected: string;
  mixed: string;
  types: Readonly<Record<EndType, string>>;
  dimensions: Readonly<Record<ShapeLineEndDimension, string>>;
}>;
const LABELS: Readonly<Record<"en-US" | "zh-CN", Labels>> = {
  "en-US": {
    group: "Line arrowheads",
    mixed: "Mixed values",
    begin: "Begin Arrow",
    end: "End Arrow",
    type: "Type",
    size: "Size",
    width: "Width",
    length: "Length",
    noneHint: "Choose an arrow type to change its size.",
    rejected: "The arrowhead change could not be applied. Your current values are preserved.",
    types: {
      none: "No Arrow",
      triangle: "Arrow",
      open: "Open Arrow",
      stealth: "Notched Right Arrow",
      diamond: "Diamond Arrow",
      oval: "Oval Arrow",
    },
    dimensions: { small: "Small", medium: "Medium", large: "Large" },
  },
  "zh-CN": {
    group: "线条箭头",
    mixed: "多个不同值",
    begin: "起点箭头",
    end: "终点箭头",
    type: "类型",
    size: "大小",
    width: "宽度",
    length: "长度",
    noneHint: "选择箭头类型后可调整大小。",
    rejected: "未能应用箭头更改，当前值已保留。",
    types: {
      none: "无箭头",
      triangle: "箭头",
      open: "开放型箭头",
      stealth: "燕尾箭头",
      diamond: "菱形箭头",
      oval: "椭圆箭头",
    },
    dimensions: { small: "小", medium: "中", large: "大" },
  },
};
const ENDPOINTS: readonly Endpoint[] = ["begin", "end"];
const END_TYPES: readonly EndType[] = ["none", "triangle", "open", "stealth", "diamond", "oval"];
const DIMENSIONS: readonly ShapeLineEndDimension[] = ["small", "medium", "large"];
const SIZES: readonly SizeChoice[] = DIMENSIONS.flatMap((width) =>
  DIMENSIONS.map((length) => ({ width, length })),
);
const props = withDefaults(
  defineProps<{
    ends?: ShapeLineEnds;
    disabled?: boolean;
    locale?: "en-US" | "zh-CN";
    handler: (next: ShapeLineEnds | undefined) => boolean;
    /** Container edits change one ordered endpoint, retaining each leaf's opposite decoration. */
    endpointHandler?: (side: Endpoint, next: ShapeLineEnd | undefined) => boolean;
    mixed?: readonly Endpoint[];
  }>(),
  { disabled: false, locale: "en-US" },
);
const rejected = ref(false);
const activeSize = ref<Record<Endpoint, number | null>>({ begin: null, end: null });
const current = computed(() => normalizeShapeLineEnds(props.ends));
const labels = computed(() => LABELS[props.locale]);
const typeOptions = computed(() =>
  END_TYPES.map((value) => ({ value, label: labels.value.types[value] })),
);
let generation = 0;

// The previews use the same bounded marker geometry as the drawing renderer.
// These are product-owned sizes; no desktop numeric multipliers are implied.
const previewDrawing: SheetGraphicDrawing = {
  id: "line-end-preview",
  kind: "shape",
  name: "",
  anchor: { row: 0, column: 0 },
  offsetX: 0,
  offsetY: 0,
  width: 56,
  height: 1,
  shape: "line",
  shapeGeometry: { preset: "line" },
  text: "",
  fill: "transparent",
  stroke: "#000000",
  strokeWidth: 2,
  color: "#000000",
  fontSize: 12,
  bold: false,
  italic: false,
  rotation: 0,
};
const previewGeometry = getStandardShapeGeometry(previewDrawing.shapeGeometry, 56, 1);
const previewPaths = getStandardShapeSvgPaths(previewGeometry);
const previews = computed(() => {
  const forEnd = (side: Endpoint) =>
    SIZES.map((size) => {
      const end = current.value?.[side];
      return end
        ? getShapeEndPaint(
            { ...previewDrawing, shapeLineEnds: { [side]: { kind: end.kind, ...size } } },
            previewGeometry,
          )
        : [];
    });
  return { begin: forEnd("begin"), end: forEnd("end") };
});

function selectedSize(side: Endpoint): number {
  const end = current.value?.[side];
  return end
    ? SIZES.findIndex(
        (size) =>
          size.width === (end.width ?? "medium") && size.length === (end.length ?? "medium"),
      )
    : -1;
}
function tabSize(side: Endpoint): number {
  return props.disabled || !current.value?.[side]
    ? -1
    : (activeSize.value[side] ?? selectedSize(side));
}
function sizeLabel(side: Endpoint, size: SizeChoice): string {
  const text = labels.value;
  return `${text[side]} ${text.size}: ${text.width} ${text.dimensions[size.width]}, ${text.length} ${text.dimensions[size.length]}`;
}
function capture() {
  return {
    ends: props.ends,
    value: normalizeShapeLineEnds(props.ends),
    handler: props.handler,
    endpointHandler: props.endpointHandler,
    mixed: props.mixed,
    generation,
    disabled: props.disabled,
  };
}
type Captured = ReturnType<typeof capture>;
function isCurrent(source: Captured): boolean {
  return (
    !source.disabled &&
    !props.disabled &&
    source.generation === generation &&
    source.ends === props.ends &&
    source.handler === props.handler &&
    source.endpointHandler === props.endpointHandler &&
    source.mixed === props.mixed
  );
}
function apply(source: Captured, next: ShapeLineEnds, side: Endpoint): void {
  if (!isCurrent(source)) return;
  let accepted = false;
  try {
    const normalized = normalizeShapeLineEnds(next);
    accepted =
      (source.endpointHandler
        ? source.endpointHandler(side, normalized?.[side])
        : source.handler(normalized)) === true;
  } catch {
    // Rejection never changes the controlled values or the owner's draft.
  }
  if (isCurrent(source)) rejected.value = !accepted;
}
/** Rendered callbacks retain their exact source, rather than retargeting new props. */
function typeAction(side: Endpoint) {
  const source = capture();
  return (value: unknown) => {
    if (!isCurrent(source) || !END_TYPES.includes(value as EndType)) return;
    const next = normalizeShapeLineEnds(source.value) ?? {};
    if (value === "none") delete next[side];
    else next[side] = { ...next[side], kind: value as ShapeLineEndKind };
    apply(source, next, side);
  };
}
function sizeAction(side: Endpoint, size: SizeChoice) {
  const source = capture();
  return () => {
    const end = source.value?.[side];
    if (!isCurrent(source) || !end) return;
    const next = normalizeShapeLineEnds(source.value) ?? {};
    next[side] = { kind: end.kind, ...size };
    apply(source, next, side);
  };
}
function onGridKeydown(side: Endpoint, event: KeyboardEvent): void {
  if (
    props.disabled ||
    !current.value?.[side] ||
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
  )
    return;
  const target = event.target;
  const button =
    target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>("button[data-line-end-size]")
      : null;
  const grid = event.currentTarget as HTMLElement;
  const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const index = button ? buttons.indexOf(button) : -1;
  if (index < 0) return;
  const row = Math.floor(index / 3),
    column = index % 3;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 8
        : event.key === "ArrowLeft"
          ? row * 3 + Math.max(0, column - 1)
          : event.key === "ArrowRight"
            ? row * 3 + Math.min(2, column + 1)
            : event.key === "ArrowUp"
              ? Math.max(0, row - 1) * 3 + column
              : Math.min(2, row + 1) * 3 + column;
  event.preventDefault();
  event.stopPropagation();
  activeSize.value[side] = next;
  buttons[next]?.focus();
}
watch(
  [
    () => props.ends,
    () => props.handler,
    () => props.endpointHandler,
    () => props.mixed,
    () => props.disabled,
  ],
  () => {
    generation++;
    rejected.value = false;
    activeSize.value = { begin: null, end: null };
  },
  { flush: "sync" },
);
onUnmounted(() => {
  generation++;
});
</script>

<template>
  <div class="shape-line-ends" role="group" :aria-label="labels.group">
    <section
      v-for="side in ENDPOINTS"
      :key="side"
      class="shape-line-ends__endpoint"
      :data-line-end="side"
      :aria-label="labels[side]"
    >
      <h3 class="shape-line-ends__heading">{{ labels[side] }}</h3>
      <div class="shape-line-ends__type">
        <span>{{ labels.type }}</span>
        <TSelect
          :model-value="mixed?.includes(side) ? undefined : (current?.[side]?.kind ?? 'none')"
          :placeholder="mixed?.includes(side) ? labels.mixed : undefined"
          :options="typeOptions"
          :disabled="disabled"
          size="small"
          :aria-label="`${labels[side]} ${labels.type}`"
          :onChange="typeAction(side)"
        />
      </div>
      <div class="shape-line-ends__size-label">{{ labels.size }}</div>
      <div class="shape-line-ends__axes">
        <span class="shape-line-ends__axis-title">{{ labels.width }} ↓</span>
        <div class="shape-line-ends__length-axis">
          <span class="shape-line-ends__axis-title">{{ labels.length }} →</span>
          <div class="shape-line-ends__columns">
            <span v-for="dimension in DIMENSIONS" :key="dimension">{{
              labels.dimensions[dimension]
            }}</span>
          </div>
        </div>
        <div class="shape-line-ends__width-axis" aria-hidden="true">
          <span v-for="dimension in DIMENSIONS" :key="dimension">{{
            labels.dimensions[dimension]
          }}</span>
        </div>
        <div
          class="shape-line-ends__grid"
          role="group"
          :aria-label="`${labels[side]} ${labels.size}, ${labels.width} × ${labels.length}`"
          @keydown="onGridKeydown(side, $event)"
        >
          <button
            v-for="(size, index) in SIZES"
            :key="`${size.width}-${size.length}`"
            type="button"
            class="shape-line-ends__choice"
            :data-line-end-size="`${side}-${size.width}-${size.length}`"
            :disabled="disabled || !current?.[side]"
            :aria-pressed="index === selectedSize(side)"
            :aria-label="sizeLabel(side, size)"
            :title="sizeLabel(side, size)"
            :tabindex="index === tabSize(side) ? 0 : -1"
            @focus="activeSize[side] = index"
            :onClick="sizeAction(side, size)"
          >
            <svg viewBox="-5 -13 66 27" aria-hidden="true" focusable="false">
              <path
                v-for="(path, pathIndex) in previewPaths"
                :key="`line-${pathIndex}`"
                :d="path.d"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                v-for="(paint, paintIndex) in previews[side][index]"
                :key="`end-${paintIndex}`"
                :d="paint.d"
                :fill="paint.filled ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                data-line-end-preview
              />
            </svg>
          </button>
        </div>
      </div>
      <p v-if="!current?.[side]" class="shape-line-ends__hint">{{ labels.noneHint }}</p>
    </section>
    <p v-if="rejected" class="shape-line-ends__feedback" role="alert">{{ labels.rejected }}</p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;

.shape-line-ends {
  display: grid;
  min-width: 0;
  gap: var(--sheetcraft-space-3);
  font-size: var(--sheetcraft-font-size-body-small);
  line-height: var(--sheetcraft-line-height-body-small);

  &__endpoint {
    display: grid;
    min-width: 0;
    gap: var(--sheetcraft-space-2);
  }

  &__heading {
    margin: 0;
    font-size: inherit;
    line-height: inherit;
    font-weight: 500;
  }

  &__type {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sheetcraft-space-2);
  }

  &__axes {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: stretch;
    gap: var(--sheetcraft-space-1) var(--sheetcraft-space-2);
  }

  &__axis-title,
  &__hint,
  &__feedback {
    color: var(--sheetcraft-text-secondary);
  }

  &__length-axis {
    display: grid;
    gap: var(--sheetcraft-space-1);
  }

  &__columns,
  &__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__columns {
    text-align: center;
  }

  &__width-axis {
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice;

    display: grid;
    min-width: 0;
    height: 32px;
    place-items: center;

    svg {
      display: block;
      width: 100%;
      max-width: 66px;
      height: 27px;
    }
  }

  &__hint,
  &__feedback {
    margin: 0;
  }
}
</style>
