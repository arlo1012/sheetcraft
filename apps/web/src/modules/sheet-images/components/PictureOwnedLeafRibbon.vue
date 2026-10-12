<script setup lang="ts">
import { computed } from "vue";
import { Crop, Eye, ImagePlus, ImageDown, PencilLine, Settings2 } from "lucide-vue-next";
import { isGroupedPicture, type GroupedPicture } from "@sheetcraft/core/picture-group";
import { useAppI18n } from "../../../shared/i18n";
import PictureAssetTools from "./PictureAssetTools.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import type { PictureFileFormat } from "../picture-asset-conversion";

const props = defineProps<{
  image: GroupedPicture;
  disabled: boolean;
  busy?: boolean;
  canReplace: boolean;
  canPreview?: boolean;
  previewHandler?: () => boolean;
  canAnnotate?: boolean;
  annotateHandler?: () => boolean;
  canCrop?: boolean;
  cropHandler?: () => boolean;
  replaceHandler: () => void;
  convertHandler?: () => boolean;
  canConvert?: boolean;
  formatHandler: () => void;
  ownerKey: string;
}>();
if (!isGroupedPicture(props.image))
  throw new TypeError("An owned source ribbon requires a real picture leaf.");
const emit = defineEmits<{
  compress: [];
  batchSize: [];
  export: [format: PictureFileFormat, all?: boolean];
}>();
const { t } = useAppI18n();
const callbacks = computed(() => {
  const image = props.image,
    key = props.ownerKey,
    replace = props.replaceHandler,
    format = props.formatHandler,
    crop = props.cropHandler,
    preview = props.previewHandler,
    convert = props.convertHandler,
    annotate = props.annotateHandler;
  return {
    annotate: () => {
      if (
        image === props.image &&
        key === props.ownerKey &&
        !props.disabled &&
        props.canAnnotate &&
        annotate === props.annotateHandler
      )
        annotate?.();
    },
    convert: () => {
      if (
        image === props.image &&
        key === props.ownerKey &&
        !props.disabled &&
        props.canConvert !== false &&
        convert === props.convertHandler
      )
        convert?.();
    },
    export: (fileFormat: PictureFileFormat, all = false) => {
      if (image === props.image && key === props.ownerKey && !props.busy)
        emit("export", fileFormat, all);
    },
    preview: () => {
      if (
        image === props.image &&
        key === props.ownerKey &&
        !props.disabled &&
        props.canPreview &&
        preview === props.previewHandler
      )
        preview?.();
    },
    compress: () => {
      if (image === props.image && key === props.ownerKey && !props.disabled) emit("compress");
    },
    batchSize: () => {
      if (image === props.image && key === props.ownerKey && !props.disabled) emit("batchSize");
    },
    replace: () => {
      if (
        image === props.image &&
        isGroupedPicture(props.image) &&
        !props.disabled &&
        props.canReplace &&
        key === props.ownerKey &&
        replace === props.replaceHandler
      )
        replace();
    },
    crop: () => {
      if (
        image === props.image &&
        isGroupedPicture(props.image) &&
        !props.disabled &&
        props.canCrop &&
        key === props.ownerKey &&
        crop === props.cropHandler
      )
        crop?.();
    },
    format: () => {
      if (
        image === props.image &&
        isGroupedPicture(props.image) &&
        key === props.ownerKey &&
        format === props.formatHandler
      )
        format();
    },
  };
});
</script>
<template>
  <RibbonToolbar :label="t('image.tools')" data-owned-picture-source-ribbon>
    <RibbonButton
      variant="tall"
      :label="t('image.replace')"
      :text="t('image.replace')"
      :disabled="disabled || !canReplace"
      data-picture-tool="replace"
      @activate="callbacks.replace"
      ><ImagePlus
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('image.crop')"
      :text="t('image.crop')"
      :disabled="disabled || !canCrop"
      data-picture-tool="crop"
      @activate="callbacks.crop"
      ><Crop
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('image.preview')"
      :text="t('image.preview')"
      :disabled="disabled || !canPreview"
      data-picture-tool="preview"
      @activate="callbacks.preview"
      ><Eye
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('image.convertToCell')"
      :text="t('image.convertToCell')"
      :disabled="disabled || !convertHandler || canConvert === false"
      data-picture-tool="convert-to-cell"
      @activate="callbacks.convert"
      ><ImageDown
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('picture.annotate')"
      :text="t('picture.annotate')"
      :disabled="disabled || !canAnnotate"
      data-picture-tool="annotate"
      @activate="callbacks.annotate"
      ><PencilLine
    /></RibbonButton>
    <PictureAssetTools
      :disabled="disabled"
      :busy="!!busy"
      :owner-key="ownerKey"
      :export-disabled="false"
      print-disabled
      @compress="callbacks.compress"
      @batch-size="callbacks.batchSize"
      @export="callbacks.export"
    />
    <RibbonButton
      variant="tall"
      :label="t('pictureFormat.paneTitle')"
      :text="t('pictureFormat.paneTitle')"
      data-picture-tool="format"
      @activate="callbacks.format"
      ><Settings2
    /></RibbonButton>
  </RibbonToolbar>
</template>
