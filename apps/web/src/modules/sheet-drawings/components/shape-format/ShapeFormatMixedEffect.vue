<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import {
  createPictureShadow,
  createPictureReflection,
  createPictureGlow,
  createPictureSoftEdges,
  createPictureFormat3d,
  createPictureRotation3d,
} from "../../../sheet-images/picture-effect-edit";
import type { ShapeFormatMode, ShapeFormatStyleCategory } from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";

const props = defineProps<{
  controller: ShapeFormatController;
  target: ShapeFormatMode;
  category: Exclude<ShapeFormatStyleCategory, "fill" | "line">;
}>();
const capability = computed(() => props.controller.styleCapability(props.target, props.category));
const options = computed(() => [
  { value: "none", label: props.controller.s.value("mixedEffectNone") },
  { value: "inherit", label: props.controller.s.value("mixedEffectInherit") },
  { value: "default", label: props.controller.s.value("mixedEffectDefault") },
]);
const action = computed(() => {
  const category = props.category,
    apply = props.controller.session.styleAction(props.target, category);
  return (value: unknown) => {
    if (value === "none") return apply({ kind: "none" });
    if (value === "inherit") return apply(undefined);
    if (value !== "default") return false;
    // Only an explicit choice creates a default effect. No leaf's effect is
    // presented as the committed aggregate of a mixed category.
    switch (category) {
      case "shadow":
        return apply({ kind: "value", value: createPictureShadow() });
      case "reflection":
        return apply({ kind: "value", value: createPictureReflection() });
      case "glow":
        return apply({ kind: "value", value: createPictureGlow() });
      case "softEdges":
        return apply({ kind: "value", value: createPictureSoftEdges() });
      case "format3d":
        return apply({ kind: "value", value: createPictureFormat3d() });
      case "rotation3d":
        return apply({ kind: "value", value: createPictureRotation3d() });
    }
  };
});
</script>
<template>
  <div :data-shape-format-mixed-style="category">
    <p class="shape-format-mixed-effect__notice">{{ controller.s.value("mixedStyleNotice") }}</p>
    <PictureFormatField :label="controller.s.value('mixedEffectSetting')">
      <TSelect
        model-value=""
        :placeholder="controller.s.value('mixedValues')"
        :options="options"
        :disabled="!capability.enabled"
        :aria-label="controller.s.value('mixedEffectSetting')"
        size="small"
        :onChange="action"
      />
    </PictureFormatField>
  </div>
</template>
<style scoped lang="scss">
.shape-format-mixed-effect__notice {
  margin: 0 0 6px;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
