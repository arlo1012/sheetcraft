<script setup lang="ts">
import { computed, ref } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import FormatSection from "../../../../shared/format-pane/FormatSection.vue";
import PicturePaintEditor from "../../../sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../../sheet-images/components/format-pane/PictureLineEditor.vue";
import ShapeLineEndsControls from "../ShapeLineEndsControls.vue";
import WordArtStyleGallery from "../WordArtStyleGallery.vue";
import {
  WORDART_STYLE_APPLICATION_LABELS,
  wordArtStyleApplicationScope,
} from "./wordart-style-application-labels";
import { shapeFormatOwnerKey, type ShapeFormatMode } from "../../shape-format-pane-model";
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
const wordArtStyle = computed(() => props.controller.wordArtStyleBinding());
const wordArtStyleCapability = computed(() => props.controller.wordArtStyleCapability());
const clearWordArtCapability = computed(() => props.controller.clearWordArtEffectsCapability());
const clearWordArtAction = computed(() => props.controller.session.clearWordArtEffectsAction());
const wordArtLabels = computed(
  () => WORDART_STYLE_APPLICATION_LABELS[props.controller.props.locale ?? "en-US"],
);
const wordArtApplicationSummary = computed(() => {
  const group = props.controller.props.snapshot?.drawing.kind === "shapeGroup";
  return props.controller.props.locale === "zh-CN"
    ? group
      ? "预设应用详情"
      : "应用于整个对象"
    : group
      ? "Preset application details"
      : "Applies to the whole object";
});
const wordArtScope = computed(() => {
  const snapshot = props.controller.props.snapshot;
  return snapshot?.drawing.kind === "shapeGroup" && snapshot.wordArtStyleScope
    ? wordArtStyleApplicationScope(
        props.controller.props.locale ?? "en-US",
        snapshot.wordArtStyleScope,
      )
    : undefined;
});
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
const fillRef = ref<InstanceType<typeof FormatSection>>(),
  lineRef = ref<InstanceType<typeof FormatSection>>();
defineExpose({
  showCategory: (category: "fill" | "line") =>
    (category === "fill" ? fillRef.value : lineRef.value)?.expand(),
});
</script>
<template>
  <div class="shape-format-fill-line">
    <FormatSection
      v-if="target === 'text' && controller.hasWordArtStyleScope.value"
      :title="wordArtLabels.title"
      initially-open
      data-wordart-style-section
    >
      <p
        v-if="controller.props.snapshot?.wordArtStyleEditingScope"
        class="shape-format-fill-line__reason"
        data-wordart-style-help
      >
        {{
          controller.props.snapshot?.wordArtStyleEditingScope === "selection"
            ? wordArtLabels.selectionHelp
            : wordArtLabels.caretHelp
        }}
      </p>
      <p v-if="wordArtScope" class="shape-format-fill-line__reason" data-wordart-style-scope>
        {{ wordArtScope }}
      </p>
      <p
        v-if="controller.props.snapshot?.mixedWordArtStyle"
        class="shape-format-fill-line__reason"
        data-wordart-style-mixed
      >
        {{
          controller.props.snapshot?.wordArtStyleEditingScope
            ? wordArtLabels.selectionMixed
            : wordArtLabels.mixed
        }}
      </p>
      <WordArtStyleGallery v-bind="wordArtStyle" inline />
      <p
        v-if="!wordArtStyleCapability.enabled && wordArtStyleCapability.reason"
        class="shape-format-fill-line__reason"
        data-wordart-style-disabled-reason
      >
        {{ wordArtStyleCapability.reason }}
      </p>
      <details
        v-if="!controller.props.snapshot?.wordArtStyleEditingScope"
        class="shape-format-fill-line__application-details"
      >
        <summary>{{ wordArtApplicationSummary }}</summary>
        <p class="shape-format-fill-line__reason" data-wordart-style-help>
          {{ wordArtLabels.reapplyHelp }}
        </p>
      </details>
      <TButton
        variant="outline"
        size="small"
        :disabled="!clearWordArtCapability.enabled"
        data-clear-wordart-effects
        @click="clearWordArtAction()"
      >
        {{ wordArtLabels.clear }}
      </TButton>
      <p class="shape-format-fill-line__reason" data-clear-wordart-effects-help>
        {{ wordArtLabels.clearHelp }}
      </p>
      <p
        v-if="!clearWordArtCapability.enabled && clearWordArtCapability.reason"
        class="shape-format-fill-line__reason"
        data-clear-wordart-effects-disabled-reason
      >
        {{ clearWordArtCapability.reason }}
      </p>
    </FormatSection>
    <FormatSection
      v-if="!isConnector"
      ref="fillRef"
      :title="
        target === 'shape' ? controller.props.t('fillSection') : controller.s.value('textFill')
      "
      initially-open
    >
      <PicturePaintEditor
        v-bind="fill"
        :focus-owner-key="
          controller.props.snapshot
            ? shapeFormatOwnerKey(controller.props.snapshot.owner)
            : undefined
        "
        :load-asset="fillAssetLoader"
        :show-context-help="false"
      />
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
    </FormatSection>
    <FormatSection
      ref="lineRef"
      :title="
        target === 'shape' ? controller.props.t('lineSection') : controller.s.value('textOutline')
      "
      initially-open
    >
      <PictureLineEditor
        v-bind="line"
        :focus-owner-key="
          controller.props.snapshot
            ? shapeFormatOwnerKey(controller.props.snapshot.owner)
            : undefined
        "
        :load-asset="lineAssetLoader"
      />
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
          :owner-key="`${controller.ownerKey.value}:shape:line-ends`"
          :focus-owner-key="
            controller.props.snapshot
              ? shapeFormatOwnerKey(controller.props.snapshot.owner)
              : undefined
          "
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
    </FormatSection>
  </div>
</template>
<style scoped lang="scss">
.shape-format-fill-line__application-details {
  color: var(--sheetcraft-text-secondary);
  font-size: var(--sheetcraft-font-size-body-small);
  line-height: var(--sheetcraft-line-height-body-small);

  > summary {
    cursor: pointer;
  }

  &[open] > summary {
    margin-bottom: var(--sheetcraft-space-1);
  }
}

.shape-format-fill-line__reason {
  margin: 0;
  color: var(--sheetcraft-text-secondary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
