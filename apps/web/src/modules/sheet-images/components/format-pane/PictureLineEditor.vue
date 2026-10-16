<script setup lang="ts">
import type { PictureTextureId } from "../../picture-texture";
import { computed, onBeforeUnmount, ref, useId, type ComponentPublicInstance } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
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
  focusOwnerKey?: string;
  value?: Choice<PictureLine>;
  mixed?: boolean;
  disabled?: boolean;
  t: PictureFormatTranslate;
  sourceAssetId?: string;
  loadAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
  onCommit: (value: Choice<PictureLine> | undefined) => boolean;
}>();
const line = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const paint = computed(() =>
  props.value?.kind === "value"
    ? { kind: "value" as const, value: props.value.value.paint }
    : props.value,
);
let active = true;
onBeforeUnmount(() => {
  active = false;
});
const root = ref<HTMLElement>();
function linePopup() {
  return useNativePopupOwnership({
    owner: () => props.ownerKey,
    disabled: () => !!props.disabled || !line.value,
    root: () => root.value,
  });
}
const compoundPopup = linePopup();
const dashPopup = linePopup();
const capPopup = linePopup();
const joinPopup = linePopup();
function setCompoundHost(element: Element | ComponentPublicInstance | null): void {
  compoundPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
function setDashHost(element: Element | ComponentPublicInstance | null): void {
  dashPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
function setCapHost(element: Element | ComponentPublicInstance | null): void {
  capPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
function setJoinHost(element: Element | ComponentPublicInstance | null): void {
  joinPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const fieldId = `picture-line-${useId()}`;
function nativeControl(field: string, popup: ReturnType<typeof linePopup>) {
  return computed(() => ({
    attributes: {
      id: `${fieldId}-${field}`,
      role: "combobox",
      "aria-label": props.t(field as PictureFormatLabelKey),
      "aria-expanded": String(popup.visible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
  }));
}
const compoundNative = nativeControl("lineCompound", compoundPopup);
const dashNative = nativeControl("lineDash", dashPopup);
const capNative = nativeControl("lineCap", capPopup);
const joinNative = nativeControl("lineJoin", joinPopup);
const applyPaint = computed(() => {
  const key = props.ownerKey,
    apply = props.onCommit,
    currentLine = line.value;
  return (value: Choice<PicturePaint> | undefined) => {
    if (!active || props.disabled || key !== props.ownerKey || apply !== props.onCommit)
      return false;
    return value?.kind === "value"
      ? apply({
          kind: "value",
          value: { ...(currentLine ?? createPictureLine()), paint: value.value },
        })
      : apply(value);
  };
});
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
function selectAction<K extends "compound" | "dash" | "cap" | "join">(
  field: K,
  choices: () => readonly { value: string }[],
) {
  return computed(() => {
    const key = props.ownerKey,
      apply = props.onCommit,
      currentLine = line.value,
      options = choices();
    return (value: unknown) => {
      if (
        !active ||
        props.disabled ||
        key !== props.ownerKey ||
        apply !== props.onCommit ||
        !currentLine ||
        currentLine !== line.value
      )
        return false;
      return (
        typeof value === "string" &&
        options.some((item) => item.value === value) &&
        apply({ kind: "value", value: { ...currentLine, [field]: value as PictureLine[K] } })
      );
    };
  });
}
const changeCompound = selectAction("compound", () => compound.value);
const changeDash = selectAction("dash", () => dash.value);
const changeCap = selectAction("cap", () => caps.value);
const changeJoin = selectAction("join", () => joins.value);
</script>
<template>
  <div ref="root" class="picture-line-editor">
    <Teleport to="body">
      <div :ref="setCompoundHost" data-picture-line-popup="compound" />
      <div :ref="setDashHost" data-picture-line-popup="dash" />
      <div :ref="setCapHost" data-picture-line-popup="cap" />
      <div :ref="setJoinHost" data-picture-line-popup="join" />
    </Teleport>
    <PicturePaintEditor
      paint-role="line"
      :owner-key="ownerKey"
      :focus-owner-key="focusOwnerKey"
      :value="paint"
      :mixed="mixed"
      :disabled="disabled"
      :t="t"
      :source-asset-id="sourceAssetId"
      :load-asset="loadAsset"
      :on-commit="applyPaint"
    />
    <template v-if="line">
      <PicturePaintNumber
        v-bind="numberProps('lineWidthPt', line.widthPt, (widthPt) => update({ widthPt }), 0, 4096)"
        :step="0.25"
        unit="pt"
      />
      <PictureFormatField :label="t('lineCompound')"
        ><TSelect
          v-native-control="compoundNative"
          :popup-visible="compoundPopup.visible.value"
          :popup-props="compoundPopup.popupProps"
          @popup-visible-change="compoundPopup.onVisibleChange.value"
          :model-value="line.compound"
          :options="compound"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineCompound')"
          @change="changeCompound"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineDash')"
        ><TSelect
          v-native-control="dashNative"
          :popup-visible="dashPopup.visible.value"
          :popup-props="dashPopup.popupProps"
          @popup-visible-change="dashPopup.onVisibleChange.value"
          :model-value="line.dash"
          :options="dash"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineDash')"
          @change="changeDash"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineCap')"
        ><TSelect
          v-native-control="capNative"
          :popup-visible="capPopup.visible.value"
          :popup-props="capPopup.popupProps"
          @popup-visible-change="capPopup.onVisibleChange.value"
          :model-value="line.cap"
          :options="caps"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineCap')"
          @change="changeCap"
      /></PictureFormatField>
      <PictureFormatField :label="t('lineJoin')"
        ><TSelect
          v-native-control="joinNative"
          :popup-visible="joinPopup.visible.value"
          :popup-props="joinPopup.popupProps"
          @popup-visible-change="joinPopup.onVisibleChange.value"
          :model-value="line.join"
          :options="joins"
          :disabled="disabled"
          size="small"
          :aria-label="t('lineJoin')"
          @change="changeJoin"
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
