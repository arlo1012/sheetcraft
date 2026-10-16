<script setup lang="ts">
import { computed } from "vue";
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
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "value", label: props.t("effectCustom") },
]);
function choose(value: unknown) {
  if (props.disabled) return;
  if (value === "inherit") props.onCommit(undefined);
  else if (value === "none") props.onCommit({ kind: "none" });
  else if (value === "value")
    props.onCommit({ kind: "value", value: reflection.value ?? createPictureReflection() });
}
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
  <div class="picture-reflection-editor">
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
