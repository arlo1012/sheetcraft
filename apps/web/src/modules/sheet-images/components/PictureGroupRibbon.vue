<script setup lang="ts">
import { computed } from "vue";
import { SlidersHorizontal } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { ChangeContext } from "tdesign-vue-next/es/input-number/type";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { isPictureGroup, type PictureGroup } from "@sheetcraft/core";
import { MIN_FLOATING_IMAGE_SIZE, MAX_FLOATING_IMAGE_SIZE } from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
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
function points(axis: "width" | "height"): number | undefined {
  return sizeAvailable.value ? Math.round(props.geometry![axis] * 75) / 100 : undefined;
}
const numericCallbacks = computed(() => {
  const imageId = props.image.id;
  const draftOwnerKey = props.draftOwnerKey;
  const handler = props.resizeHandler;
  function commit(axis: "width" | "height", points: unknown): void {
    if (
      !isPictureGroup(props.image) ||
      imageId !== props.image.id ||
      draftOwnerKey !== props.draftOwnerKey ||
      handler !== props.resizeHandler ||
      !handler ||
      sizeDisabled.value ||
      typeof points !== "number" ||
      !Number.isFinite(points)
    )
      return;
    const pixels = (points * 4) / 3;
    if (pixels < MIN_FLOATING_IMAGE_SIZE || pixels > MAX_FLOATING_IMAGE_SIZE) return;
    handler({ axis, value: pixels });
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
          <span>{{ t("image.widthPoints") }}</span>
          <TInputNumber
            :key="`${image.id}:${draftOwnerKey}:width`"
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
        <div
          class="picture-group-ribbon__dimension"
          role="group"
          :aria-label="t('image.heightPoints')"
        >
          <span>{{ t("image.heightPoints") }}</span>
          <TInputNumber
            :key="`${image.id}:${draftOwnerKey}:height`"
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
      <TCheckbox
        :model-value="locked"
        :disabled="aspectRatioDisabled"
        @update:model-value="aspectRatioCallback"
        >{{ t("image.lockAspectRatio") }}</TCheckbox
      >
      <span v-if="error" class="picture-group-ribbon__error" role="alert">{{ error }}</span>
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
