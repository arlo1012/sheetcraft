<script setup lang="ts">
import { computed } from "vue";
import { Crop, RotateCcw, ImageDown, ImagePlus, PencilLine } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
  type ImageAppearance,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import PictureViewMenu from "./PictureViewMenu.vue";
import PictureRotationMenu from "./PictureRotationMenu.vue";
import PictureAssetTools from "./PictureAssetTools.vue";
import type { PictureFileFormat } from "../picture-asset-conversion";
import PictureArrangeTools from "./PictureArrangeTools.vue";
import type { PictureAlignment, PictureLayerAction } from "../usePictureTools";
import PictureAppearanceTools from "./PictureAppearanceTools.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
const props = defineProps<{
  image: FloatingImage;
  disabled: boolean;
  busy?: boolean;
  selectionCount: number;
  previewOnDoubleClick: boolean;
}>();
const emit = defineEmits<{
  update: [image: FloatingImage];
  appearance: [patch: Partial<ImageAppearance> | undefined];
  insertImage: [mode: "cell" | "floating"];
  crop: [];
  rotate: [turns: -1 | 1 | 2];
  flip: [axis: "horizontal" | "vertical"];
  restore: [];
  replace: [];
  group: [];
  ungroup: [];
  align: [action: PictureAlignment];
  layer: [action: PictureLayerAction];
  selectionPane: [];
  compress: [];
  annotate: [];
  batchSize: [];
  export: [format: PictureFileFormat, all?: boolean];
  preview: [];
  viewSettings: [value: boolean];
  print: [];
  convertToCell: [];
}>();
const { t } = useAppI18n();
const locked = computed(() => props.image.lockAspectRatio ?? true);
function resize(axis: "width" | "height", points: unknown): void {
  if (props.disabled || typeof points !== "number" || !Number.isFinite(points)) return;
  const pixels = (points * 4) / 3;
  const next = { ...props.image, [axis]: pixels };
  if (locked.value) {
    const other = axis === "width" ? "height" : "width";
    next[other] = (props.image[other] * pixels) / props.image[axis];
  }
  if (
    [next.width, next.height].some(
      (value) => value < MIN_FLOATING_IMAGE_SIZE || value > MAX_FLOATING_IMAGE_SIZE,
    )
  )
    return;
  emit("update", next);
}
</script>
<template>
  <RibbonToolbar :label="t('image.tools')">
    <section class="picture-toolbar__group" role="group" :aria-label="t('image.insertMenu')">
      <div class="picture-toolbar__stack">
        <ImageInsertMenu
          compact
          :text="t('image.insertMenu')"
          :disabled="disabled"
          @insert-image="emit('insertImage', $event)"
        />
        <RibbonButton
          :label="t('image.replace')"
          :text="t('image.replace')"
          :disabled="disabled || selectionCount > 1"
          data-picture-tool="replace"
          @activate="emit('replace')"
          ><ImagePlus
        /></RibbonButton>
      </div>

      <RibbonButton
        variant="tall"
        :label="t('image.convertToCell')"
        :text="t('image.convertToCell')"
        :disabled="disabled || selectionCount > 1"
        @activate="emit('convertToCell')"
        ><ImageDown
      /></RibbonButton>
    </section>
    <PictureViewMenu
      :disabled="!!busy"
      :preview-on-double-click="previewOnDoubleClick"
      @preview="emit('preview')"
      @change="emit('viewSettings', $event)"
    />
    <section class="picture-toolbar__group" role="group" :aria-label="t('image.crop')">
      <RibbonButton
        variant="tall"
        :label="t('image.crop')"
        :text="t('image.crop')"
        :disabled="disabled || selectionCount > 1"
        data-picture-tool="crop"
        @activate="emit('crop')"
        ><Crop
      /></RibbonButton>
      <div class="picture-toolbar__stack">
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.widthPoints')">
          <span>{{ t("image.widthPoints") }}</span>
          <TInputNumber
            :model-value="Math.round(image.width * 75) / 100"
            :min="0.75"
            :max="7500"
            :decimal-places="2"
            size="small"
            theme="column"
            class="idea-input-number--persistent-controls"
            :disabled="disabled || selectionCount > 1"
            data-picture-size="width"
            @change="resize('width', $event)"
          />
        </div>
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.heightPoints')">
          <span>{{ t("image.heightPoints") }}</span>
          <TInputNumber
            :model-value="Math.round(image.height * 75) / 100"
            :min="0.75"
            :max="7500"
            :decimal-places="2"
            size="small"
            theme="column"
            class="idea-input-number--persistent-controls"
            :disabled="disabled || selectionCount > 1"
            data-picture-size="height"
            @change="resize('height', $event)"
          />
        </div>
      </div>
      <div class="picture-toolbar__stack">
        <TCheckbox
          :model-value="locked"
          :disabled="disabled || selectionCount > 1"
          @update:model-value="emit('update', { ...image, lockAspectRatio: Boolean($event) })"
          >{{ t("image.lockAspectRatio") }}</TCheckbox
        >
        <RibbonButton
          :label="t('image.restoreOriginal')"
          :text="t('image.restoreOriginal')"
          :disabled="disabled || selectionCount > 1"
          data-picture-tool="restore"
          @activate="emit('restore')"
          ><RotateCcw
        /></RibbonButton>
      </div>
    </section>
    <PictureRotationMenu
      :disabled="disabled"
      @rotate="emit('rotate', $event)"
      @flip="emit('flip', $event)"
    />
    <PictureArrangeTools
      :disabled="disabled"
      :count="selectionCount"
      :grouped="!!image.groupId"
      @group="emit('group')"
      @ungroup="emit('ungroup')"
      @align="emit('align', $event)"
      @layer="emit('layer', $event)"
      @selection-pane="emit('selectionPane')"
    />
    <PictureAppearanceTools
      :image="image"
      :disabled="disabled"
      @change="emit('appearance', $event)"
    />
    <RibbonButton
      variant="tall"
      :label="t('picture.annotate')"
      :text="t('picture.annotate')"
      :disabled="disabled || selectionCount > 1"
      data-picture-tool="annotate"
      @activate="emit('annotate')"
      ><PencilLine
    /></RibbonButton>
    <PictureAssetTools
      :disabled="disabled"
      :busy="!!busy"
      @compress="emit('compress')"
      @batch-size="emit('batchSize')"
      @export="(format, all) => emit('export', format, all)"
      @preview="emit('preview')"
      @print="emit('print')"
    />
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-toolbar {
  &__group {
    @include ribbon.columns;
  }
  &__stack {
    @include ribbon.stack;
  }
  &__dimension {
    @include ribbon.row;
    gap: 6px;
    span {
      min-width: 64px;
    }
  }
}
</style>
