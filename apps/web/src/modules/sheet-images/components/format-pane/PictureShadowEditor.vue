<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, type ComponentPublicInstance } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureShadow, PictureAnchor } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureShadow } from "../../picture-effect-edit";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
} from "../../picture-effect-presets";
import PicturePresetGallery from "./PicturePresetGallery.vue";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
const props = defineProps<{
  ownerKey: string;
  hidePreset?: boolean;
  hideMode?: boolean;
  value?: Choice<PictureShadow>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureShadow> | undefined) => boolean;
}>();
const shadow = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() =>
  props.value === undefined
    ? "inherit"
    : props.value.kind === "none"
      ? "none"
      : props.value.value.kind,
);
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:shadow-mode`,
  disabled: () => !!props.disabled || !!props.hideMode,
  root: () => root.value,
});
const anchorPopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:shadow-anchor`,
  disabled: () => !!props.disabled || !shadow.value,
  root: () => root.value,
});
function setModeHost(element: Element | ComponentPublicInstance | null): void {
  modePopup.host.value = element instanceof HTMLElement ? element : undefined;
}
function setAnchorHost(element: Element | ComponentPublicInstance | null): void {
  anchorPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const fieldId = `picture-shadow-${useId()}`;
function nativeControl(field: "mode" | "anchor", popup: typeof modePopup) {
  return computed(() => ({
    attributes: {
      id: `${fieldId}-${field}`,
      role: "combobox",
      "aria-label": props.t(field === "mode" ? "shadowSection" : "shadowAnchor"),
      "aria-expanded": String(popup.visible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
  }));
}
const modeNative = nativeControl("mode", modePopup),
  anchorNative = nativeControl("anchor", anchorPopup);
let active = true;
onBeforeUnmount(() => {
  active = false;
});
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "outer", label: props.t("shadowOuter") },
  { value: "inner", label: props.t("shadowInner") },
  { value: "perspective", label: props.t("shadowPerspective") },
]);
const anchors: readonly { value: PictureAnchor; key: PictureFormatLabelKey }[] = [
  { value: "top-left", key: "alignTopLeft" },
  { value: "top", key: "alignTop" },
  { value: "top-right", key: "alignTopRight" },
  { value: "left", key: "alignLeft" },
  { value: "center", key: "alignCenter" },
  { value: "right", key: "alignRight" },
  { value: "bottom-left", key: "alignBottomLeft" },
  { value: "bottom", key: "alignBottom" },
  { value: "bottom-right", key: "alignBottomRight" },
];
const anchorOptions = computed(() =>
  anchors.map(({ value, key }) => ({ value, label: props.t(key) })),
);
const choose = computed(() => {
  const owner = props.ownerKey,
    apply = props.onCommit,
    current = shadow.value;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== shadow.value
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return (
      (value === "outer" || value === "inner" || value === "perspective") &&
      apply({ kind: "value", value: createPictureShadow(value, current) })
    );
  };
});
const changeAnchor = computed(() => {
  const owner = props.ownerKey,
    apply = props.onCommit,
    current = shadow.value;
  return (value: unknown) =>
    !props.disabled &&
    active &&
    owner === props.ownerKey &&
    apply === props.onCommit &&
    !!current &&
    current === shadow.value &&
    anchors.some((item) => item.value === value) &&
    apply({ kind: "value", value: { ...current, anchor: value as PictureAnchor } });
});
function update(patch: Partial<PictureShadow>) {
  return (
    !!shadow.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...shadow.value, ...patch } as PictureShadow })
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
    ownerKey: `${props.ownerKey}:shadow:${mode.value}`,
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
const presetGroups = getPictureEffectPresetGroups("shadow");
const presetId = computed(() => findPictureEffectPresetId("shadow", props.value));
function selectPreset(id: string) {
  const value = getPictureEffectPreset("shadow", id);
  return !props.disabled && value !== undefined && props.onCommit(value);
}
</script>
<template>
  <div ref="root" class="picture-shadow-editor">
    <Teleport to="body">
      <div :ref="setModeHost" data-picture-shadow-popup="mode" />
      <div :ref="setAnchorHost" data-picture-shadow-popup="anchor" />
    </Teleport>
    <PicturePresetGallery
      v-if="!hidePreset"
      :owner-key="ownerKey"
      :groups="presetGroups"
      :selected-id="presetId"
      :disabled="disabled"
      :t="t"
      :on-select="selectPreset"
      :columns="3"
      :empty-label="mode === 'inherit' ? t('effectInherit') : t('effectCustom')"
    />
    <PictureFormatField v-if="!hideMode" :label="t('effectMode')"
      ><TSelect
        v-native-control="modeNative"
        :popup-visible="modePopup.visible.value"
        :popup-props="modePopup.popupProps"
        @popup-visible-change="modePopup.onVisibleChange.value"
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('shadowSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="shadow">
      <PicturePaintColor
        :value="shadow.color"
        :label="t('shadowColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(color) => update({ color })"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'shadowTransparencyPercent',
            (1 - shadow.opacity) * 100,
            (value) => update({ opacity: 1 - value / 100 }),
            0,
            100,
          )
        "
        :display-precision="12"
        unit="%"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'shadowSizePercent',
            shadow.scale * 100,
            (value) => update({ scale: value / 100 }),
            0.001,
            1600,
          )
        "
        unit="%"
      />
      <PicturePaintNumber
        v-bind="numberProps('shadowBlurPt', shadow.blurPt, (blurPt) => update({ blurPt }), 0, 4096)"
        :display-precision="2"
        unit="pt"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'shadowDistancePt',
            shadow.distancePt,
            (distancePt) => update({ distancePt }),
            0,
            4096,
          )
        "
        :display-precision="2"
        unit="pt"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'shadowAngleDeg',
            shadow.angleDeg,
            (angleDeg) => update({ angleDeg }),
            -3600,
            3600,
          )
        "
        :display-precision="2"
        unit="°"
      />
      <PictureFormatField :label="t('shadowAnchor')"
        ><TSelect
          v-native-control="anchorNative"
          :popup-visible="anchorPopup.visible.value"
          :popup-props="anchorPopup.popupProps"
          @popup-visible-change="anchorPopup.onVisibleChange.value"
          :model-value="shadow.anchor"
          :options="anchorOptions"
          :disabled="disabled"
          size="small"
          :aria-label="t('shadowAnchor')"
          @change="changeAnchor"
      /></PictureFormatField>
      <template v-if="shadow.kind === 'perspective'">
        <PicturePaintNumber
          v-bind="
            numberProps(
              'shadowScaleX',
              shadow.scaleX * 100,
              (value) => update({ scaleX: value / 100 }),
              0.001,
              1600,
            )
          "
          unit="%"
        />
        <PicturePaintNumber
          v-bind="
            numberProps(
              'shadowScaleY',
              shadow.scaleY * 100,
              (value) => update({ scaleY: value / 100 }),
              0.001,
              1600,
            )
          "
          unit="%"
        />
        <PicturePaintNumber
          v-bind="
            numberProps('shadowSkew', shadow.skewXDeg, (skewXDeg) => update({ skewXDeg }), -80, 80)
          "
          :display-precision="2"
          unit="°"
        />
        <PicturePaintNumber
          v-bind="
            numberProps(
              'shadowOriginX',
              shadow.originX * 100,
              (value) => update({ originX: value / 100 }),
              0,
              100,
            )
          "
          unit="%"
        />
        <PicturePaintNumber
          v-bind="
            numberProps(
              'shadowOriginY',
              shadow.originY * 100,
              (value) => update({ originY: value / 100 }),
              0,
              100,
            )
          "
          unit="%"
        />
      </template>
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-shadow-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
