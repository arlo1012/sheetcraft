<script setup lang="ts">
import { computed, ref } from "vue";
import PictureFormatSection from "../../../sheet-images/components/format-pane/PictureFormatSection.vue";
import PicturePaintEditor from "../../../sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../sheet-images/components/format-pane/PictureLineEditor.vue";
import ShapeLineEndsControls from "../ShapeLineEndsControls.vue";
import type { ShapeFormatMode } from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = withDefaults(
  defineProps<{ controller: ShapeFormatController; target?: ShapeFormatMode }>(),
  { target: "shape" },
);
const fill = computed(() => props.controller.styleBinding(props.target, "fill"));
const line = computed(() => props.controller.styleBinding(props.target, "line"));
const fillAssetLoader = computed(() => props.controller.assetLoader(props.target, "fill"));
const lineAssetLoader = computed(() => props.controller.assetLoader(props.target, "line"));
const fillCapability = computed(() => props.controller.styleCapability(props.target, "fill"));
const lineCapability = computed(() => props.controller.styleCapability(props.target, "line"));
const endsCapability = computed(
  () =>
    props.controller.props.capabilities.lineEnds ?? {
      enabled: false,
      reason: props.controller.s.value("unsupported"),
    },
);
const endsAction = computed(() => props.controller.session.lineEndsAction());
const endpointAction = computed(() => props.controller.session.lineEndAction());
const group = computed(() => props.controller.props.snapshot?.drawing.kind === "shapeGroup");
const ends = computed(() =>
  group.value ? props.controller.props.snapshot?.lineEnds : leaf.value?.shapeLineEnds,
);
const leaf = computed(() => {
  const drawing = props.controller.props.snapshot?.drawing;
  return drawing?.kind === "shape" || drawing?.kind === "textBox" ? drawing : undefined;
});
const isConnector = computed(() => leaf.value?.kind === "shape" && !!leaf.value.shapeConnector);
const fillRef = ref<InstanceType<typeof PictureFormatSection>>(),
  lineRef = ref<InstanceType<typeof PictureFormatSection>>();
defineExpose({
  showCategory: (category: "fill" | "line") =>
    (category === "fill" ? fillRef.value : lineRef.value)?.expand(),
});
</script>
<template>
  <div class="shape-format-fill-line">
    <PictureFormatSection
      v-if="!isConnector"
      ref="fillRef"
      :title="
        target === 'shape' ? controller.props.t('fillSection') : controller.s.value('textFill')
      "
      initially-open
    >
      <PicturePaintEditor v-bind="fill" :load-asset="fillAssetLoader" />
      <p
        v-if="controller.isMixedStyle(target, 'fill')"
        class="shape-format-fill-line__reason"
        data-shape-format-mixed-style="fill"
      >
        {{ controller.s.value("mixedStyleNotice") }}
      </p>
      <p
        v-if="!fillCapability.enabled && fillCapability.reason"
        class="shape-format-fill-line__reason"
      >
        {{ fillCapability.reason }}
      </p>
    </PictureFormatSection>
    <PictureFormatSection
      ref="lineRef"
      :title="
        target === 'shape' ? controller.props.t('lineSection') : controller.s.value('textOutline')
      "
      initially-open
    >
      <PictureLineEditor v-bind="line" :load-asset="lineAssetLoader" />
      <p
        v-if="controller.isMixedStyle(target, 'line')"
        class="shape-format-fill-line__reason"
        data-shape-format-mixed-style="line"
      >
        {{ controller.s.value("mixedStyleNotice") }}
      </p>
      <p
        v-if="!lineCapability.enabled && lineCapability.reason"
        class="shape-format-fill-line__reason"
      >
        {{ lineCapability.reason }}
      </p>
      <template
        v-if="target === 'shape' && (leaf || group) && controller.props.capabilities.lineEnds"
      >
        <ShapeLineEndsControls
          :ends="ends"
          :mixed="group ? controller.props.snapshot?.mixedLineEnds : undefined"
          :endpoint-handler="group ? endpointAction : undefined"
          :disabled="!endsCapability.enabled"
          :locale="controller.props.locale"
          :handler="endsAction"
        />
        <p
          v-if="!endsCapability.enabled && endsCapability.reason"
          class="shape-format-fill-line__reason"
        >
          {{ endsCapability.reason }}
        </p>
      </template>
    </PictureFormatSection>
  </div>
</template>
<style scoped lang="scss">
.shape-format-fill-line__reason {
  margin: 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
