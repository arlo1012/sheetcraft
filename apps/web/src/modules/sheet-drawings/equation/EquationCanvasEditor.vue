<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { getEquationMathRotationDeg } from "@sheetcraft/core/equation-flip";
import EquationEditingSurface from "./EquationEditingSurface.vue";
import EquationContent from "../components/EquationContent.vue";
import type { EquationEditSnapshot, EquationEditCallbacks } from "./useEquationEditSession";
import type { EquationEditorLabels } from "./equation-editor-context";
import en from "./equation-messages.en-US";
import zh from "./equation-messages.zh-CN";
const props = defineProps<{
  snapshot: EquationEditSnapshot;
  callbacks: EquationEditCallbacks;
  locale: "en-US" | "zh-CN";
  hidePlaceholders?: boolean;
}>();
const mathRotation = computed(
  () => props.snapshot.view.rotation + getEquationMathRotationDeg(props.snapshot.source),
);
const labels = computed(() => (props.locale === "zh-CN" ? zh : en));
const slotLabels = computed<Partial<EquationEditorLabels>>(() =>
  props.locale === "zh-CN"
    ? {
        equation: "公式",
        numerator: "分子",
        denominator: "分母",
        base: "底数",
        subscript: "下标",
        superscript: "上标",
        radicand: "被开方数",
        degree: "根指数",
        lower: "下限",
        upper: "上限",
        body: "表达式",
        annotation: "标注",
        matrixCell: "矩阵单元",
      }
    : {},
);
const surface = ref<InstanceType<typeof EquationEditingSurface>>();
let sourceComposition: { id: number; owner: string; before: string } | undefined;
function sourceInput(event: Event) {
  if (sourceComposition || (event as InputEvent).isComposing) return;
  const target = event.target as HTMLTextAreaElement;
  if (!props.callbacks.source(target.value)) target.value = props.snapshot.sourceText;
}
function compositionStart() {
  if (!props.callbacks.isActive()) return;
  sourceComposition = {
    id: props.snapshot.sessionId,
    owner: props.snapshot.ownerId,
    before: props.snapshot.sourceText,
  };
  props.callbacks.composition(true);
}
function compositionEnd(event: CompositionEvent) {
  const capture = sourceComposition;
  sourceComposition = undefined;
  const target = event.target as HTMLTextAreaElement;
  if (
    !capture ||
    capture.id !== props.snapshot.sessionId ||
    capture.owner !== props.snapshot.ownerId ||
    !props.callbacks.isActive()
  ) {
    target.value = props.snapshot.sourceText;
    return;
  }
  props.callbacks.composition(false);
  if (capture.before !== props.snapshot.sourceText || !props.callbacks.source(target.value))
    target.value = props.snapshot.sourceText;
}
function sourceKey(event: KeyboardEvent) {
  if (event.isComposing || sourceComposition) return;
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    ["z", "y"].includes(event.key.toLowerCase())
  ) {
    event.preventDefault();
    props.callbacks.history(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo");
  } else if (event.key === "Escape") {
    event.preventDefault();
    props.callbacks.commit();
  }
}
void nextTick(() => surface.value?.focus());
</script>
<template>
  <div
    class="equation-canvas-editor"
    :data-equation-session="snapshot.sessionId"
    :data-equation-owner="snapshot.ownerId"
    :style="{
      fontSize: `${snapshot.view.fontSize}px`,
      color: snapshot.view.color,
      transform: `rotate(${mathRotation}deg)`,
    }"
    @pointerdown.stop
    @click.stop
    @dblclick.stop
    @keydown.stop
  >
    <EquationEditingSurface
      v-if="snapshot.mode === 'structured' && snapshot.draft"
      ref="surface"
      :document="snapshot.draft.document"
      :selection="snapshot.draft.selection"
      :owner-id="snapshot.ownerId"
      :session-id="snapshot.sessionId"
      :labels="slotLabels"
      :hide-placeholders="hidePlaceholders"
      @action="callbacks.action"
      @selection-change="callbacks.select"
      @composition-change="callbacks.composition"
      @history="callbacks.history"
      @next-slot="callbacks.nextSlot"
      @finish="callbacks.commit"
    />
    <template v-else>
      <textarea
        data-equation-source-editor
        :aria-label="labels.source"
        :value="snapshot.sourceText"
        spellcheck="false"
        @input="sourceInput"
        @compositionstart="compositionStart"
        @compositionend="compositionEnd"
        @keydown="sourceKey"
      />
      <EquationContent :source="snapshot.sourceText" />
    </template>
    <span
      v-if="snapshot.mode === 'structured' && snapshot.draft?.document.body.children.length === 0"
      class="equation-canvas-editor__placeholder"
      >{{ labels.placeholder }}</span
    >
    <button
      type="button"
      data-equation-cancel
      class="equation-canvas-editor__cancel"
      @click="callbacks.cancel"
    >
      {{ labels.cancelDraft }}
    </button>
    <p v-if="snapshot.error" class="equation-canvas-editor__error" role="alert">
      {{ snapshot.error }}
    </p>
  </div>
</template>
<style scoped>
.equation-canvas-editor {
  position: relative;
  box-sizing: border-box;
  min-width: 100%;
  min-height: 100%;
  width: max-content;
  max-width: 100%;
  overflow: auto;
  transform-origin: 50% 50%;
  background: var(--sheetcraft-surface-background, #fff);
  border: 1px solid var(--sheetcraft-accent-color, #4275bc);
  cursor: text;
}
.equation-canvas-editor textarea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 3em;
  resize: none;
  font: 12px monospace;
}
.equation-canvas-editor__placeholder {
  pointer-events: none;
  position: absolute;
  left: 0.8em;
  top: 0.15em;
  opacity: 0.5;
  font-size: inherit;
  white-space: nowrap;
}
.equation-canvas-editor__cancel {
  display: block;
  font: 11px sans-serif;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.65;
  cursor: pointer;
  margin: 4px;
}
.equation-canvas-editor__error {
  font: 12px sans-serif;
  color: var(--sheetcraft-status-error, #b42318);
  margin: 4px;
}
</style>
