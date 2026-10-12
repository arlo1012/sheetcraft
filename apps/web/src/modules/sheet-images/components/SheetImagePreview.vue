<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";
import { PicturePaintUnavailableError } from "../../../shared/images/picture-detailed-render";
import { createPictureCanvas } from "../../../shared/images/imageAppearance";
import {
  createPictureSourcePresentationCanvas,
  type PictureSourcePresentation,
} from "../picture-source-presentation";
import { createCanvasImageCache } from "../../sheet-grid/canvas/image-painter";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";
import { getDetailedPictureStyleAssetIds } from "@sheetcraft/core/picture-detailed-style";
import type { WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import type { ImageTransform } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import {
  createSheetImagePresentationBlobUrl,
  readImageSourceAsDataUrl,
} from "./sheetImagePresentation";

const props = withDefaults(
  defineProps<{
    src: string;
    altText: string;
    transform?: ImageTransform;
    frameSource?: PictureSourcePresentation;
    theme?: WorkbookTheme;
    assetUrls?: ReadonlyMap<string, string>;
    visible?: boolean;
  }>(),
  { visible: true },
);

const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const viewerReady = ref(false);
const presentationUrl = ref<string>();
const presentationError = ref(false);
const decodedSource = shallowRef<HTMLImageElement>();
const auxiliaryImages = createCanvasImageCache(() => {
  if (props.visible && decodedSource.value) void preparePresentation(decodedSource.value);
});
const hasTransform = computed(() =>
  Boolean(
    props.frameSource ||
    props.transform?.annotations?.length ||
    props.transform?.appearance ||
    props.transform?.crop ||
    props.transform?.rotation ||
    props.transform?.flipHorizontal ||
    props.transform?.flipVertical,
  ),
);
const viewerSource = computed(() => (hasTransform.value ? presentationUrl.value : props.src));
const presentationGeneration = ref(0);
const sourceGeneration = ref(0);

// ImageViewer and its CSS are loaded only when a preview is visible.
const AsyncImageViewer = defineAsyncComponent(async () => {
  const { ImageViewer } = await import("tdesign-vue-next/es/image-viewer");
  return ImageViewer;
});

function revealViewerAfterMount(): void {
  void nextTick(() => {
    if (props.visible && viewerSource.value) viewerReady.value = true;
  });
}

function clearPresentationUrl(): void {
  if (presentationUrl.value) URL.revokeObjectURL(presentationUrl.value);
  presentationUrl.value = undefined;
}

async function onPresentationSourceLoad(event: Event): Promise<void> {
  if (!hasTransform.value) return;
  const image = event.currentTarget as HTMLImageElement;
  if (image.dataset.previewSourceGeneration !== String(sourceGeneration.value)) return;
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    presentationError.value = true;
    return;
  }
  decodedSource.value = image;
  await preparePresentation(image);
}

function onPresentationSourceError(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (props.visible && image.dataset.previewSourceGeneration === String(sourceGeneration.value))
    presentationError.value = true;
}

async function preparePresentation(image: HTMLImageElement): Promise<void> {
  if (!props.visible || !hasTransform.value) return;
  const generation = ++presentationGeneration.value;
  try {
    // Size planning uses peek(), so explicitly start only the actual auxiliary
    // sources before entering the same painter as the grid.
    for (const id of getDetailedPictureStyleAssetIds(
      (props.frameSource?.picture.transform ?? props.transform)?.appearance?.detailedStyle,
    )) {
      const url = props.assetUrls?.get(id);
      if (url) auxiliaryImages.get(url);
    }
    if (props.frameSource || props.transform?.appearance || props.transform?.annotations?.length) {
      const resources = createPicturePaintResources(props.theme, props.assetUrls, auxiliaryImages);
      const canvas = props.frameSource
        ? createPictureSourcePresentationCanvas(image, props.frameSource, props.theme, resources)
        : createPictureCanvas(image, props.transform, 4096, resources);
      let blob: Blob;
      try {
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error("Image rendering failed."))),
            "image/png",
          ),
        );
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (generation !== presentationGeneration.value) return;
      clearPresentationUrl();
      presentationUrl.value = URL.createObjectURL(blob);
      presentationError.value = false;
      revealViewerAfterMount();
      return;
    }
    const source = await readImageSourceAsDataUrl(props.src);
    if (generation !== presentationGeneration.value) return;
    clearPresentationUrl();
    presentationUrl.value = createSheetImagePresentationBlobUrl(
      source,
      props.transform,
      image.naturalWidth,
      image.naturalHeight,
    );
  } catch (error) {
    if (generation !== presentationGeneration.value) return;
    const pending =
      error instanceof PicturePaintUnavailableError &&
      error.missingAssetIds.every((id) => {
        const url = props.assetUrls?.get(id);
        return !!url && auxiliaryImages.state?.(url) === "loading";
      });
    presentationError.value = !pending;
  }
}

watch(
  () =>
    [
      props.visible,
      props.src,
      props.transform,
      props.frameSource,
      props.theme,
      props.assetUrls,
    ] as const,
  () => {
    presentationGeneration.value += 1;
    sourceGeneration.value += 1;
    viewerReady.value = false;
    presentationError.value = false;
    decodedSource.value = undefined;
    const retained = new Set<string>();
    for (const id of getDetailedPictureStyleAssetIds(
      (props.frameSource?.picture.transform ?? props.transform)?.appearance?.detailedStyle,
    )) {
      const url = props.assetUrls?.get(id);
      if (url) retained.add(url);
    }
    auxiliaryImages.retain(retained);
    clearPresentationUrl();
  },
);

onBeforeUnmount(() => {
  auxiliaryImages.dispose();
  presentationGeneration.value += 1;
  clearPresentationUrl();
});
</script>

<template>
  <img
    v-if="visible && src && hasTransform"
    :key="sourceGeneration"
    :data-preview-source-generation="sourceGeneration"
    class="sheet-image-preview__probe"
    :src="src"
    alt=""
    aria-hidden="true"
    @load="onPresentationSourceLoad"
    @error="onPresentationSourceError"
  />
  <TDialog
    v-if="visible && presentationError"
    :visible="true"
    :header="t('image.preview')"
    :confirm-btn="t('picture.close')"
    :cancel-btn="null"
    @confirm="emit('close')"
    @close="emit('close')"
    >{{ t("image.assetUnavailable") }}</TDialog
  >
  <AsyncImageViewer
    v-if="visible && viewerSource"
    :attach="'body'"
    :close-on-esc-keydown="true"
    :close-on-overlay="true"
    :images="[{ mainImage: viewerSource, thumbnail: viewerSource }]"
    :title="altText || t('image.preview')"
    :visible="viewerReady"
    :z-index="1100"
    @close="emit('close')"
    @vue:mounted="revealViewerAfterMount"
  >
    <template #trigger />
  </AsyncImageViewer>
</template>

<style scoped lang="scss">
.sheet-image-preview__probe {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
