<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { PICTURE_TEXTURE_IDS, type PictureTextureId } from "../../picture-texture";
import { PICTURE_TEXTURE_LABELS } from "../../picture-texture-labels";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import PanelSelect from "../../../../shared/panel-select/PanelSelect.vue";
import GallerySection from "../../../../shared/gallery/GallerySection.vue";
import PictureFormatField from "./PictureFormatField.vue";
import PictureTexturePreview from "./PictureTexturePreview.vue";
const props = defineProps<{
  ownerKey: string;
  selected?: PictureTextureId;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onSelect: (id: PictureTextureId) => void;
}>();
const opening = ref<string>(),
  callbackGeneration = ref(0);
let generation = 0;
watch(
  () => props.ownerKey,
  () => {
    generation++;
    opening.value = undefined;
  },
);
watch(
  () => props.onSelect,
  () => {
    generation++;
    callbackGeneration.value++;
    opening.value = undefined;
  },
  { flush: "sync" },
);
onUnmounted(() => {
  generation++;
  opening.value = undefined;
});
function open(value: boolean) {
  generation++;
  opening.value = value ? props.ownerKey : undefined;
}
function selectionAction(id: PictureTextureId, close: () => void) {
  const key = props.ownerKey,
    token = generation,
    handler = props.onSelect;
  return () => {
    if (
      props.disabled ||
      opening.value !== key ||
      props.ownerKey !== key ||
      generation !== token ||
      props.onSelect !== handler
    )
      return;
    handler(id);
    close();
  };
}
function keydown(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
    return;
  const container = event.currentTarget as HTMLElement,
    buttons = [...container.querySelectorAll<HTMLButtonElement>("button:not([disabled])")],
    index = buttons.indexOf(event.target as HTMLButtonElement);
  if (index < 0) return;
  const delta =
    event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
          ? -5
          : 5;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, index + delta));
  event.preventDefault();
  event.stopPropagation();
  buttons[next]?.focus();
}
</script>
<template>
  <PictureFormatField :label="t('presetTextures')"
    ><PanelSelect
      :key="`${ownerKey}:${callbackGeneration}`"
      :model-value="selected"
      :label="t('presetTextures')"
      :value-label="selected ? t(PICTURE_TEXTURE_LABELS[selected]) : t('effectCustom')"
      :disabled="disabled"
      panel-width="content"
      @open-change="open"
    >
      <template #value
        ><span>{{
          selected ? t(PICTURE_TEXTURE_LABELS[selected]) : t("effectCustom")
        }}</span></template
      >
      <template #panel="{ close }"
        ><GallerySection :title="t('presetTextures')"
          ><div
            class="picture-texture-gallery"
            role="group"
            :aria-label="t('presetTextures')"
            @keydown="keydown"
          >
            <button
              v-for="id in PICTURE_TEXTURE_IDS"
              :key="id"
              type="button"
              :disabled="disabled"
              :aria-label="t(PICTURE_TEXTURE_LABELS[id])"
              :title="t(PICTURE_TEXTURE_LABELS[id])"
              :aria-pressed="selected === id"
              :onClick="selectionAction(id, close)"
            >
              <PictureTexturePreview :texture="id" />
            </button></div></GallerySection
      ></template> </PanelSelect
  ></PictureFormatField>
</template>
<style scoped lang="scss">
@use "../../../../shared/gallery/gallery-choice" as gallery;

.picture-texture-gallery {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
  width: 224px;
  max-width: calc(100vw - 40px);
  max-height: 55vh;
  overflow: auto;
  button {
    // Preserve the preview inset after the shared choice removes the 1px border.
    @include gallery.choice(4px);

    width: 40px;
    max-width: 100%;
    height: 40px;
  }
}
</style>
