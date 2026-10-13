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
import ShapeFormatMixedEffect from "./ShapeFormatMixedEffect.vue";
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
const isConnector = computed(
  () =>
    props.controller.props.snapshot?.drawing.kind === "shape" &&
    !!props.controller.props.snapshot.drawing.shapeConnector,
);
function reason(category: ShapeFormatStyleCategory): string | undefined {
  const c = props.controller.styleCapability(props.target, category);
  return c.reason;
}
</script>
<template>
  <div class="shape-format-effects">
    <PictureFormatSection :title="controller.props.t('shadowSection')" initially-open>
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'shadow')"
        :controller="controller"
        :target="target"
        category="shadow"
      />
      <PictureShadowEditor v-else v-bind="shadow" />
      <p v-if="reason('shadow')" class="shape-format-effects__reason">{{ reason("shadow") }}</p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('reflectionSection')">
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'reflection')"
        :controller="controller"
        :target="target"
        category="reflection"
      />
      <PictureReflectionEditor v-else v-bind="reflection" />
      <p v-if="reason('reflection')" class="shape-format-effects__reason">
        {{ reason("reflection") }}
      </p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('glowSection')">
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'glow')"
        :controller="controller"
        :target="target"
        category="glow"
      />
      <PictureGlowEditor v-else v-bind="glow" />
      <p v-if="reason('glow')" class="shape-format-effects__reason">{{ reason("glow") }}</p>
    </PictureFormatSection>
    <PictureFormatSection :title="controller.props.t('softEdgesSection')">
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'softEdges')"
        :controller="controller"
        :target="target"
        category="softEdges"
      />
      <PictureSoftEdgesEditor v-else v-bind="softEdges" />
      <p v-if="target === 'text'" class="shape-format-effects__reason">
        {{ controller.s.value("textSoftEdgesHelp") }}
      </p>
      <p v-if="reason('softEdges')" class="shape-format-effects__reason">
        {{ reason("softEdges") }}
      </p>
    </PictureFormatSection>
    <PictureFormatSection v-if="!isConnector" :title="controller.props.t('format3dSection')">
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'format3d')"
        :controller="controller"
        :target="target"
        category="format3d"
      />
      <PictureFormat3dEditor v-else v-bind="format3d" />
      <p v-if="reason('format3d')" class="shape-format-effects__reason">{{ reason("format3d") }}</p>
    </PictureFormatSection>
    <PictureFormatSection v-if="!isConnector" :title="controller.props.t('rotation3dSection')">
      <ShapeFormatMixedEffect
        v-if="controller.isMixedStyle(target, 'rotation3d')"
        :controller="controller"
        :target="target"
        category="rotation3d"
      />
      <PictureRotation3dEditor v-else v-bind="rotation3d" />
      <p v-if="target === 'text'" class="shape-format-effects__reason">
        {{ controller.s.value("textCameraSharedHelp") }}
      </p>
      <p
        v-if="target === 'text' && controller.props.snapshot?.independentTextCameraCount"
        class="shape-format-effects__reason"
        data-independent-text-camera
      >
        {{ controller.s.value("textCameraLegacyHelp") }} ({{
          controller.props.snapshot.independentTextCameraCount
        }})
      </p>
      <p v-if="reason('rotation3d')" class="shape-format-effects__reason">
        {{ reason("rotation3d") }}
      </p>
      <ShapeFormatCheckbox :controller="controller" field="shapeKeepTextFlat" />
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
