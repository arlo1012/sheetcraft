<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Select } from "tdesign-vue-next/es/select";
import { Button } from "tdesign-vue-next/es/button";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import {
  startPointerSession,
  type GestureEvent,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import {
  captureRegionBetween,
  captureShapePath,
  captureShapes,
  type CaptureShape,
  setCaptureRegionField,
  type CapturePoint,
  type CaptureRegion,
} from "../capture-region";

const props = defineProps<{ file: File; busy: boolean; shape?: CaptureShape }>();
const emit = defineEmits<{ confirm: [file: File]; close: [] }>();
const { t, locale } = useAppI18n();
const source = URL.createObjectURL(props.file);
const image = ref<HTMLImageElement>();
const size = ref({ width: 0, height: 0 });
const region = ref<CaptureRegion>({ x: 0, y: 0, width: 0, height: 0 });
const start = ref<CapturePoint>();
let session: PointerSession | undefined;
let beforeDrag = region.value;
const shape = ref<CaptureShape>(props.shape ?? "rectangle");
const vertices = ref<CapturePoint[]>([]);
let beforeVertices: CapturePoint[] = [];
let stroke: CapturePoint[] = [];
const clipPath = computed(() => captureShapePath(shape.value, region.value, vertices.value));
function validPolygon() {
  const [a, b] = vertices.value;
  if (!a || !b) return false;
  return vertices.value
    .slice(2)
    .some(
      (p) =>
        Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) *
          region.value.width *
          region.value.height >=
        1,
    );
}
let disposed = false;
const encoding = ref(false);
const failed = ref(false);
const loadFailed = ref(false);
const busy = computed(() => props.busy || encoding.value);
const valid = computed(
  () =>
    region.value.width > 0 &&
    region.value.height > 0 &&
    !loadFailed.value &&
    (shape.value !== "freehand" || validPolygon()),
);
const regionStyle = computed(() => ({
  left: `${(100 * region.value.x) / size.value.width}%`,
  top: `${(100 * region.value.y) / size.value.height}%`,
  width: `${(100 * region.value.width) / size.value.width}%`,
  height: `${(100 * region.value.height) / size.value.height}%`,
}));
function selectAll(): void {
  if (shape.value === "freehand")
    vertices.value = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
  region.value = { x: 0, y: 0, ...size.value };
}
function loaded(): void {
  if (!image.value) return;
  loadFailed.value = false;
  failed.value = false;
  size.value = { width: image.value.naturalWidth, height: image.value.naturalHeight };
  region.value = { x: 0, y: 0, ...size.value };
}
function point(event: GestureEvent): CapturePoint {
  const rect = image.value!.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * size.value.width) / rect.width,
    y: ((event.clientY - rect.top) * size.value.height) / rect.height,
  };
}
function begin(event: PointerEvent): void {
  if (event.button !== 0 || busy.value || !image.value || !size.value.width) return;
  event.preventDefault();
  session?.cancel();
  beforeDrag = { ...region.value };
  beforeVertices = vertices.value;
  start.value = point(event);
  stroke = [];
  if (shape.value === "freehand") addVertex(start.value);
  session = startPointerSession({
    event,
    captureTarget: event.currentTarget as HTMLElement,
    onMove: move,
    onEnd: end,
    onCancel: cancelDrag,
  });
}
function addVertex(point: CapturePoint) {
  const x = Math.max(0, Math.min(size.value.width, Math.round(point.x))),
    y = Math.max(0, Math.min(size.value.height, Math.round(point.y)));
  const last = stroke.at(-1);
  if (last?.x === x && last.y === y) return;
  const previous = region.value;
  const left = stroke.length ? Math.min(previous.x, x) : x,
    top = stroke.length ? Math.min(previous.y, y) : y;
  const right = stroke.length ? Math.max(previous.x + previous.width, x) : x,
    bottom = stroke.length ? Math.max(previous.y + previous.height, y) : y;
  stroke.push({ x, y });
  region.value = { x: left, y: top, width: right - left, height: bottom - top };
  vertices.value = stroke.map((p) => ({
    x: (p.x - left) / (right - left || 1),
    y: (p.y - top) / (bottom - top || 1),
  }));
}
function move(event: GestureEvent): void {
  if (!start.value) return;
  if (shape.value === "freehand") addVertex(point(event));
  else region.value = captureRegionBetween(start.value, point(event), size.value);
}
function end(event: GestureEvent): void {
  if (!start.value) return;
  move(event);
  if (
    region.value.width < 2 ||
    region.value.height < 2 ||
    (shape.value === "freehand" && !validPolygon())
  ) {
    region.value = beforeDrag;
    vertices.value = beforeVertices;
  }
  stroke = [];
  start.value = undefined;
  session = undefined;
}
function cancelDrag(): void {
  if (start.value) {
    region.value = beforeDrag;
    vertices.value = beforeVertices;
  }
  stroke = [];
  start.value = undefined;
  session = undefined;
}
function setField(field: keyof CaptureRegion, value: InputNumberValue | undefined): void {
  if (typeof value === "number" && Number.isFinite(value))
    region.value = setCaptureRegionField(region.value, field, value, size.value);
}
async function confirm(): Promise<void> {
  if (!valid.value || busy.value || !image.value) return;
  failed.value = false;
  const crop = { ...region.value };
  if (
    shape.value === "rectangle" &&
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === size.value.width &&
    crop.height === size.value.height
  ) {
    emit("confirm", props.file);
    return;
  }
  encoding.value = true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    if (shape.value !== "rectangle")
      context.clip(
        new Path2D(captureShapePath(shape.value, { ...crop, x: 0, y: 0 }, vertices.value)),
        "evenodd",
      );
    context.drawImage(
      image.value,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Capture encoding failed.");
    if (!disposed) emit("confirm", new File([blob], "screenshot.png", { type: "image/png" }));
  } catch {
    failed.value = true;
  } finally {
    encoding.value = false;
  }
}
onBeforeUnmount(() => {
  disposed = true;
  session?.cancel();
  URL.revokeObjectURL(source);
});
</script>

<template>
  <Dialog
    :visible="true"
    :header="t('drawing.captureRegion')"
    :aria-label="t('drawing.captureRegion')"
    role="dialog"
    aria-modal="true"
    placement="center"
    width="min(1000px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('drawing.insert'), disabled: !valid || busy, loading: busy }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="screen-capture">
      <p>{{ t("drawing.captureRegionHint") }}</p>
      <div class="screen-capture__viewport">
        <div class="screen-capture__stage" @pointerdown="begin">
          <img
            ref="image"
            :src="source"
            :alt="t('drawing.preview')"
            draggable="false"
            @load="loaded"
            @error="loadFailed = failed = true"
          />
          <div
            v-if="size.width && shape === 'rectangle'"
            class="screen-capture__region"
            :style="regionStyle"
          />
          <svg
            v-else-if="size.width"
            class="screen-capture__outline"
            :viewBox="`0 0 ${size.width} ${size.height}`"
            aria-hidden="true"
          >
            <path
              :d="`M0 0 H${size.width} V${size.height} H0 Z ${clipPath}`"
              fill="rgb(0 0 0 / 45%)"
              fill-rule="evenodd"
            />
            <path
              :d="clipPath"
              fill="none"
              stroke="var(--sheetcraft-action-primary)"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
      <Form
        v-if="size.width"
        class="screen-capture__controls sheetcraft-form-grid"
        label-align="right"
        :label-width="locale === 'zh-CN' ? 112 : 120"
        :prevent-submit-default="true"
      >
        <FormItem :label="t('drawing.captureShape')"
          ><Select
            v-model="shape"
            :aria-label="t('drawing.captureShape')"
            :disabled="busy"
            :options="
              captureShapes.map((value) => ({ value, label: t(`drawing.capture.${value}`) }))
            "
        /></FormItem>
        <FormItem :label="t('drawing.captureLeft')"
          ><InputNumber
            :model-value="region.x"
            v-native-control="{ attributes: { 'aria-label': t('drawing.captureLeft') } }"
            :min="0"
            :max="size.width - 1"
            :decimal-places="0"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            @update:model-value="setField('x', $event)"
          />
        </FormItem>
        <FormItem :label="t('drawing.captureTop')"
          ><InputNumber
            :model-value="region.y"
            v-native-control="{ attributes: { 'aria-label': t('drawing.captureTop') } }"
            :min="0"
            :max="size.height - 1"
            :decimal-places="0"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            @update:model-value="setField('y', $event)"
          />
        </FormItem>
        <FormItem :label="t('drawing.width')"
          ><InputNumber
            :model-value="region.width"
            v-native-control="{ attributes: { 'aria-label': t('drawing.width') } }"
            :min="1"
            :max="size.width - region.x"
            :decimal-places="0"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            @update:model-value="setField('width', $event)"
          />
        </FormItem>
        <FormItem :label="t('drawing.height')"
          ><InputNumber
            :model-value="region.height"
            v-native-control="{ attributes: { 'aria-label': t('drawing.height') } }"
            :min="1"
            :max="size.height - region.y"
            :decimal-places="0"
            :disabled="busy"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            @update:model-value="setField('height', $event)"
          />
        </FormItem>
        <Button theme="default" variant="base" :disabled="busy" @click="selectAll">{{
          t("drawing.captureAll")
        }}</Button>
      </Form>
      <p v-if="failed" role="alert">{{ t("drawing.captureFailed") }}</p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.screen-capture {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  [role="alert"] {
    color: var(--sheetcraft-status-error);
  }
  &__viewport {
    display: flex;
    justify-content: center;
    min-height: 80px;
    overflow: hidden;
    background: var(--sheetcraft-surface-secondary);
  }
  &__stage {
    position: relative;
    max-width: 100%;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  img {
    display: block;
    max-width: 100%;
    max-height: max(100px, calc(100vh - 320px));
    object-fit: contain;
  }
  &__region {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--sheetcraft-action-primary);
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
    pointer-events: none;
  }
  &__outline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  &__controls {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
  }
  @media (max-width: 460px) {
    &__controls {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
