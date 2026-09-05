<script setup lang="ts">
import { defineAsyncComponent, nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    src: string;
    altText: string;
    visible?: boolean;
  }>(),
  { visible: true },
);

const emit = defineEmits<{ close: [] }>();
const { t } = useAppI18n();
const viewerReady = ref(false);

// ImageViewer and its CSS are loaded only when a preview is visible.
const AsyncImageViewer = defineAsyncComponent(async () => {
  const { ImageViewer } = await import("tdesign-vue-next/es/image-viewer");
  return ImageViewer;
});

function revealViewerAfterMount(): void {
  void nextTick(() => {
    if (props.visible && props.src) viewerReady.value = true;
  });
}

watch(
  () => [props.visible, props.src] as const,
  ([visible, src]) => {
    if (!visible || !src) viewerReady.value = false;
  },
);
</script>

<template>
  <AsyncImageViewer
    v-if="visible && src"
    :attach="'body'"
    :close-on-esc-keydown="true"
    :close-on-overlay="true"
    :images="[{ mainImage: src, thumbnail: src }]"
    :title="altText || t('image.preview')"
    :visible="viewerReady"
    :z-index="1100"
    @close="emit('close')"
    @vue:mounted="revealViewerAfterMount"
  >
    <template #trigger />
  </AsyncImageViewer>
</template>
