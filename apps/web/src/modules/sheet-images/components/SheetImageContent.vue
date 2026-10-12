<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useId, watch, watchEffect } from "vue";
import { isFramedCellImage, type CellImage } from "@sheetcraft/core/cell-picture-frame";
import type { PicturePaintResources } from "../../../shared/images/picture-detailed-render";
import { useAppI18n } from "../../../shared/i18n";
import type { ImageTransform } from "@sheetcraft/core/workbook";
import { createPictureCanvas } from "../../../shared/images/imageAppearance";
import { getSheetImagePresentation } from "./sheetImagePresentation";
import { captureCellPictureSourcePresentation } from "../cell-picture-presentation";
import { createPictureSourcePresentationCanvas } from "../picture-source-presentation";

const props = withDefaults(
  defineProps<{
    src: string;
    altText: string;
    transform?: ImageTransform;
    /** Controlled cell value. A framed cell is rendered locally, never baked into its asset. */
    cellImage?: CellImage;
    paintResources?: PicturePaintResources;
    fit?: "contain" | "fill";
  }>(),
  { fit: "contain" },
);
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ load: [size: { width: number; height: number }] }>();

const clipPathId = `sheet-image-content-clip-${useId()}`;
const processedSource = ref<string>();
const unavailable = ref(false);
const { t } = useAppI18n();
const sourceImage = shallowRef<HTMLImageElement>();
const sourceFailed = ref(false);
const probeElement = shallowRef<HTMLImageElement>();
const sourceGeneration = ref(0);
const naturalWidth = ref(1);
const naturalHeight = ref(1);
const processedSize = shallowRef<{ width: number; height: number }>();
const framedCell = computed(() => !!props.cellImage && isFramedCellImage(props.cellImage));
const effectiveTransform = computed(() =>
  props.cellImage ? props.cellImage.transform : props.transform,
);
let processedCanvas: HTMLCanvasElement | undefined;
function releaseProcessedCanvas(): void {
  if (!processedCanvas) return;
  processedCanvas.width = 0;
  processedCanvas.height = 0;
  processedCanvas = undefined;
}
watch(
  () => props.src,
  () => {
    sourceGeneration.value++;
    sourceImage.value = undefined;
    sourceFailed.value = false;
    naturalWidth.value = naturalHeight.value = 1;
    processedSource.value = undefined;
    processedSize.value = undefined;
    unavailable.value = false;
    releaseProcessedCanvas();
  },
  { immediate: true, flush: "sync" },
);
onBeforeUnmount(releaseProcessedCanvas);
watchEffect(() => {
  releaseProcessedCanvas();
  processedSource.value = undefined;
  processedSize.value = undefined;
  unavailable.value = sourceFailed.value;
  const image = sourceImage.value;
  if (!image) return;
  try {
    if (props.cellImage && isFramedCellImage(props.cellImage)) {
      processedCanvas = createPictureSourcePresentationCanvas(
        image,
        captureCellPictureSourcePresentation(props.cellImage),
        props.paintResources?.theme,
        props.paintResources,
      );
    } else if (effectiveTransform.value?.appearance) {
      processedCanvas = createPictureCanvas(
        image,
        effectiveTransform.value,
        4096,
        props.paintResources,
      );
    }
    if (processedCanvas) {
      processedSource.value = processedCanvas.toDataURL("image/png");
      processedSize.value = { width: processedCanvas.width, height: processedCanvas.height };
    }
  } catch {
    releaseProcessedCanvas();
    unavailable.value = true;
  }
});

const presentation = computed(() => {
  if (framedCell.value) {
    const size = processedSize.value ?? { width: 100, height: 100 };
    return getSheetImagePresentation(undefined, size.width, size.height);
  }
  return getSheetImagePresentation(
    effectiveTransform.value,
    naturalWidth.value,
    naturalHeight.value,
  );
});

function onSourceLoad(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (
    image !== probeElement.value ||
    image.dataset.sourceGeneration !== String(sourceGeneration.value)
  )
    return;
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  sourceFailed.value = false;
  sourceImage.value = image;
  naturalWidth.value = image.naturalWidth;
  naturalHeight.value = image.naturalHeight;
  emit("load", { width: image.naturalWidth, height: image.naturalHeight });
}
function onSourceError(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (
    image !== probeElement.value ||
    image.dataset.sourceGeneration !== String(sourceGeneration.value)
  )
    return;
  sourceImage.value = undefined;
  sourceFailed.value = true;
  processedSource.value = undefined;
  releaseProcessedCanvas();
  unavailable.value = true;
}
</script>

<template>
  <svg
    v-bind="$attrs"
    class="sheet-image-content"
    :class="`is-${fit}`"
    :viewBox="presentation.viewBox"
    :preserveAspectRatio="fit === 'contain' ? 'xMidYMid meet' : 'none'"
    role="img"
    :aria-label="altText"
  >
    <defs>
      <clipPath :id="clipPathId" clipPathUnits="userSpaceOnUse">
        <rect :width="presentation.cropWidth" :height="presentation.cropHeight" />
      </clipPath>
    </defs>
    <image
      v-if="processedSource"
      :href="processedSource"
      :width="presentation.width"
      :height="presentation.height"
      preserveAspectRatio="none"
    />
    <g v-else-if="!framedCell && !unavailable" :transform="presentation.rotationTransform">
      <g :transform="presentation.flipTransform">
        <g :clip-path="`url(#${clipPathId})`">
          <image
            :href="src"
            :x="-presentation.cropX"
            :y="-presentation.cropY"
            :width="naturalWidth"
            :height="naturalHeight"
            preserveAspectRatio="none"
            aria-hidden="true"
          />
        </g>
      </g>
    </g>
    <text v-if="unavailable" x="4" y="16" fill="currentColor" role="status">
      {{ t("image.assetUnavailable") }}
    </text>
  </svg>
  <img
    :key="sourceGeneration"
    ref="probeElement"
    class="sheet-image-content__probe"
    :src="src"
    :data-source-generation="sourceGeneration"
    alt=""
    aria-hidden="true"
    @load="onSourceLoad"
    @error="onSourceError"
  />
</template>

<style scoped lang="scss">
.sheet-image-content {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;

  &__probe {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
}
</style>
