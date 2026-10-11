<script setup lang="ts">
import { computed } from "vue";
import { Crop, RotateCcw, ImageDown, ImagePlus, PencilLine } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { ChangeContext } from "tdesign-vue-next/es/input-number/type";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
  type ImageAppearance,
} from "@sheetcraft/core/workbook";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import PictureViewMenu from "./PictureViewMenu.vue";
import PictureRotationMenu from "./PictureRotationMenu.vue";
import PictureAssetTools from "./PictureAssetTools.vue";
import type { PictureFileFormat } from "../picture-asset-conversion";
import PictureArrangeTools from "./PictureArrangeTools.vue";
import type { PictureAlignment, PictureLayerAction } from "../usePictureTools";
import type { PictureSizeEdit, PictureToolGeometry } from "../picture-tool-geometry";
import PictureAppearanceTools from "./PictureAppearanceTools.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
const props = defineProps<{
  image: FloatingImage;
  geometry?: PictureToolGeometry;
  error?: string;
  draftOwnerKey?: number;
  appearanceDraftKey?: number;
  resizeHandler?: (edit: PictureSizeEdit) => boolean;
  aspectRatioHandler?: (locked: boolean) => boolean;
  appearanceHandler?: (patch: Partial<ImageAppearance> | undefined) => boolean;
  disabled: boolean;
  busy?: boolean;
  selectionCount: number;
  previewOnDoubleClick: boolean;
}>();
const emit = defineEmits<{
  resize: [intent: PictureSizeEdit];
  aspectRatio: [value: boolean];
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
const isFramed = computed(() => isFramedPictureObject(props.image));
const locked = computed(() => props.image.lockAspectRatio ?? true);
const size = computed(() => {
  if (props.geometry) return props.geometry;
  const image = props.image;
  if (isFramedPictureObject(image)) return undefined;
  return { width: image.width, height: image.height };
});
const sizeAvailable = computed(
  () =>
    !!size.value &&
    [size.value.width, size.value.height].every((value) => Number.isFinite(value) && value > 0),
);
const sizeDisabled = computed(
  () => props.disabled || props.selectionCount > 1 || !sizeAvailable.value,
);
function points(axis: "width" | "height"): number | undefined {
  return sizeAvailable.value ? Math.round(size.value![axis] * 75) / 100 : undefined;
}
const numericCallbacks = computed(() => {
  const draftOwnerKey = props.draftOwnerKey;
  const handler = props.resizeHandler;
  function commit(axis: "width" | "height", points: unknown): void {
    if (draftOwnerKey !== props.draftOwnerKey || handler !== props.resizeHandler) return;
    resize(axis, points, handler);
  }
  function change(axis: "width" | "height", points: unknown, context?: ChangeContext): void {
    if (context?.type === "input" || context?.type === "enter" || context?.type === "props") return;
    commit(axis, points);
  }
  return {
    width: (points: unknown, context?: ChangeContext) => change("width", points, context),
    height: (points: unknown, context?: ChangeContext) => change("height", points, context),
    widthEnter: (points: unknown) => commit("width", points),
    heightEnter: (points: unknown) => commit("height", points),
  };
});
function resize(
  axis: "width" | "height",
  points: unknown,
  handler: typeof props.resizeHandler,
): void {
  if (sizeDisabled.value || typeof points !== "number" || !Number.isFinite(points)) return;
  const pixels = (points * 4) / 3;
  if (pixels < MIN_FLOATING_IMAGE_SIZE || pixels > MAX_FLOATING_IMAGE_SIZE) return;
  const edit: PictureSizeEdit = { axis, value: pixels };
  if (handler) handler(edit);
  else emit("resize", edit);
}
function aspectRatio(value: unknown): void {
  if (props.disabled || props.selectionCount > 1 || typeof value !== "boolean") return;
  const locked = value;
  if (props.aspectRatioHandler) props.aspectRatioHandler(locked);
  else emit("aspectRatio", locked);
}
const appearanceCallback = computed(() => {
  const draftKey = props.appearanceDraftKey;
  const handler = props.appearanceHandler;
  return (patch: Partial<ImageAppearance> | undefined): void => {
    if (
      props.disabled ||
      draftKey !== props.appearanceDraftKey ||
      handler !== props.appearanceHandler
    )
      return;
    if (handler) handler(patch);
    else emit("appearance", patch);
  };
});
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
          :disabled="disabled || selectionCount > 1 || isFramed"
          data-picture-tool="replace"
          @activate="emit('replace')"
          ><ImagePlus
        /></RibbonButton>
      </div>

      <RibbonButton
        variant="tall"
        :label="t('image.convertToCell')"
        :text="t('image.convertToCell')"
        :disabled="disabled || selectionCount > 1 || isFramed"
        data-picture-tool="convert-to-cell"
        @activate="emit('convertToCell')"
        ><ImageDown
      /></RibbonButton>
    </section>
    <PictureViewMenu
      :disabled="!!busy || isFramed"
      :preview-on-double-click="previewOnDoubleClick"
      @preview="emit('preview')"
      @change="emit('viewSettings', $event)"
    />
    <section class="picture-toolbar__group" role="group" :aria-label="t('image.crop')">
      <RibbonButton
        variant="tall"
        :label="t('image.crop')"
        :text="t('image.crop')"
        :disabled="disabled || selectionCount > 1 || isFramed"
        data-picture-tool="crop"
        @activate="emit('crop')"
        ><Crop
      /></RibbonButton>
      <div class="picture-toolbar__stack">
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.widthPoints')">
          <span>{{ t("image.widthPoints") }}</span>
          <TInputNumber
            :key="`${draftOwnerKey}:width`"
            :model-value="points('width')"
            :min="0.75"
            :max="7500"
            :decimal-places="2"
            size="small"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            :disabled="sizeDisabled"
            data-picture-size="width"
            @change="numericCallbacks.width"
            @enter="numericCallbacks.widthEnter"
          />
        </div>
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.heightPoints')">
          <span>{{ t("image.heightPoints") }}</span>
          <TInputNumber
            :key="`${draftOwnerKey}:height`"
            :model-value="points('height')"
            :min="0.75"
            :max="7500"
            :decimal-places="2"
            size="small"
            theme="column"
            class="sheetcraft-input-number--persistent-controls"
            :disabled="sizeDisabled"
            data-picture-size="height"
            @change="numericCallbacks.height"
            @enter="numericCallbacks.heightEnter"
          />
        </div>
      </div>
      <span v-if="error" class="picture-toolbar__error" role="alert">{{ error }}</span>
      <div class="picture-toolbar__stack">
        <TCheckbox
          :model-value="locked"
          :disabled="disabled || selectionCount > 1"
          @update:model-value="aspectRatio"
          >{{ t("image.lockAspectRatio") }}</TCheckbox
        >
        <RibbonButton
          :label="t('image.restoreOriginal')"
          :text="t('image.restoreOriginal')"
          :disabled="disabled || selectionCount > 1 || isFramed"
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
      :group-disabled="isFramed"
      :alignment-disabled="isFramed"
      :count="selectionCount"
      :grouped="!!image.groupId"
      @group="emit('group')"
      @ungroup="emit('ungroup')"
      @align="emit('align', $event)"
      @layer="emit('layer', $event)"
      @selection-pane="emit('selectionPane')"
    />
    <PictureAppearanceTools
      :key="appearanceDraftKey"
      :image="image"
      :disabled="disabled"
      @change="appearanceCallback"
    />
    <RibbonButton
      variant="tall"
      :label="t('picture.annotate')"
      :text="t('picture.annotate')"
      :disabled="disabled || selectionCount > 1 || isFramed"
      data-picture-tool="annotate"
      @activate="emit('annotate')"
      ><PencilLine
    /></RibbonButton>
    <PictureAssetTools
      :disabled="disabled || isFramed"
      :busy="!!busy || isFramed"
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
  &__error {
    max-width: 240px;
    margin-inline: var(--sheetcraft-space-2);
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: normal;
  }
}
</style>
