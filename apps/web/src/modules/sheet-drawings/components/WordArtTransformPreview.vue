<script setup lang="ts">
import { computed } from "vue";
import {
  getWordArtTransformDiagram,
  type WordArtTransformPreset,
} from "../wordart-transform-presets";

const props = defineProps<{ choice: WordArtTransformPreset }>();
const diagram = computed(() => getWordArtTransformDiagram(props.choice));
</script>

<template>
  <svg
    class="wordart-transform-preview"
    viewBox="0 0 120 64"
    aria-hidden="true"
    focusable="false"
    :data-wordart-transform-diagram="choice.id"
  >
    <g v-if="diagram.untransformed" class="wordart-transform-preview__plain">
      <text x="60" y="39" text-anchor="middle">Abc</text>
      <path d="M 24 45 L 96 45" class="wordart-transform-preview__guide" />
    </g>
    <g v-for="(track, index) in diagram.tracks" :key="`track-${index}`">
      <path :d="track.boundary" class="wordart-transform-preview__guide" />
      <path :d="track.ticks" class="wordart-transform-preview__edge" />
      <path :d="track.direction" class="wordart-transform-preview__edge" />
    </g>
    <g v-for="(band, index) in diagram.bands" :key="`band-${index}`">
      <path :d="band.rungs" class="wordart-transform-preview__guide" />
      <path :d="band.top" class="wordart-transform-preview__edge" />
      <path
        :d="band.bottom"
        class="wordart-transform-preview__edge wordart-transform-preview__bottom"
      />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.wordart-transform-preview {
  display: block;
  width: 96px;
  max-width: 100%;
  height: 48px;
  overflow: visible;
  pointer-events: none;

  &__plain {
    fill: currentColor;
    font-family: var(--sheetcraft-font-sans);
    font-size: 30px;
  }

  &__edge,
  &__guide {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.6;
  }

  &__guide {
    opacity: 0.4;
    stroke-width: 1;
  }

  &__bottom {
    stroke-dasharray: 3 2;
  }
}
</style>
