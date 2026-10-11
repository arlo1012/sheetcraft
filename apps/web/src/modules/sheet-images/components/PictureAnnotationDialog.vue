<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import {
  normalizeImageTransform,
  type FloatingImage,
  type ImageAnnotation,
} from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { pictureAnnotationPoint } from "../picture-annotation-geometry";
const props = defineProps<{ image: FloatingImage; source: string; error?: string }>();
const emit = defineEmits<{ confirm: [image: FloatingImage]; close: [] }>();
const { t } = useAppI18n();
const canvas = ref<HTMLCanvasElement>();
const tool = ref<ImageAnnotation["kind"]>("pen");
const color = ref("#E53935");
const stroke = ref(3);
const text = ref("");
const fontSize = ref(24);
const ready = ref(false);
const failed = ref(false);
const annotations = ref<ImageAnnotation[]>(
  normalizeImageTransform(props.image.transform)?.annotations ?? [],
);
const undoStack: ImageAnnotation[][] = [];
const canUndo = ref(false);
let decoded: HTMLImageElement | undefined;
let session: PointerSession | undefined;
let pending: ImageAnnotation | undefined;
let disposed = false;
function paint(): void {
  const target = canvas.value;
  const context = target?.getContext("2d");
  if (!target || !context || !decoded) return;
  context.clearRect(0, 0, target.width, target.height);
  paintImagePresentation(
    context,
    decoded,
    { x: 0, y: 0, width: target.width, height: target.height },
    {
      ...props.image.transform,
      annotations: [...annotations.value, ...(pending ? [pending] : [])],
    },
  );
}
function saveUndo(): void {
  undoStack.push(
    structuredClone(
      annotations.value.map((entry) => ({ ...entry, points: entry.points.map((p) => ({ ...p })) })),
    ),
  );
  canUndo.value = true;
}
function undo(): void {
  session?.cancel();
  const previous = undoStack.pop();
  if (previous) annotations.value = previous;
  canUndo.value = undoStack.length > 0;
  paint();
}
function clear(): void {
  session?.cancel();
  saveUndo();
  annotations.value = [];
  paint();
}
function point(event: MouseEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  return pictureAnnotationPoint(
    { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
    props.image.transform,
    decoded!.naturalWidth,
    decoded!.naturalHeight,
  );
}
function begin(event: PointerEvent): void {
  if (event.button !== 0 || !ready.value || annotations.value.length >= 100) return;
  session?.cancel();
  const start = point(event);
  if (!start || (tool.value === "text" && !text.value.trim())) return;
  event.preventDefault();
  pending = {
    kind: tool.value,
    points: tool.value === "text" || tool.value === "pen" ? [start] : [start, { ...start }],
    color: color.value,
    width: stroke.value / 600,
    ...(tool.value === "text" ? { text: text.value, fontSize: fontSize.value / 600 } : {}),
  };
  const finish = () => {
    if (pending) {
      saveUndo();
      annotations.value.push(pending);
      pending = undefined;
    }
    session = undefined;
    paint();
  };
  if (tool.value === "text") {
    finish();
    return;
  }
  const move = (event: MouseEvent) => {
    const next = point(event);
    if (!pending || !next) return;
    if (pending.kind === "pen") {
      if (pending.points.length < 1024) pending.points.push(next);
    } else pending.points[1] = next;
    paint();
  };
  session = startPointerSession({
    event,
    captureTarget: canvas.value,
    onMove: move,
    onEnd: (event) => {
      move(event);
      finish();
    },
    onCancel: () => {
      pending = undefined;
      session = undefined;
      paint();
    },
  });
  paint();
}
function confirm(): void {
  session?.cancel();
  emit("confirm", {
    ...props.image,
    transform: normalizeImageTransform({
      ...props.image.transform,
      annotations: annotations.value,
    }),
  });
}
onMounted(async () => {
  decoded = new Image();
  decoded.onload = async () => {
    if (disposed) return;
    ready.value = true;
    await nextTick();
    const scale = Math.min(1, 1000 / props.image.width, 650 / props.image.height);
    if (canvas.value) {
      canvas.value.width = Math.max(1, Math.round(props.image.width * scale));
      canvas.value.height = Math.max(1, Math.round(props.image.height * scale));
    }
    paint();
  };
  decoded.onerror = () => {
    if (!disposed) failed.value = true;
  };
  decoded.src = props.source;
});
onBeforeUnmount(() => {
  disposed = true;
  session?.cancel();
  if (decoded) {
    decoded.onload = null;
    decoded.onerror = null;
  }
});
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.annotate')"
    width="900px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.apply'), disabled: !ready }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="picture-annotation">
      <RadioGroup v-model="tool" variant="default-filled">
        <Radio value="pen">{{ t("picture.pen") }}</Radio
        ><Radio value="arrow">{{ t("picture.arrow") }}</Radio>
        <Radio value="rectangle">{{ t("picture.rectangle") }}</Radio
        ><Radio value="ellipse">{{ t("picture.ellipse") }}</Radio>
        <Radio value="text">{{ t("picture.text") }}</Radio>
      </RadioGroup>
      <div class="picture-annotation__options">
        <label>{{ t("picture.annotationColor") }}<input v-model="color" type="color" /></label>
        <label
          >{{ t("picture.strokeWidth")
          }}<InputNumber v-model="stroke" :min="1" :max="20" size="small"
        /></label>
        <template v-if="tool === 'text'">
          <Input
            v-model="text"
            :maxlength="1000"
            :placeholder="t('picture.text')"
            :aria-label="t('picture.text')"
          />
          <InputNumber
            v-model="fontSize"
            :min="8"
            :max="96"
            size="small"
            :aria-label="t('picture.fontSize')"
          />
        </template>
        <Button size="small" :disabled="!canUndo" @click="undo">{{
          t("picture.undoAnnotation")
        }}</Button>
        <Button size="small" :disabled="!annotations.length" @click="clear">{{
          t("picture.clearAnnotations")
        }}</Button>
      </div>
      <p v-if="failed" role="alert">{{ t("picture.assetFailed") }}</p>
      <div v-else class="picture-annotation__surface">
        <canvas ref="canvas" :aria-label="t('picture.annotate')" @pointerdown="begin" />
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p>{{ t("picture.annotationHint") }}</p>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.picture-annotation {
  display: grid;
  gap: 12px;
  &__options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    label {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    input[type="color"] {
      width: 32px;
      height: 28px;
      padding: 0;
      border: 0;
    }
  }
  &__surface {
    display: flex;
    justify-content: center;
    overflow: auto;
    max-height: 60vh;
    background: var(--sheetcraft-bg-secondary);
    canvas {
      max-width: 100%;
      height: auto;
      object-fit: contain;
      touch-action: none;
      cursor: crosshair;
    }
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
