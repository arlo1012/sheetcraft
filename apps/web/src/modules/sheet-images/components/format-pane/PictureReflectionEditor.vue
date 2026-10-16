<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureReflection } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureReflection } from "../../picture-effect-edit";
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
  value?: Choice<PictureReflection>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureReflection> | undefined) => boolean;
}>();
const reflection = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() => (props.value === undefined ? "inherit" : props.value.kind));
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:reflection:mode`,
  disabled: () => !!props.disabled,
  root: () => root.value,
});
const modeHost = modePopup.host;
const modeInputId = `picture-reflection-mode-${useId()}`;
const modeNative = computed(() => ({
  attributes: {
    id: modeInputId,
    role: "combobox",
    "aria-label": props.t("reflectionSection"),
    "aria-expanded": String(modePopup.visible.value),
    "data-format-pane-history-control": "readonly-combobox",
  },
}));
let active = true;
onBeforeUnmount(() => {
  active = false;
});
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "value", label: props.t("effectCustom") },
]);
const choose = computed(() => {
  const owner = props.ownerKey,
    apply = props.onCommit,
    current = reflection.value;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== reflection.value
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return (
      value === "value" && apply({ kind: "value", value: current ?? createPictureReflection() })
    );
  };
});
function update(patch: Partial<PictureReflection>) {
  return (
    !!reflection.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...reflection.value, ...patch } })
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
    ownerKey: `${props.ownerKey}:reflection:${mode.value}`,
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
const presetGroups = getPictureEffectPresetGroups("reflection");
const presetId = computed(() => findPictureEffectPresetId("reflection", props.value));
function selectPreset(id: string) {
  const value = getPictureEffectPreset("reflection", id);
  return !props.disabled && value !== undefined && props.onCommit(value);
}
</script>
<template>
  <div ref="root" class="picture-reflection-editor">
    <Teleport to="body"
      ><div ref="modeHost" data-picture-effect-mode-popup="reflection"
    /></Teleport>
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
    <PictureFormatField :label="t('effectMode')"
      ><TSelect
        v-native-control="modeNative"
        :popup-visible="modePopup.visible.value"
        :popup-props="modePopup.popupProps"
        @popup-visible-change="modePopup.onVisibleChange.value"
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('reflectionSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="reflection">
      <PicturePaintNumber
        v-bind="
          numberProps(
            'reflectionSizePercent',
            reflection.size * 100,
            (value) => update({ size: value / 100 }),
            0,
            100,
          )
        "
        unit="%"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'reflectionTransparencyPercent',
            (1 - reflection.opacity) * 100,
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
            'reflectionBlurPt',
            reflection.blurPt,
            (blurPt) => update({ blurPt }),
            0,
            4096,
          )
        "
        unit="pt"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'reflectionDistancePt',
            reflection.distancePt,
            (distancePt) => update({ distancePt }),
            0,
            4096,
          )
        "
        unit="pt"
      />
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-reflection-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
