<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { createPictureTexturePixels, type PictureTextureId } from "../../picture-texture";
const props = defineProps<{ texture: PictureTextureId }>();
const canvas = ref<HTMLCanvasElement>();
function draw() {
  const node = canvas.value;
  if (!node) return;
  const pixels = createPictureTexturePixels(props.texture, 64);
  const context = node.getContext("2d");
  if (!context) return;
  node.width = pixels.width;
  node.height = pixels.height;
  context.putImageData(
    new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height),
    0,
    0,
  );
}
onMounted(draw);
watch(() => props.texture, draw);
</script>
<template>
  <canvas ref="canvas" width="64" height="64" class="picture-texture-preview" aria-hidden="true" />
</template>
<style scoped lang="scss">
.picture-texture-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 2px;
}
</style>
