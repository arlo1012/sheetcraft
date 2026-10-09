<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { createPictureCanvas } from "../../../shared/images/imageAppearance";
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
    visible?: boolean;
  }>(),
  { visible: true },
);

const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const viewerReady = ref(false);
const presentationUrl = ref<string>();
const hasTransform = computed(() =>
  Boolean(
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
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const generation = presentationGeneration.value;
  try {
    if (props.transform?.appearance || props.transform?.annotations?.length) {
      const canvas = createPictureCanvas(image, props.transform);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("Image rendering failed."))),
          "image/png",
        ),
      );
      if (generation !== presentationGeneration.value) return;
      clearPresentationUrl();
      presentationUrl.value = URL.createObjectURL(blob);
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
  } catch {
    // The viewer stays closed when its local source cannot be read safely.
  }
}

watch(
  () => [props.visible, props.src, props.transform] as const,
  () => {
    presentationGeneration.value += 1;
    viewerReady.value = false;
    clearPresentationUrl();
  },
);

onBeforeUnmount(() => {
  presentationGeneration.value += 1;
  clearPresentationUrl();
});
</script>

<template>
  <img
    v-if="visible && src && hasTransform"
    :key="presentationGeneration"
    class="sheet-image-preview__probe"
    :src="src"
    alt=""
    aria-hidden="true"
    @load="onPresentationSourceLoad"
  />
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
