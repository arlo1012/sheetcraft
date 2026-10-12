<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { Choice, PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureRotation3d } from "../../picture-effect-edit";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PictureRotation3d>;
  disabled?: boolean;
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
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "parallel", label: props.t("projectionParallel") },
  { value: "perspective", label: props.t("projectionPerspective") },
  { value: "oblique", label: props.t("projectionOblique") },
]);
function choose(value: unknown) {
  if (props.disabled) return;
  if (value === "inherit") props.onCommit(undefined);
  else if (value === "none") props.onCommit({ kind: "none" });
  else if (value === "parallel" || value === "perspective" || value === "oblique")
    props.onCommit({ kind: "value", value: createPictureRotation3d(value, rotation.value) });
}
function update(patch: Partial<PictureRotation3d>) {
  return (
    !!rotation.value &&
    !props.disabled &&
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
    disabled: props.disabled,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
</script>
<template>
  <div class="picture-rotation3d-editor">
    <PictureFormatField :label="t('projectionMode')"
      ><TSelect
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
