<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureLine, PicturePaint } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureLine } from "../../picture-effect-edit";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintEditor from "./PicturePaintEditor.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PictureLine>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  sourceAssetId?: string;
  loadAsset?: (blob: Blob) => Promise<string | undefined>;
  onCommit: (value: Choice<PictureLine> | undefined) => boolean;
}>();
const line = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const paint = computed(() =>
  props.value?.kind === "value"
    ? { kind: "value" as const, value: props.value.value.paint }
    : props.value,
);
function applyPaint(value: Choice<PicturePaint> | undefined) {
  return value?.kind === "value"
    ? props.onCommit({
        kind: "value",
        value: { ...(line.value ?? createPictureLine()), paint: value.value },
      })
    : props.onCommit(value);
}
function update(patch: Partial<PictureLine>) {
  return (
    !!line.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...line.value, ...patch } })
  );
}
function numberProps(
  label: PictureFormatLabelKey,
  value: number,
  onCommit: (value: number) => boolean,
  min: number,
  max: number,
) {
  return {
    ownerKey: props.ownerKey,
    value,
    label: props.t(label),
    onCommit,
    min,
    max,
    disabled: props.disabled,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
const compound = computed(() => [
  { value: "single", label: props.t("lineSingle") },
  { value: "double", label: props.t("lineDouble") },
  { value: "thick-thin", label: props.t("lineThickThin") },
  { value: "thin-thick", label: props.t("lineThinThick") },
  { value: "triple", label: props.t("lineTriple") },
]);
const dash = computed(() => [
  { value: "solid", label: props.t("dashSolid") },
  { value: "round-dot", label: props.t("dashRoundDot") },
  { value: "square-dot", label: props.t("dashSquareDot") },
  { value: "dash", label: props.t("dashDash") },
  { value: "short-dash", label: props.t("dashShort") },
  { value: "long-dash", label: props.t("dashLong") },
  { value: "long-dash-dot", label: props.t("dashLongDot") },
  { value: "long-dash-dot-dot", label: props.t("dashLongDotDot") },
]);
const caps = computed(() => [
  { value: "butt", label: props.t("capButt") },
  { value: "round", label: props.t("capRound") },
  { value: "square", label: props.t("capSquare") },
]);
const joins = computed(() => [
  { value: "round", label: props.t("joinRound") },
  { value: "bevel", label: props.t("joinBevel") },
  { value: "miter", label: props.t("joinMiter") },
]);
function select<K extends "compound" | "dash" | "cap" | "join">(
  field: K,
  value: unknown,
  choices: readonly { value: string }[],
) {
  if (typeof value === "string" && choices.some((item) => item.value === value))
    update({ [field]: value as PictureLine[K] });
}
</script>
<template>
  <div class="picture-line-editor">
    <PicturePaintEditor
      :owner-key="ownerKey"
      :value="paint"
      :disabled="disabled"
      :t="t"
      :source-asset-id="sourceAssetId"
      :load-asset="loadAsset"
      :on-commit="applyPaint"
    />
    <template v-if="line">
      <PicturePaintNumber
        v-bind="numberProps('lineWidthPt', line.widthPt, (widthPt) => update({ widthPt }), 0, 4096)"
        unit="pt"
      />
      <PictureFormatField :label="t('lineCompound')"
        ><TSelect
          :model-value="line.compound"
          :options="compound"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineCompound')"
          @change="select('compound', $event, compound)"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineDash')"
        ><TSelect
          :model-value="line.dash"
          :options="dash"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineDash')"
          @change="select('dash', $event, dash)"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineCap')"
        ><TSelect
          :model-value="line.cap"
          :options="caps"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineCap')"
          @change="select('cap', $event, caps)"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineJoin')"
        ><TSelect
          :model-value="line.join"
          :options="joins"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineJoin')"
          @change="select('join', $event, joins)"
      /></PictureFormatField>
      <PicturePaintNumber
        v-if="line.join === 'miter'"
        v-bind="
          numberProps(
            'lineMiterLimit',
            line.miterLimit,
            (miterLimit) => update({ miterLimit }),
            1,
            1000,
          )
        "
      />
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-line-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
