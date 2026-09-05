<script setup lang="ts">
import { computed, ref, useId } from "vue";
import type { ImageTransform } from "@idea10/core/workbook";
import { getSheetImagePresentation } from "./sheetImagePresentation";

const props = withDefaults(
  defineProps<{
    src: string;
    altText: string;
    transform?: ImageTransform;
    fit?: "contain" | "fill";
  }>(),
  { fit: "contain" },
);
defineOptions({ inheritAttrs: false });
const emit = defineEmits<{ load: [size: { width: number; height: number }] }>();

const clipPathId = `sheet-image-content-clip-${useId()}`;
const naturalWidth = ref(1);
const naturalHeight = ref(1);

const presentation = computed(() =>
  getSheetImagePresentation(props.transform, naturalWidth.value, naturalHeight.value),
);

function onSourceLoad(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  naturalWidth.value = image.naturalWidth;
  naturalHeight.value = image.naturalHeight;
  emit("load", { width: image.naturalWidth, height: image.naturalHeight });
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
    <g :transform="presentation.rotationTransform">
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
  </svg>
  <img
    class="sheet-image-content__probe"
    :src="src"
    alt=""
    aria-hidden="true"
    @load="onSourceLoad"
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
