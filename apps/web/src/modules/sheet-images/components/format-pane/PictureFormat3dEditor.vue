<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import {
  PICTURE_MATERIAL_IDS,
  PICTURE_LIGHTING_IDS,
  type Choice,
  type PictureFormat3d,
} from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { PICTURE_MATERIAL_LABELS, PICTURE_LIGHTING_LABELS } from "../../picture-effect-options";
import { createPictureFormat3d } from "../../picture-effect-edit";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PictureFormat3d>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureFormat3d> | undefined) => boolean;
}>();
const format = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() => (props.value === undefined ? "inherit" : props.value.kind));
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "value", label: props.t("effectCustom") },
]);
const materials = computed(() =>
  PICTURE_MATERIAL_IDS.map((value) => ({ value, label: props.t(PICTURE_MATERIAL_LABELS[value]) })),
);
const lighting = computed(() =>
  PICTURE_LIGHTING_IDS.map((value) => ({ value, label: props.t(PICTURE_LIGHTING_LABELS[value]) })),
);
function choose(value: unknown) {
  if (props.disabled) return;
  if (value === "inherit") props.onCommit(undefined);
  else if (value === "none") props.onCommit({ kind: "none" });
  else if (value === "value")
    props.onCommit({ kind: "value", value: format.value ?? createPictureFormat3d() });
}
function update(patch: Partial<PictureFormat3d>) {
  return (
    !!format.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...format.value, ...patch } })
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
    ownerKey: `${props.ownerKey}:format3d:${mode.value}`,
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
  <div class="picture-format3d-editor">
    <PictureFormatField :label="t('effectMode')"
      ><TSelect
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('format3dSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="format">
      <h3>{{ t("depthSection") }}</h3>
      <PicturePaintColor
        :value="format.depthColor"
        :label="t('depthColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(depthColor) => update({ depthColor })"
      />
      <PicturePaintNumber
        v-bind="
          numberProps('depthSizePt', format.depthPt, (depthPt) => update({ depthPt }), 0, 4096)
        "
        unit="pt"
      />
      <h3>{{ t("contourSection") }}</h3>
      <PicturePaintColor
        :value="format.contourColor"
        :label="t('contourColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(contourColor) => update({ contourColor })"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'contourSizePt',
            format.contourPt,
            (contourPt) => update({ contourPt }),
            0,
            4096,
          )
        "
        unit="pt"
      />
      <PictureFormatField :label="t('material')"
        ><TSelect
          :model-value="format.material"
          :options="materials"
          :disabled="disabled"
          size="small"
          :aria-label="t('material')"
          @change="
            (value) =>
              PICTURE_MATERIAL_IDS.includes(value as PictureFormat3d['material']) &&
              update({ material: value as PictureFormat3d['material'] })
          "
      /></PictureFormatField>
      <PictureFormatField :label="t('lighting')"
        ><TSelect
          :model-value="format.lighting"
          :options="lighting"
          :disabled="disabled"
          size="small"
          :aria-label="t('lighting')"
          @change="
            (value) =>
              PICTURE_LIGHTING_IDS.includes(value as PictureFormat3d['lighting']) &&
              update({ lighting: value as PictureFormat3d['lighting'] })
          "
      /></PictureFormatField>
      <PicturePaintNumber
        v-bind="
          numberProps(
            'lightingAngleDeg',
            format.lightingAngleDeg,
            (lightingAngleDeg) => update({ lightingAngleDeg }),
            -3600,
            3600,
          )
        "
        unit="°"
      />
    </template>
    <TButton
      variant="outline"
      size="small"
      :disabled="disabled"
      @click="onCommit({ kind: 'none' })"
      >{{ t("reset3dFormat") }}</TButton
    >
  </div>
</template>
<style scoped lang="scss">
.picture-format3d-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  h3 {
    margin: 4px 0 0;
    font: inherit;
    font-weight: 600;
  }
}
</style>
