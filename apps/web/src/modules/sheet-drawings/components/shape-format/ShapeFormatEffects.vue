<script setup lang="ts">
import { computed } from "vue";
import PictureFormatSection from "../../../sheet-images/components/format-pane/PictureFormatSection.vue";
import PictureShadowEditor from "../../../sheet-images/components/format-pane/PictureShadowEditor.vue";
import PictureReflectionEditor from "../../../sheet-images/components/format-pane/PictureReflectionEditor.vue";
import PictureGlowEditor from "../../../sheet-images/components/format-pane/PictureGlowEditor.vue";
import PictureSoftEdgesEditor from "../../../sheet-images/components/format-pane/PictureSoftEdgesEditor.vue";
import PictureFormat3dEditor from "../../../sheet-images/components/format-pane/PictureFormat3dEditor.vue";
import PictureRotation3dEditor from "../../../sheet-images/components/format-pane/PictureRotation3dEditor.vue";
import ShapeFormatCheckbox from "./ShapeFormatCheckbox.vue";
import type { ShapeFormatMode, ShapeFormatStyleCategory } from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = withDefaults(
  defineProps<{ controller: ShapeFormatController; target?: ShapeFormatMode }>(),
  { target: "shape" },
);
const shadow = computed(() => props.controller.styleBinding(props.target, "shadow"));
const reflection = computed(() => props.controller.styleBinding(props.target, "reflection"));
const glow = computed(() => props.controller.styleBinding(props.target, "glow"));
const softEdges = computed(() => props.controller.styleBinding(props.target, "softEdges"));
const format3d = computed(() => props.controller.styleBinding(props.target, "format3d"));
const rotation3d = computed(() => props.controller.styleBinding(props.target, "rotation3d"));
function reason(category: ShapeFormatStyleCategory): string | undefined {
  const c = props.controller.styleCapability(props.target, category);
  return c.enabled ? undefined : c.reason;
}
</script>
<template>
  <div class="shape-format-effects">
    <PictureFormatSection :title="controller.props.t('shadowSection')" initially-open>
      <PictureShadowEditor v-bind="shadow" />
      <p v-if="reason('shadow')" class="shape-format-effects__reason">{{ reason("shadow") }}</p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('reflectionSection')">
      <PictureReflectionEditor v-bind="reflection" />
      <p v-if="reason('reflection')" class="shape-format-effects__reason">
        {{ reason("reflection") }}
      </p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('glowSection')">
      <PictureGlowEditor v-bind="glow" />
      <p v-if="reason('glow')" class="shape-format-effects__reason">{{ reason("glow") }}</p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('softEdgesSection')">
      <PictureSoftEdgesEditor v-bind="softEdges" />
      <p v-if="reason('softEdges')" class="shape-format-effects__reason">
        {{ reason("softEdges") }}
      </p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('format3dSection')">
      <PictureFormat3dEditor v-bind="format3d" />
      <p v-if="reason('format3d')" class="shape-format-effects__reason">{{ reason("format3d") }}</p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('rotation3dSection')">
      <PictureRotation3dEditor v-bind="rotation3d" />
      <p v-if="reason('rotation3d')" class="shape-format-effects__reason">
        {{ reason("rotation3d") }}
      </p>
      <ShapeFormatCheckbox
        :controller="controller"
        :field="target === 'shape' ? 'shapeKeepTextFlat' : 'textKeepTextFlat'"
      />
    </PictureFormatSection>
  </div>
</template>
<style scoped lang="scss">
.shape-format-effects__reason {
  margin: 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
