<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, type ComponentPublicInstance } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureGlow } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureGlow } from "../../picture-effect-edit";
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
  value?: Choice<PictureGlow>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureGlow> | undefined) => boolean;
}>();
const glow = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() => (props.value === undefined ? "inherit" : props.value.kind));
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:glow:mode`,
  disabled: () => !!props.disabled,
  root: () => root.value,
});
function setModeHost(element: Element | ComponentPublicInstance | null): void {
  modePopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const modeInputId = `picture-glow-mode-${useId()}`;
const modeNative = computed(() => ({
  attributes: {
    id: modeInputId,
    role: "combobox",
    "aria-label": props.t("glowSection"),
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
  { value: "value", label: props.t("effectCustom") },
]);
const choose = computed(() => {
  const owner = props.ownerKey,
    apply = props.onCommit,
    current = glow.value;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== glow.value
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return value === "value" && apply({ kind: "value", value: current ?? createPictureGlow() });
  };
});
function update(patch: Partial<PictureGlow>) {
  return (
    !!glow.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...glow.value, ...patch } })
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
    ownerKey: `${props.ownerKey}:glow:${mode.value}`,
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
const presetGroups = getPictureEffectPresetGroups("glow");
const presetId = computed(() => findPictureEffectPresetId("glow", props.value));
function selectPreset(id: string) {
  const value = getPictureEffectPreset("glow", id);
  return !props.disabled && value !== undefined && props.onCommit(value);
}
</script>
<template>
  <div ref="root" class="picture-glow-editor">
    <Teleport to="body"><div :ref="setModeHost" data-picture-effect-mode-popup="glow" /></Teleport>
    <PicturePresetGallery
      v-if="!hidePreset"
      :owner-key="ownerKey"
      :groups="presetGroups"
      :selected-id="presetId"
      :disabled="disabled"
      :t="t"
      :on-select="selectPreset"
      :columns="6"
      :empty-label="mode === 'inherit' ? t('effectDefaultNone') : t('effectCustom')"
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
        :aria-label="t('glowSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="glow">
      <PicturePaintColor
        :value="glow.color"
        :label="t('glowColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(color) => update({ color })"
      />
      <PicturePaintNumber
        v-bind="numberProps('glowSizePt', glow.sizePt, (sizePt) => update({ sizePt }), 0, 4096)"
        unit="pt"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'glowTransparencyPercent',
            (1 - glow.opacity) * 100,
            (value) => update({ opacity: 1 - value / 100 }),
            0,
            100,
          )
        "
        :display-precision="12"
        unit="%"
      />
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-glow-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
