<script setup lang="ts">
import type { PictureEffectEdit } from "../picture-effect-edit";
import { computed, ref } from "vue";
import { Crop, RotateCcw, ImageDown, ImagePlus, PencilLine, Settings2 } from "lucide-vue-next";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  MIN_FLOATING_IMAGE_SIZE,
  MAX_FLOATING_IMAGE_SIZE,
  type FloatingImage,
  type ImageAppearance,
} from "@sheetcraft/core/workbook";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isPictureGroup } from "@sheetcraft/core";
import { useAppI18n } from "../../../shared/i18n";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericFieldSpec,
  NumericValue,
} from "../../../shared/numeric-field/types";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import PictureViewMenu from "./PictureViewMenu.vue";
import PictureRotationMenu from "./PictureRotationMenu.vue";
import PictureAssetTools from "./PictureAssetTools.vue";
import type { PictureFileFormat } from "../picture-asset-conversion";
import PictureArrangeTools from "./PictureArrangeTools.vue";
import type {
  PictureAlignment,
  PictureAlignmentReference,
  PictureLayerAction,
} from "../usePictureTools";
import type { PictureSizeEdit, PictureToolGeometry } from "../picture-tool-geometry";
import PictureAppearanceTools from "./PictureAppearanceTools.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
import { requireStandalonePicture } from "../picture-document-support";
const props = withDefaults(
  defineProps<{
    image: FloatingImage;
    geometry?: PictureToolGeometry;
    error?: string;
    draftOwnerKey?: number;
    appearanceDraftKey?: number;
    resizeHandler?: (edit: PictureSizeEdit) => boolean;
    aspectRatioHandler?: (locked: boolean) => boolean;
    replaceHandler?: () => void;
    convertHandler?: () => boolean;
    canConvert?: boolean;
    canReplace?: boolean;
    canPreview?: boolean;
    previewHandler?: () => boolean;
    canAnnotate?: boolean;
    annotateHandler?: () => boolean;
    canCrop?: boolean;
    canRestore?: boolean;
    restoreHandler?: () => boolean;
    restoreUnavailableReason?: string;
    cropHandler?: () => boolean;
    appearanceHandler?: (patch: Partial<ImageAppearance> | undefined) => boolean;
    effectHandler?: (edit: PictureEffectEdit) => boolean;
    restoreEffectsFocusTarget?: () => HTMLElement | null;
    disabled: boolean;
    groupCreateDisabled?: boolean;
    busy?: boolean;
    selectionCount: number;
    alignmentReference?: PictureAlignmentReference;
    previewOnDoubleClick: boolean;
  }>(),
  {
    canReplace: undefined,
    canCrop: undefined,
    canPreview: undefined,
    canConvert: undefined,
    canAnnotate: undefined,
    canRestore: undefined,
  },
);
// Standalone source tools cannot establish a draft for an owned container.
requireStandalonePicture(props.image);
const standaloneImage = computed(() => requireStandalonePicture(props.image));
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
  align: [action: PictureAlignment, reference: PictureAlignmentReference];
  reference: [reference: PictureAlignmentReference];
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
  format: [target?: "effects"];
}>();
const { t } = useAppI18n();
const appearanceTools = ref<InstanceType<typeof PictureAppearanceTools>>();
defineExpose({
  getEffectsTrigger: (): HTMLElement | null =>
    props.disabled ? null : (appearanceTools.value?.getEffectsTrigger() ?? null),
});
const isFramed = computed(() => isFramedPictureObject(standaloneImage.value));
const locked = computed(() => standaloneImage.value.lockAspectRatio ?? true);
const size = computed(() => {
  const image = standaloneImage.value;
  if (props.geometry) return props.geometry;
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
const sizeSpec: NumericFieldSpec = {
  displayUnit: "pt",
  toDisplay: (value) => value * 0.75,
  fromDisplay: (value) => value / 0.75,
  displayPrecision: 2,
  displayStep: 1,
  canonicalBounds: { min: MIN_FLOATING_IMAGE_SIZE, max: MAX_FLOATING_IMAGE_SIZE },
};
function sizeValue(axis: "width" | "height"): NumericValue {
  return sizeAvailable.value ? { kind: "value", value: size.value![axis] } : { kind: "empty" };
}
function sizeOwnerKey(axis: "width" | "height"): string {
  return `${props.draftOwnerKey}:${standaloneImage.value.id}:${standaloneImage.value.assetId}:${axis}`;
}
const numericCallbacks = computed(() => {
  const imageId = props.image.id,
    owner = props.draftOwnerKey,
    handler = props.resizeHandler;
  function commit(axis: "width" | "height", candidate: NumericCandidate): NumericCommitResult {
    requireStandalonePicture(props.image);
    if (
      candidate.kind !== "value" ||
      sizeDisabled.value ||
      !handler ||
      imageId !== props.image.id ||
      owner !== props.draftOwnerKey ||
      handler !== props.resizeHandler
    )
      return { accepted: false, error: t("picture.operationFailed") };
    const value = candidate.value;
    if (
      !Number.isFinite(value) ||
      value < MIN_FLOATING_IMAGE_SIZE ||
      value > MAX_FLOATING_IMAGE_SIZE
    )
      return { accepted: false, error: t("pictureFormat.outOfRange") };
    return handler({ axis, value }) === true
      ? { accepted: true }
      : { accepted: false, error: t("picture.operationFailed") };
  }
  return {
    width: (value: NumericCandidate) => commit("width", value),
    height: (value: NumericCandidate) => commit("height", value),
  };
});
function aspectRatio(value: unknown): void {
  requireStandalonePicture(props.image);
  if (props.disabled || props.selectionCount > 1 || typeof value !== "boolean") return;
  const locked = value;
  if (props.aspectRatioHandler) props.aspectRatioHandler(locked);
  else emit("aspectRatio", locked);
}
const appearanceCallback = computed(() => {
  requireStandalonePicture(props.image);
  const draftKey = props.appearanceDraftKey;
  const handler = props.appearanceHandler;
  return (patch: Partial<ImageAppearance> | undefined): boolean => {
    requireStandalonePicture(props.image);
    if (
      props.disabled ||
      draftKey !== props.appearanceDraftKey ||
      handler !== props.appearanceHandler
    )
      return false;
    if (handler) return handler(patch);
    emit("appearance", patch);
    return false;
  };
});
const effectCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    draftKey = props.appearanceDraftKey,
    handler = props.effectHandler;
  return (edit: PictureEffectEdit): boolean => {
    requireStandalonePicture(props.image);
    if (
      props.disabled ||
      props.selectionCount < 1 ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      draftKey !== props.appearanceDraftKey ||
      handler !== props.effectHandler
    )
      return false;
    return handler?.(edit) === true;
  };
});
const formatCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    draftKey = props.appearanceDraftKey;
  return (target?: "effects"): void => {
    requireStandalonePicture(props.image);
    if (
      props.disabled ||
      props.selectionCount !== 1 ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      draftKey !== props.appearanceDraftKey
    )
      return;
    if (target === "effects") emit("format", target);
    else emit("format");
  };
});
const replaceCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.replaceHandler;
  return (): void => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      (props.canReplace === undefined ? isFramed.value : !props.canReplace) ||
      owner !== props.draftOwnerKey ||
      image !== props.image ||
      handler !== props.replaceHandler
    )
      return;
    if (handler) handler();
    else emit("replace");
  };
});
const cropCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.cropHandler;
  return (): void => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      (props.canCrop === undefined ? isFramed.value : !props.canCrop) ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      handler !== props.cropHandler
    )
      return;
    if (handler) handler();
    else emit("crop");
  };
});
const previewCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.previewHandler;
  return (): void => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      handler !== props.previewHandler ||
      (props.canPreview === undefined ? isFramed.value : !props.canPreview)
    )
      return;
    if (handler) handler();
    else emit("preview");
  };
});
const annotationCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.annotateHandler;
  return () => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      (props.canAnnotate === undefined ? isFramed.value : !props.canAnnotate) ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      handler !== props.annotateHandler
    )
      return;
    if (handler) handler();
    else emit("annotate");
  };
});
const convertCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.convertHandler;
  return () => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      props.canConvert === false ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      handler !== props.convertHandler
    )
      return;
    if (handler) handler();
    else emit("convertToCell");
  };
});
function sourceAction(action: () => void): void {
  requireStandalonePicture(props.image);
  action();
}
const arrangeCallbacks = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey;
  const current = () => !props.disabled && image === props.image && owner === props.draftOwnerKey;
  return {
    align: (action: PictureAlignment, reference: PictureAlignmentReference) => {
      if (current()) emit("align", action, reference);
    },
    reference: (reference: PictureAlignmentReference) => {
      if (current()) emit("reference", reference);
    },
  };
});
const restoreCallback = computed(() => {
  const image = props.image,
    owner = props.draftOwnerKey,
    handler = props.restoreHandler;
  return () => {
    if (
      props.disabled ||
      props.selectionCount > 1 ||
      props.canRestore === false ||
      (isFramed.value && !handler) ||
      image !== props.image ||
      owner !== props.draftOwnerKey ||
      handler !== props.restoreHandler
    )
      return;
    if (handler) handler();
    else emit("restore");
  };
});
</script>
<template>
  <RibbonToolbar v-if="!isPictureGroup(image)" :label="t('image.tools')">
    <section class="picture-toolbar__group" role="group" :aria-label="t('image.insertMenu')">
      <div class="picture-toolbar__stack">
        <RibbonButton
          :label="t('image.replace')"
          :text="t('image.replace')"
          :disabled="
            disabled || selectionCount > 1 || (canReplace === undefined ? isFramed : !canReplace)
          "
          data-picture-tool="replace"
          @activate="replaceCallback"
          ><ImagePlus
        /></RibbonButton>
        <ImageInsertMenu
          compact
          :text="t('image.insertMenu')"
          :disabled="disabled"
          @insert-image="emit('insertImage', $event)"
        />
      </div>
    </section>
    <section class="picture-toolbar__group" role="group" :aria-label="t('image.crop')">
      <RibbonButton
        variant="tall"
        :label="t('image.crop')"
        :text="t('image.crop')"
        :disabled="disabled || selectionCount > 1 || (canCrop === undefined ? isFramed : !canCrop)"
        data-picture-tool="crop"
        @activate="cropCallback"
        ><Crop
      /></RibbonButton>
      <div class="picture-toolbar__stack">
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.widthPoints')">
          <span>{{ t("pictureFormat.sizeWidthPt") }}</span>
          <NumericField
            :key="sizeOwnerKey('width')"
            :owner-key="sizeOwnerKey('width')"
            :value="sizeValue('width')"
            :spec="sizeSpec"
            :label="t('image.widthPoints')"
            :disabled="sizeDisabled"
            :read-only="!resizeHandler"
            :reason="!resizeHandler ? t('picture.numericViewerReadOnly') : undefined"
            :hide-reason="!resizeHandler"
            :invalid-message="t('pictureFormat.outOfRange')"
            :rejected-message="t('picture.operationFailed')"
            :stale-message="t('pictureFormat.staleOwner')"
            :context-attributes="{ 'data-picture-size': 'width' }"
            presentation="column"
            :on-commit="numericCallbacks.width"
          />
        </div>
        <div class="picture-toolbar__dimension" role="group" :aria-label="t('image.heightPoints')">
          <span>{{ t("pictureFormat.sizeHeightPt") }}</span>
          <NumericField
            :key="sizeOwnerKey('height')"
            :owner-key="sizeOwnerKey('height')"
            :value="sizeValue('height')"
            :spec="sizeSpec"
            :label="t('image.heightPoints')"
            :disabled="sizeDisabled"
            :read-only="!resizeHandler"
            :reason="!resizeHandler ? t('picture.numericViewerReadOnly') : undefined"
            :hide-reason="!resizeHandler"
            :invalid-message="t('pictureFormat.outOfRange')"
            :rejected-message="t('picture.operationFailed')"
            :stale-message="t('pictureFormat.staleOwner')"
            :context-attributes="{ 'data-picture-size': 'height' }"
            presentation="column"
            :on-commit="numericCallbacks.height"
          />
        </div>
      </div>
      <span v-if="error" class="picture-toolbar__error" role="alert">{{ error }}</span>
      <span v-if="!resizeHandler" class="picture-toolbar__status" role="status">{{
        t("picture.numericViewerReadOnly")
      }}</span>
      <div class="picture-toolbar__stack">
        <TCheckbox
          :model-value="locked"
          :disabled="disabled || selectionCount > 1"
          @update:model-value="aspectRatio"
          >{{ t("image.lockAspectRatio") }}</TCheckbox
        >
        <RibbonButton
          :label="
            canRestore === false && restoreUnavailableReason
              ? `${t('image.restoreOriginal')}：${restoreUnavailableReason}`
              : t('image.restoreOriginal')
          "
          :text="t('image.restoreOriginal')"
          :disabled="
            disabled || selectionCount > 1 || canRestore === false || (isFramed && !restoreHandler)
          "
          data-picture-tool="restore"
          @activate="restoreCallback"
          ><RotateCcw
        /></RibbonButton>
      </div>
    </section>
    <PictureAppearanceTools
      ref="appearanceTools"
      :restore-effects-focus-target="restoreEffectsFocusTarget"
      :format-disabled="selectionCount !== 1"
      :key="appearanceDraftKey"
      :image="standaloneImage"
      :disabled="disabled"
      :effect-handler="effectHandler ? effectCallback : undefined"
      :appearance-commit-handler="appearanceHandler ? appearanceCallback : undefined"
      @change="appearanceCallback"
      @format="formatCallback"
    />
    <PictureRotationMenu
      :disabled="disabled"
      @rotate="(turns) => sourceAction(() => emit('rotate', turns))"
      @flip="(axis) => sourceAction(() => emit('flip', axis))"
    />
    <PictureArrangeTools
      compact
      :alignment-reference="alignmentReference"
      :group-create-disabled="groupCreateDisabled"
      :disabled="disabled"
      :group-disabled="false"
      :alignment-disabled="false"
      :grid-disabled="false"
      :count="selectionCount"
      :grouped="!!standaloneImage.groupId"
      @group="!groupCreateDisabled && sourceAction(() => emit('group'))"
      @ungroup="sourceAction(() => emit('ungroup'))"
      @align="arrangeCallbacks.align"
      @reference="arrangeCallbacks.reference"
      @layer="(action) => sourceAction(() => emit('layer', action))"
      @selection-pane="emit('selectionPane')"
    />
    <PictureViewMenu
      :disabled="!!busy"
      :preview-disabled="
        disabled || selectionCount > 1 || (canPreview === undefined ? isFramed : !canPreview)
      "
      :preview-on-double-click="previewOnDoubleClick"
      @preview="previewCallback"
      @change="emit('viewSettings', $event)"
    />
    <RibbonButton
      variant="tall"
      :label="t('image.convertToCell')"
      :text="t('image.convertToCell')"
      :disabled="disabled || selectionCount > 1 || canConvert === false"
      data-picture-tool="convert-to-cell"
      @activate="convertCallback"
      ><ImageDown
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('picture.annotate')"
      :text="t('picture.annotate')"
      :disabled="
        disabled || selectionCount > 1 || (canAnnotate === undefined ? isFramed : !canAnnotate)
      "
      data-picture-tool="annotate"
      @activate="annotationCallback"
      ><PencilLine
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('pictureFormat.paneTitle')"
      :text="t('pictureFormat.paneTitle')"
      :disabled="disabled || selectionCount !== 1"
      data-picture-tool="format"
      @activate="formatCallback"
      ><Settings2
    /></RibbonButton>
    <PictureAssetTools
      :disabled="disabled"
      :busy="!!busy"
      :owner-key="draftOwnerKey"
      :export-disabled="isFramed && !sizeAvailable"
      :print-disabled="isFramed"
      @compress="sourceAction(() => emit('compress'))"
      @batch-size="sourceAction(() => emit('batchSize'))"
      @export="(format, all) => sourceAction(() => emit('export', format, all))"
      @preview="previewCallback"
      @print="sourceAction(() => emit('print'))"
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
    gap: 4px;
    width: 150px;
    > :last-child {
      flex: 1;
      min-width: 0;
    }
    span {
      width: 42px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__status {
    max-width: 180px;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
    white-space: normal;
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
