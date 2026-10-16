<script setup lang="ts">
import { computed } from "vue";
import { SlidersHorizontal } from "lucide-vue-next";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { isPictureGroup, type PictureGroup } from "@sheetcraft/core";
import { MIN_FLOATING_IMAGE_SIZE, MAX_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
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
import PictureRotationMenu from "./PictureRotationMenu.vue";
import PictureAssetTools from "./PictureAssetTools.vue";
import PictureArrangeTools from "./PictureArrangeTools.vue";
import type {
  PictureAlignment,
  PictureAlignmentReference,
  PictureLayerAction,
} from "../usePictureTools";
import type { PictureSizeEdit, PictureToolGeometry } from "../picture-tool-geometry";

const props = defineProps<{
  image: PictureGroup;
  geometry?: PictureToolGeometry;
  draftOwnerKey?: number;
  error?: string;
  disabled: boolean;
  groupCreateDisabled?: boolean;
  selectionCount: number;
  alignmentReference?: PictureAlignmentReference;
  resizeHandler?: (edit: PictureSizeEdit) => boolean;
  aspectRatioHandler?: (locked: boolean) => boolean;
}>();
const emit = defineEmits<{
  compress: [];
  batchSize: [];
  group: [];
  ungroup: [];
  align: [action: PictureAlignment, reference: PictureAlignmentReference];
  reference: [reference: PictureAlignmentReference];
  layer: [action: PictureLayerAction];
  selectionPane: [];
  format: [];
  rotate: [turns: -1 | 1 | 2];
  flip: [axis: "horizontal" | "vertical"];
}>();
const { t } = useAppI18n();
const locked = computed(() => props.image.lockAspectRatio ?? false);
const sizeAvailable = computed(
  () =>
    !!props.geometry &&
    [props.geometry.width, props.geometry.height].every(
      (value) => Number.isFinite(value) && value > 0,
    ),
);
const sizeDisabled = computed(
  () => props.disabled || props.selectionCount > 1 || !sizeAvailable.value || !props.resizeHandler,
);
const aspectRatioDisabled = computed(
  () => props.disabled || props.selectionCount > 1 || !props.aspectRatioHandler,
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
  return sizeAvailable.value ? { kind: "value", value: props.geometry![axis] } : { kind: "empty" };
}
function sizeOwnerKey(axis: "width" | "height"): string {
  return `${props.draftOwnerKey}:${props.image.id}:${axis}`;
}
const numericCallbacks = computed(() => {
  const imageId = props.image.id,
    owner = props.draftOwnerKey,
    handler = props.resizeHandler;
  function commit(axis: "width" | "height", candidate: NumericCandidate): NumericCommitResult {
    if (
      !isPictureGroup(props.image) ||
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
const aspectRatioCallback = computed(() => {
  const imageId = props.image.id;
  const draftOwnerKey = props.draftOwnerKey;
  const handler = props.aspectRatioHandler;
  return (locked: unknown): void => {
    if (
      !isPictureGroup(props.image) ||
      imageId !== props.image.id ||
      draftOwnerKey !== props.draftOwnerKey ||
      handler !== props.aspectRatioHandler ||
      !handler ||
      aspectRatioDisabled.value ||
      typeof locked !== "boolean"
    )
      return;
    handler(locked);
  };
});
const actionCallbacks = computed(() => {
  const imageId = props.image.id;
  const draftOwnerKey = props.draftOwnerKey;
  function currentOwner(): boolean {
    return (
      isPictureGroup(props.image) &&
      imageId === props.image.id &&
      draftOwnerKey === props.draftOwnerKey
    );
  }
  function action(callback: () => void): void {
    if (!props.disabled && currentOwner()) callback();
  }
  return {
    compress: () => action(() => emit("compress")),
    batchSize: () => action(() => emit("batchSize")),
    group: () => {
      if (!props.groupCreateDisabled) action(() => emit("group"));
    },
    ungroup: () => action(() => emit("ungroup")),
    align: (alignment: PictureAlignment, reference: PictureAlignmentReference) =>
      action(() => emit("align", alignment, reference)),
    reference: (reference: PictureAlignmentReference) => action(() => emit("reference", reference)),
    layer: (layer: PictureLayerAction) => action(() => emit("layer", layer)),
    rotate: (turns: -1 | 1 | 2) => action(() => emit("rotate", turns)),
    flip: (axis: "horizontal" | "vertical") => action(() => emit("flip", axis)),
    format: () => action(() => emit("format")),
    selectionPane: () => {
      if (currentOwner()) emit("selectionPane");
    },
  };
});
</script>

<template>
  <RibbonToolbar :label="t('image.tools')" data-picture-group-ribbon>
    <section
      class="picture-group-ribbon__group"
      role="group"
      :aria-label="t('pictureFormat.sizeSection')"
    >
      <div class="picture-group-ribbon__stack">
        <div
          class="picture-group-ribbon__dimension"
          role="group"
          :aria-label="t('image.widthPoints')"
        >
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
        <div
          class="picture-group-ribbon__dimension"
          role="group"
          :aria-label="t('image.heightPoints')"
        >
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
      <TCheckbox
        :model-value="locked"
        :disabled="aspectRatioDisabled"
        @update:model-value="aspectRatioCallback"
        >{{ t("image.lockAspectRatio") }}</TCheckbox
      >
      <span v-if="error" class="picture-group-ribbon__error" role="alert">{{ error }}</span>
      <span v-if="!resizeHandler" class="picture-group-ribbon__status" role="status">{{
        t("picture.numericViewerReadOnly")
      }}</span>
    </section>
    <PictureRotationMenu
      :key="`${image.id}:${draftOwnerKey}:rotation`"
      :disabled="disabled"
      @rotate="actionCallbacks.rotate"
      @flip="actionCallbacks.flip"
    />
    <PictureAssetTools
      :disabled="disabled"
      :busy="disabled"
      export-disabled
      print-disabled
      @compress="actionCallbacks.compress"
      @batch-size="actionCallbacks.batchSize"
    />
    <PictureArrangeTools
      compact
      :alignment-reference="alignmentReference"
      :group-create-disabled="groupCreateDisabled"
      :grid-disabled="false"
      :key="`${image.id}:${draftOwnerKey}:arrange`"
      :disabled="disabled"
      :count="selectionCount"
      grouped
      @group="actionCallbacks.group"
      @ungroup="actionCallbacks.ungroup"
      @align="actionCallbacks.align"
      @reference="actionCallbacks.reference"
      @layer="actionCallbacks.layer"
      @selection-pane="actionCallbacks.selectionPane"
    />
    <RibbonButton
      variant="tall"
      :label="t('pictureFormat.paneTitle')"
      :text="t('pictureFormat.paneTitle')"
      :disabled="disabled"
      data-picture-group-action="format"
      @activate="actionCallbacks.format"
      ><SlidersHorizontal
    /></RibbonButton>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-group-ribbon {
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
