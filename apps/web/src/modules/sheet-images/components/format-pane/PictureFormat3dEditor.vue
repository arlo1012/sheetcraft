<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
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
import { PICTURE_MATERIAL_GALLERY, PICTURE_LIGHTING_GALLERY } from "../../picture-material-presets";
import PicturePresetGallery from "./PicturePresetGallery.vue";
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
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:format3d:mode`,
  disabled: () => !!props.disabled,
  root: () => root.value,
});
const modeHost = modePopup.host;
const modeInputId = `picture-format3d-mode-${useId()}`;
const modeNative = computed(() => ({
  attributes: {
    id: modeInputId,
    role: "combobox",
    "aria-label": props.t("format3dSection"),
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
    current = format.value;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== format.value
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return value === "value" && apply({ kind: "value", value: current ?? createPictureFormat3d() });
  };
});
function update(patch: Partial<PictureFormat3d>) {
  return (
    !!format.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...format.value, ...patch } })
  );
}
function selectMaterial(id: string): boolean {
  return (
    PICTURE_MATERIAL_IDS.includes(id as PictureFormat3d["material"]) &&
    update({ material: id as PictureFormat3d["material"] })
  );
}
function selectLighting(id: string): boolean {
  return (
    PICTURE_LIGHTING_IDS.includes(id as PictureFormat3d["lighting"]) &&
    update({ lighting: id as PictureFormat3d["lighting"] })
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
  <div ref="root" class="picture-format3d-editor">
    <Teleport to="body"><div ref="modeHost" data-picture-effect-mode-popup="format3d" /></Teleport>
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
      <PicturePresetGallery
        :owner-key="ownerKey"
        :groups="PICTURE_MATERIAL_GALLERY"
        :selected-id="format.material"
        :label="t('material')"
        :t="t"
        :disabled="disabled"
        :columns="4"
        :on-select="selectMaterial"
      />
      <PicturePresetGallery
        :owner-key="ownerKey"
        :groups="PICTURE_LIGHTING_GALLERY"
        :selected-id="format.lighting"
        :label="t('lighting')"
        :t="t"
        :disabled="disabled"
        :columns="4"
        :on-select="selectLighting"
      />
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
