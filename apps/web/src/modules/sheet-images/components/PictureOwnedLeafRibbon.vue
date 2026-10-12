<script setup lang="ts">
import { computed } from "vue";
import { Crop, ImagePlus, Settings2 } from "lucide-vue-next";
import { isGroupedPicture, type GroupedPicture } from "@sheetcraft/core/picture-group";
import { useAppI18n } from "../../../shared/i18n";
import PictureAssetTools from "./PictureAssetTools.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

const props = defineProps<{
  image: GroupedPicture;
  disabled: boolean;
  canReplace: boolean;
  canCrop?: boolean;
  cropHandler?: () => boolean;
  replaceHandler: () => void;
  formatHandler: () => void;
  ownerKey: string;
}>();
if (!isGroupedPicture(props.image))
  throw new TypeError("An owned source ribbon requires a real picture leaf.");
const emit = defineEmits<{ compress: []; batchSize: [] }>();
const { t } = useAppI18n();
const callbacks = computed(() => {
  const image = props.image,
    key = props.ownerKey,
    replace = props.replaceHandler,
    format = props.formatHandler,
    crop = props.cropHandler;
  return {
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
    <PictureAssetTools
      :disabled="disabled"
      :busy="disabled"
      export-disabled
      print-disabled
      @compress="callbacks.compress"
      @batch-size="callbacks.batchSize"
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
