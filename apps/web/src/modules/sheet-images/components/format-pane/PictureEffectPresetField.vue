<script setup lang="ts">
import { computed } from "vue";
import type { PicturePresetCategory } from "../../picture-effect-presets";
import {
  getPictureEffectPresetGroups,
  getPictureEffectPreset,
  findPictureEffectPresetId,
} from "../../picture-effect-presets";
import type { PictureFormatLabelKey } from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PicturePresetGallery from "./PicturePresetGallery.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  category: PicturePresetCategory;
}>();
const categoryLabel: Record<PicturePresetCategory, PictureFormatLabelKey> = {
  shadow: "shadowSection",
  reflection: "reflectionSection",
  glow: "glowSection",
  softEdges: "softEdgesSection",
  rotation3d: "rotation3dSection",
};
// Keep the category and its owner-bound callback correlated through selection.
const categorizedBinding = computed(() => {
  switch (props.category) {
    case "shadow":
      return { category: "shadow" as const, binding: props.controller.detailed("shadow") };
    case "reflection":
      return { category: "reflection" as const, binding: props.controller.detailed("reflection") };
    case "glow":
      return { category: "glow" as const, binding: props.controller.detailed("glow") };
    case "softEdges":
      return { category: "softEdges" as const, binding: props.controller.detailed("softEdges") };
    case "rotation3d":
      return { category: "rotation3d" as const, binding: props.controller.detailed("rotation3d") };
  }
});
const binding = computed(() => categorizedBinding.value.binding);
// No-op snapshot/value refreshes do not replace a live gallery's action.
// Keep the original guarded apply: it validates its captured owner and onIntent,
// while constructing an accepted same-owner command against the current revision.
const inheritBinding = computed(
  (previous: { ownerKey: string; apply: () => boolean } | undefined) => {
    const source = categorizedBinding.value.binding;
    return previous?.ownerKey === source.ownerKey
      ? previous
      : { ownerKey: source.ownerKey, apply: () => source.apply(undefined) };
  },
);
const inheritAction = computed(() => inheritBinding.value.apply);
// These categories currently have no theme effect to inherit. Keep undefined as
// the stored default; only its display label differs from inheritable effects.
const defaultLabel = computed(() =>
  props.category === "glow" || props.category === "softEdges" || props.category === "rotation3d"
    ? "effectDefaultNone"
    : "effectInherit",
);
const groups = computed(() => getPictureEffectPresetGroups(props.category));
const selected = computed(() => findPictureEffectPresetId(props.category, binding.value.value));
function select(id: string): boolean {
  const current = categorizedBinding.value;
  if (current.binding.disabled) return false;
  switch (current.category) {
    case "shadow": {
      const value = getPictureEffectPreset("shadow", id);
      return value !== undefined && current.binding.apply(value);
    }
    case "reflection": {
      const value = getPictureEffectPreset("reflection", id);
      return value !== undefined && current.binding.apply(value);
    }
    case "glow": {
      const value = getPictureEffectPreset("glow", id);
      return value !== undefined && current.binding.apply(value);
    }
    case "softEdges": {
      const value = getPictureEffectPreset("softEdges", id);
      return value !== undefined && current.binding.apply(value);
    }
    case "rotation3d": {
      const value = getPictureEffectPreset("rotation3d", id);
      return value !== undefined && current.binding.apply(value);
    }
  }
}
</script>
<template>
  <PicturePresetGallery
    inline
    :label="controller.t(categoryLabel[category])"
    :owner-key="binding.ownerKey"
    :groups="groups"
    :selected-id="selected"
    :disabled="binding.disabled"
    :reason="binding.reason"
    :error="binding.error"
    :t="controller.t"
    :on-select="select"
    :on-inherit="category === 'shadow' ? inheritAction : undefined"
    :columns="category === 'glow' ? 6 : category === 'rotation3d' ? 4 : 3"
    :empty-label="
      binding.value === undefined ? controller.t(defaultLabel) : controller.t('effectCustom')
    "
  />
</template>
