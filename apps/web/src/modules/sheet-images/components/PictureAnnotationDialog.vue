<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { normalizeImageTransform, type ImageAnnotation } from "@sheetcraft/core/workbook";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { useAppI18n } from "../../../shared/i18n";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { paintImagePresentation } from "../../../shared/images/imageAppearance";
import { PicturePaintUnavailableError } from "../../../shared/images/picture-detailed-render";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import {
  startPointerSession,
  type PointerSession,
} from "../../../shared/sheet-input/pointer-session";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { assertImagePixelBudget, MAX_IMAGE_PIXELS } from "../../image-assets/imageAssetValidation";
import {
  createPictureSourcePresentationCanvas,
  planPictureSourcePresentation,
  type PictureSourcePresentation,
} from "../picture-source-presentation";
import type { PictureAssetSource } from "../picture-source-selection";
import {
  pictureAnnotationPoint,
  pictureSourceAnnotationPoint,
} from "../picture-annotation-geometry";

const props = defineProps<{
  image: PictureAssetSource;
  source: string;
  frameSource?: PictureSourcePresentation;
  theme?: WorkbookTheme;
  assetUrls?: ReadonlyMap<string, string>;
  busy?: boolean;
  error?: string;
  confirmHandler?: (image: PictureAssetSource) => boolean;
}>();
const emit = defineEmits<{ confirm: [image: PictureAssetSource]; close: [] }>();
const { t } = useAppI18n();
const canvas = ref<HTMLCanvasElement>();
const previewCanvas = ref<HTMLCanvasElement>();
const framed = computed(() => isGroupedPicture(props.image) || isFramedPictureObject(props.image));
function currentSourceIdentity(): string {
  const image = props.image;
  return JSON.stringify([
    image.id,
    image.assetId,
    isGroupedPicture(image)
      ? image.kind
      : isFramedPictureObject(image)
        ? "object-frame-v1"
        : "legacy",
  ]);
}
const annotationSourceIdentity = currentSourceIdentity();
const sourceInvalid = ref(false);
const tool = ref<ImageAnnotation["kind"]>("pen");
const color = ref("#E53935");
function selectColor(value: string | null): void {
  if (
    props.busy ||
    confirming.value ||
    sourceInvalid.value ||
    !value ||
    !/^#[0-9a-f]{6}$/i.test(value)
  )
    return;
  color.value = value.toUpperCase();
}
const stroke = ref(3);
const text = ref("");
const fontSize = ref(24);
const ready = ref(false);
const failed = ref(false);
const previewReady = ref(false);
const previewFailed = ref(false);
const confirming = ref(false);
const annotations = ref<ImageAnnotation[]>(
  normalizeImageTransform(props.image.transform)?.annotations ?? [],
);
const undoStack: ImageAnnotation[][] = [];
const canUndo = ref(false);
const canApply = computed(
  () =>
    ready.value &&
    !sourceInvalid.value &&
    (!framed.value || previewReady.value) &&
    !props.busy &&
    !confirming.value,
);
let decoded: HTMLImageElement | undefined;
let session: PointerSession | undefined;
let pending: ImageAnnotation | undefined;
let disposed = false;
let sourceGeneration = 0;
let paintingPreview = false;
let previewFrame: number | undefined;
const auxiliaryImages = createCanvasImageCache(() => {
  if (!disposed && ready.value) schedulePreview(true);
});

function draftAnnotations(): ImageAnnotation[] {
  return [...annotations.value, ...(pending ? [pending] : [])];
}
/** The source identity, frame and appearance stay exactly as received. */
function withAnnotations<T extends PictureAssetSource>(image: T, values: ImageAnnotation[]): T {
  const normalized = normalizeImageTransform({ annotations: values })?.annotations;
  const transform: NonNullable<PictureAssetSource["transform"]> = { ...image.transform };
  delete transform.annotations;
  if (normalized) transform.annotations = normalized;
  return { ...image, transform: Object.keys(transform).length ? transform : undefined };
}
function releaseCanvas(target: HTMLCanvasElement | undefined): void {
  if (target) {
    target.width = 0;
    target.height = 0;
  }
}
function cancelPreviewUpdate(): void {
  if (previewFrame === undefined) return;
  cancelAnimationFrame(previewFrame);
  previewFrame = undefined;
}
function schedulePreview(immediate = false): void {
  if (disposed || !ready.value || !framed.value) return;
  if (immediate) {
    cancelPreviewUpdate();
    paintPreview();
  } else if (previewFrame === undefined) {
    previewFrame = requestAnimationFrame(() => {
      previewFrame = undefined;
      if (!disposed && ready.value) paintPreview();
    });
  }
}
function paintPreview(): void {
  if (disposed || !framed.value || !decoded || !previewCanvas.value || paintingPreview) return;
  const target = previewCanvas.value;
  previewReady.value = false;
  previewFailed.value = false;
  paintingPreview = true;
  let temporary: HTMLCanvasElement | undefined;
  try {
    const source = props.frameSource;
    if (
      !source ||
      source.picture.id !== props.image.id ||
      source.picture.assetId !== props.image.assetId ||
      isGroupedPicture(source.picture) !== isGroupedPicture(props.image)
    )
      throw new Error("Picture source presentation is unavailable.");
    const picture = withAnnotations(source.picture, draftAnnotations());
    const presentation = { ...source, picture };
    const cache = {
      get: (url: string) => (url === props.source ? decoded : auxiliaryImages.get(url)),
      peek: (url: string) => (url === props.source ? decoded : auxiliaryImages.peek?.(url)),
    };
    const resources = createPicturePaintResources(props.theme, props.assetUrls, cache);
    // Validate geometry and raster limits before starting any auxiliary decoder.
    planPictureSourcePresentation(presentation, props.theme, resources, 1000);
    const retained = new Set<string>();
    let pixels = decoded.naturalWidth * decoded.naturalHeight;
    for (const id of getDetailedPictureStyleAssetIds(
      picture.transform?.appearance?.detailedStyle,
    )) {
      const url = props.assetUrls?.get(id);
      if (!url || url === props.source || retained.has(url)) continue;
      retained.add(url);
      const image = auxiliaryImages.get(url);
      if (image) {
        assertImagePixelBudget(image.naturalWidth, image.naturalHeight);
        pixels += image.naturalWidth * image.naturalHeight;
      }
    }
    auxiliaryImages.retain(retained);
    if (pixels > MAX_IMAGE_PIXELS) throw new RangeError("Picture sources exceed the pixel budget.");
    temporary = createPictureSourcePresentationCanvas(
      decoded,
      presentation,
      props.theme,
      resources,
      1000,
    );
    const context = target.getContext("2d");
    if (!context) throw new Error("Picture preview is unavailable.");
    target.width = temporary.width;
    target.height = temporary.height;
    context.clearRect(0, 0, target.width, target.height);
    context.drawImage(temporary, 0, 0);
    previewReady.value = true;
  } catch (error) {
    // Never display the bare source as though it were the current framed appearance.
    releaseCanvas(target);
    const loading =
      error instanceof PicturePaintUnavailableError &&
      error.missingAssetIds.every((id) => {
        const url = props.assetUrls?.get(id);
        return !!url && auxiliaryImages.state?.(url) === "loading";
      });
    previewFailed.value = !loading;
  } finally {
    releaseCanvas(temporary);
    paintingPreview = false;
  }
}
function paint(immediatePreview = true): void {
  const target = canvas.value;
  const context = target?.getContext("2d");
  if (disposed || !target || !context || !decoded) return;
  try {
    context.clearRect(0, 0, target.width, target.height);
    paintImagePresentation(
      context,
      decoded,
      { x: 0, y: 0, width: target.width, height: target.height },
      framed.value
        ? { annotations: draftAnnotations() }
        : { ...props.image.transform, annotations: draftAnnotations() },
    );
    schedulePreview(immediatePreview);
  } catch {
    failed.value = true;
    ready.value = false;
    releaseCanvas(target);
    releaseCanvas(previewCanvas.value);
  }
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
  if (props.busy || confirming.value) return;
  session?.cancel();
  const previous = undoStack.pop();
  if (previous) annotations.value = previous;
  canUndo.value = undoStack.length > 0;
  paint();
}
function clear(): void {
  if (props.busy || confirming.value || !annotations.value.length) return;
  session?.cancel();
  saveUndo();
  annotations.value = [];
  paint();
}
function point(event: MouseEvent) {
  const target = canvas.value;
  if (!target || !decoded) return null;
  const rect = target.getBoundingClientRect();
  if (
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  const value = {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
  return framed.value
    ? pictureSourceAnnotationPoint(value)
    : pictureAnnotationPoint(
        value,
        props.image.transform,
        decoded.naturalWidth,
        decoded.naturalHeight,
      );
}
function begin(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    !ready.value ||
    props.busy ||
    confirming.value ||
    annotations.value.length >= 100
  )
    return;
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
    paint(false);
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
  if (currentSourceIdentity() !== annotationSourceIdentity) {
    invalidateSource();
    return;
  }
  if (!canApply.value) return;
  session?.cancel();
  if (!canApply.value) return;
  const payload = withAnnotations(props.image, annotations.value);
  confirming.value = true;
  if (props.confirmHandler) {
    try {
      if (props.confirmHandler(payload) !== true) confirming.value = false;
    } catch {
      confirming.value = false;
    }
    return;
  }
  emit("confirm", payload);
  // Legacy emit consumers report command failure through the existing error prop.
  void nextTick(() => {
    if (!disposed && props.error && !props.busy) confirming.value = false;
  });
}
function close(): void {
  session?.cancel();
  emit("close");
}
function invalidateSource(): void {
  if (sourceInvalid.value) return;
  sourceInvalid.value = true;
  sourceGeneration += 1;
  ready.value = false;
  failed.value = true;
  previewReady.value = false;
  session?.cancel();
  cancelPreviewUpdate();
  auxiliaryImages.dispose();
  releaseCanvas(canvas.value);
  releaseCanvas(previewCanvas.value);
  if (decoded) {
    decoded.onload = null;
    decoded.onerror = null;
    decoded.src = "";
    decoded = undefined;
  }
}
async function loadSource(): Promise<void> {
  if (sourceInvalid.value || currentSourceIdentity() !== annotationSourceIdentity) {
    invalidateSource();
    return;
  }
  const generation = ++sourceGeneration;
  session?.cancel();
  cancelPreviewUpdate();
  ready.value = false;
  failed.value = false;
  previewReady.value = false;
  previewFailed.value = false;
  auxiliaryImages.dispose();
  if (decoded) {
    decoded.onload = null;
    decoded.onerror = null;
    decoded.src = "";
    decoded = undefined;
  }
  releaseCanvas(canvas.value);
  releaseCanvas(previewCanvas.value);
  if (!props.source || typeof props.image.assetId !== "string") {
    failed.value = true;
    return;
  }
  const image = new Image();
  decoded = image;
  image.onload = async () => {
    if (disposed || generation !== sourceGeneration) return;
    try {
      assertImagePixelBudget(image.naturalWidth, image.naturalHeight);
      ready.value = true;
      await nextTick();
      if (disposed || generation !== sourceGeneration) return;
      const owner = props.image;
      const dimensions =
        isGroupedPicture(owner) || isFramedPictureObject(owner)
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : { width: owner.width, height: owner.height };
      const scale = Math.min(1, 1000 / dimensions.width, 650 / dimensions.height);
      if (canvas.value) {
        canvas.value.width = Math.max(1, Math.round(dimensions.width * scale));
        canvas.value.height = Math.max(1, Math.round(dimensions.height * scale));
      }
      paint();
    } catch {
      if (disposed || generation !== sourceGeneration) return;
      ready.value = false;
      failed.value = true;
      releaseCanvas(canvas.value);
      releaseCanvas(previewCanvas.value);
    }
  };
  image.onerror = () => {
    if (disposed || generation !== sourceGeneration) return;
    ready.value = false;
    failed.value = true;
  };
  image.src = props.source;
}
watch(currentSourceIdentity, (identity) => {
  if (identity !== annotationSourceIdentity) invalidateSource();
});
watch(
  () => props.source,
  () => {
    void loadSource();
  },
);
watch(
  () => [props.frameSource, props.theme, props.assetUrls] as const,
  () => {
    if (ready.value) schedulePreview(true);
  },
);
watch(
  () => props.error,
  (error) => {
    if (error && !props.busy && !props.confirmHandler) confirming.value = false;
  },
);
watch(
  () => props.busy,
  (busy, previous) => {
    if (busy) session?.cancel();
    else if (previous) confirming.value = false;
  },
);
onMounted(() => {
  void loadSource();
});
onBeforeUnmount(() => {
  disposed = true;
  sourceGeneration += 1;
  cancelPreviewUpdate();
  session?.cancel();
  auxiliaryImages.dispose();
  releaseCanvas(canvas.value);
  releaseCanvas(previewCanvas.value);
  if (decoded) {
    decoded.onload = null;
    decoded.onerror = null;
    decoded.src = "";
    decoded = undefined;
  }
});
</script>
<template>
  <Dialog
    :visible="true"
    :header="t('picture.annotate')"
    width="900px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.apply'), disabled: !canApply, loading: busy }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="close"
  >
    <div class="picture-annotation">
      <RadioGroup v-model="tool" variant="default-filled" :disabled="busy || confirming">
        <Radio value="pen">{{ t("picture.pen") }}</Radio
        ><Radio value="arrow">{{ t("picture.arrow") }}</Radio>
        <Radio value="rectangle">{{ t("picture.rectangle") }}</Radio
        ><Radio value="ellipse">{{ t("picture.ellipse") }}</Radio>
        <Radio value="text">{{ t("picture.text") }}</Radio>
      </RadioGroup>
      <div class="picture-annotation__options">
        <div
          class="picture-annotation__field picture-annotation__field--color"
          role="group"
          :aria-label="t('picture.annotationColor')"
        >
          <span>{{ t("picture.annotationColor") }}</span>
          <ColorPaletteSelect
            :model-value="color"
            :label="t('picture.annotationColor')"
            :show-default="false"
            :disabled="busy || confirming || sourceInvalid"
            @select="selectColor"
          />
        </div>
        <div class="picture-annotation__field" role="group" :aria-label="t('picture.strokeWidth')">
          <span>{{ t("picture.strokeWidth") }}</span>
          <InputNumber
            v-model="stroke"
            :min="1"
            :max="20"
            size="small"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            :disabled="busy || confirming"
            :aria-label="t('picture.strokeWidth')"
          />
        </div>
        <template v-if="tool === 'text'">
          <Input
            v-model="text"
            :maxlength="1000"
            :disabled="busy || confirming"
            :placeholder="t('picture.text')"
            :aria-label="t('picture.text')"
          />
          <div class="picture-annotation__field" role="group" :aria-label="t('picture.fontSize')">
            <span>{{ t("picture.fontSize") }}</span>
            <InputNumber
              v-model="fontSize"
              :min="8"
              :max="96"
              size="small"
              theme="column"
              class="sheetcraft-input-number--persistent-controls"
              :disabled="busy || confirming"
              :aria-label="t('picture.fontSize')"
            />
          </div>
        </template>
        <Button size="small" :disabled="!canUndo || busy || confirming" @click="undo">{{
          t("picture.undoAnnotation")
        }}</Button>
        <Button size="small" :disabled="!annotations.length || busy || confirming" @click="clear">{{
          t("picture.clearAnnotations")
        }}</Button>
      </div>
      <p v-if="failed" role="alert">{{ t("picture.assetFailed") }}</p>
      <div
        v-else
        class="picture-annotation__views"
        :class="{ 'picture-annotation__views--framed': framed }"
      >
        <section class="picture-annotation__view">
          <p v-if="framed" class="picture-annotation__label">
            {{ t("picture.annotationSourceEditor") }}
          </p>
          <div class="picture-annotation__surface">
            <canvas
              ref="canvas"
              :aria-label="framed ? t('picture.annotationSourceEditor') : t('picture.annotate')"
              @pointerdown="begin"
            />
          </div>
        </section>
        <section v-if="framed" class="picture-annotation__view picture-annotation__view--preview">
          <p class="picture-annotation__label">{{ t("picture.annotationCurrentAppearance") }}</p>
          <div
            class="picture-annotation__surface picture-annotation__surface--preview"
            :aria-busy="!previewReady && !previewFailed"
          >
            <canvas
              ref="previewCanvas"
              v-show="previewReady"
              :aria-label="t('picture.annotationCurrentAppearance')"
            />
            <p v-if="previewFailed" role="alert">{{ t("image.assetUnavailable") }}</p>
            <p v-else-if="!previewReady" role="status">{{ t("image.loading") }}</p>
          </div>
        </section>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p>{{ t(framed ? "picture.annotationSourceHint" : "picture.annotationHint") }}</p>
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
    .picture-annotation__field {
      display: flex;
      align-items: center;
      gap: 6px;
      > span {
        flex: none;
        white-space: nowrap;
      }
      &--color {
        display: grid;
        grid-template-columns: max-content 48px;
        flex: none;
      }
    }
  }
  &__views,
  &__view {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  &__views--framed {
    grid-template-columns: minmax(0, 1fr) minmax(200px, 0.7fr);
  }
  &__label {
    font-weight: 500;
    color: var(--sheetcraft-text-primary);
  }
  &__surface {
    display: flex;
    justify-content: center;
    overflow: auto;
    align-items: center;
    max-height: 60vh;
    min-height: 120px;
    background: var(--sheetcraft-bg-secondary);
    canvas {
      max-width: 100%;
      height: auto;
      object-fit: contain;
      touch-action: none;
      cursor: crosshair;
    }
  }
  &__surface--preview {
    canvas {
      cursor: default;
      touch-action: auto;
    }
    p {
      padding: 12px;
    }
  }
  @media (max-width: 700px) {
    &__views--framed {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
}
</style>
