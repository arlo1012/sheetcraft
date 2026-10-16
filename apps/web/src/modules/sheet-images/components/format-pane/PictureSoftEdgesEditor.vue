<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, type ComponentPublicInstance } from "vue";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureSoftEdges } from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import { createPictureSoftEdges } from "../../picture-effect-edit";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
} from "../../picture-effect-presets";
import GallerySection from "../../../../shared/gallery/GallerySection.vue";
import PicturePresetGallery from "./PicturePresetGallery.vue";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  hidePreset?: boolean;
  value?: Choice<PictureSoftEdges>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureSoftEdges> | undefined) => boolean;
}>();
const soft = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() => (props.value === undefined ? "inherit" : props.value.kind));
const root = ref<HTMLElement>();
const modePopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:softEdges:mode`,
  disabled: () => !!props.disabled,
  root: () => root.value,
});
function setModeHost(element: Element | ComponentPublicInstance | null): void {
  modePopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const modeInputId = `picture-softEdges-mode-${useId()}`;
const modeNative = computed(() => ({
  attributes: {
    id: modeInputId,
    role: "combobox",
    "aria-label": props.t("softEdgesSection"),
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
    current = soft.value;
  return (value: unknown) => {
    if (
      !active ||
      props.disabled ||
      owner !== props.ownerKey ||
      apply !== props.onCommit ||
      current !== soft.value
    )
      return false;
    if (value === "inherit") return apply(undefined);
    if (value === "none") return apply({ kind: "none" });
    return (
      value === "value" && apply({ kind: "value", value: current ?? createPictureSoftEdges() })
    );
  };
});
const presetGroups = getPictureEffectPresetGroups("softEdges");
const presetId = computed(() => findPictureEffectPresetId("softEdges", props.value));
function selectPreset(id: string) {
  const value = getPictureEffectPreset("softEdges", id);
  return !props.disabled && value !== undefined && props.onCommit(value);
}
</script>
<template>
  <div ref="root" class="picture-soft-edges-editor">
    <Teleport to="body"
      ><div :ref="setModeHost" data-picture-effect-mode-popup="softEdges"
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
        :aria-label="t('softEdgesSection')"
        @change="choose"
    /></PictureFormatField>
    <PicturePaintNumber
      v-if="soft"
      :owner-key="`${ownerKey}:softEdges:${mode}`"
      :value="soft.sizePt"
      :label="t('softEdgeSizePt')"
      unit="pt"
      :min="0"
      :max="4096"
      :disabled="disabled"
      :invalid-message="t('outOfRange')"
      :rejected-message="t('applyRejected')"
      :on-commit="(sizePt) => !disabled && onCommit({ kind: 'value', value: { sizePt } })"
    />
    <GallerySection v-if="soft" :title="t('preset')">
      <div class="picture-soft-edges-editor__presets">
        <button
          v-for="sizePt in [1, 2.5, 5, 10, 25, 50]"
          :key="sizePt"
          type="button"
          :disabled="disabled"
          :aria-pressed="soft.sizePt === sizePt"
          @click="onCommit({ kind: 'value', value: { sizePt } })"
        >
          {{ sizePt }} {{ t("unitPt") }}
        </button>
      </div>
    </GallerySection>
  </div>
</template>
<style scoped lang="scss">
@use "../../../../shared/gallery/gallery-choice" as gallery;
.picture-soft-edges-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  &__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  &__presets button {
    @include gallery.choice;
    font: inherit;
  }
}
</style>
