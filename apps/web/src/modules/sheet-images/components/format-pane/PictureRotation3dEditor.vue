<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, type ComponentPublicInstance } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { Choice, PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureRotation3d } from "../../picture-effect-edit";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
} from "../../picture-effect-presets";
import PicturePresetGallery from "./PicturePresetGallery.vue";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  hidePreset?: boolean;
  value?: Choice<PictureRotation3d>;
  disabled?: boolean;
  /** Block projection values without trapping a safe None/Inherit reset. */
  valueDisabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureRotation3d> | undefined) => boolean;
}>();
const rotation = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() =>
  props.value === undefined
    ? "inherit"
    : props.value.kind === "none"
      ? "none"
      : props.value.value.projection,
);
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:rotation3d:mode`,
  disabled: () => !!props.disabled,
  root: () => root.value,
});
function setModeHost(element: Element | ComponentPublicInstance | null): void {
  modePopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const modeInputId = `picture-rotation3d-mode-${useId()}`;
const modeNative = computed(() => ({
  attributes: {
    id: modeInputId,
    role: "combobox",
    "aria-label": props.t("rotation3dSection"),
    "aria-expanded": String(modePopup.visible.value),
    "data-format-pane-history-control": "readonly-combobox",
  },
}));
let active = true;
onBeforeUnmount(() => {
  active = false;
});
const modes = computed(() => [
  { value: "inherit", label: props.t("effectDefaultNone") },
  { value: "none", label: props.t("effectNone") },
  { value: "parallel", label: props.t("projectionParallel"), disabled: props.valueDisabled },
  { value: "perspective", label: props.t("projectionPerspective"), disabled: props.valueDisabled },
  { value: "oblique", label: props.t("projectionOblique"), disabled: props.valueDisabled },
]);
const choose = computed(() => {
  const owner = props.ownerKey,
    apply = props.onCommit,
    current = rotation.value,
    valuesDisabled = props.valueDisabled;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== rotation.value ||
      valuesDisabled !== props.valueDisabled
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return (
      !props.valueDisabled &&
      (value === "parallel" || value === "perspective" || value === "oblique") &&
      apply({ kind: "value", value: createPictureRotation3d(value, current) })
    );
  };
});
function update(patch: Partial<PictureRotation3d>) {
  return (
    !!rotation.value &&
    !props.disabled &&
    !props.valueDisabled &&
    props.onCommit({ kind: "value", value: { ...rotation.value, ...patch } as PictureRotation3d })
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
    ownerKey: `${props.ownerKey}:rotation3d:${mode.value}`,
    value,
    label: props.t(label),
    onCommit,
    min,
    max,
    disabled: props.disabled || props.valueDisabled,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
const presetGroups = getPictureEffectPresetGroups("rotation3d");
const presetId = computed(() => findPictureEffectPresetId("rotation3d", props.value));
function selectPreset(id: string) {
  const value = getPictureEffectPreset("rotation3d", id);
  return !props.disabled && !props.valueDisabled && value !== undefined && props.onCommit(value);
}
</script>
<template>
  <div ref="root" class="picture-rotation3d-editor">
    <Teleport to="body"
      ><div :ref="setModeHost" data-picture-effect-mode-popup="rotation3d"
    /></Teleport>
    <PicturePresetGallery
      v-if="!hidePreset"
      :owner-key="ownerKey"
      :groups="presetGroups"
      :selected-id="presetId"
      :disabled="disabled || valueDisabled"
      :t="t"
      :on-select="selectPreset"
      :columns="4"
      :empty-label="mode === 'inherit' ? t('effectDefaultNone') : t('effectCustom')"
    />
    <PictureFormatField :label="t('projectionMode')"
      ><TSelect
        v-native-control="modeNative"
        :popup-visible="modePopup.visible.value"
        :popup-props="modePopup.popupProps"
        @popup-visible-change="modePopup.onVisibleChange.value"
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('rotation3dSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="rotation">
      <PicturePaintNumber
        v-bind="
          numberProps('rotation3dXDeg', rotation.xDeg, (xDeg) => update({ xDeg }), -3600, 3600)
        "
        unit="°"
      />
      <PicturePaintNumber
        v-bind="
          numberProps('rotation3dYDeg', rotation.yDeg, (yDeg) => update({ yDeg }), -3600, 3600)
        "
        unit="°"
      />
      <PicturePaintNumber
        v-bind="
          numberProps('rotation3dZDeg', rotation.zDeg, (zDeg) => update({ zDeg }), -3600, 3600)
        "
        unit="°"
      />
      <PicturePaintNumber
        v-if="rotation.projection === 'perspective'"
        v-bind="
          numberProps(
            'perspectiveDeg',
            rotation.perspectiveDeg,
            (perspectiveDeg) => update({ perspectiveDeg }),
            0,
            120,
          )
        "
        unit="°"
      />
      <template v-if="rotation.projection === 'oblique'">
        <PicturePaintNumber
          v-bind="
            numberProps(
              'projectionShearX',
              rotation.shearX * 100,
              (value) => update({ shearX: value / 100 }),
              -1600,
              1600,
            )
          "
          unit="%"
        />
        <PicturePaintNumber
          v-bind="
            numberProps(
              'projectionShearY',
              rotation.shearY * 100,
              (value) => update({ shearY: value / 100 }),
              -1600,
              1600,
            )
          "
          unit="%"
        />
      </template>
      <PicturePaintNumber
        v-bind="
          numberProps(
            'distanceFromGroundPt',
            rotation.distanceFromGroundPt,
            (distanceFromGroundPt) => update({ distanceFromGroundPt }),
            -4096,
            4096,
          )
        "
        unit="pt"
      />
    </template>
    <TButton
      variant="outline"
      size="small"
      :disabled="disabled"
      @click="onCommit({ kind: 'none' })"
      >{{ t("reset3dRotation") }}</TButton
    >
  </div>
</template>
<style scoped lang="scss">
.picture-rotation3d-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
