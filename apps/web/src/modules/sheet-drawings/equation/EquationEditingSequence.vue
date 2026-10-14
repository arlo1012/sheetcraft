<script setup lang="ts">
import { computed, inject } from "vue";
import type { EquationSequence } from "@sheetcraft/core/equation-document";
import { equationNodeLength } from "./equation-draft";
import { EQUATION_EDITOR_CONTEXT } from "./equation-editor-context";
import EquationEditingNode from "./EquationEditingNode.vue";
import EquationTextSlot from "./EquationTextSlot.vue";
const props = defineProps<{ sequence: EquationSequence; label: string }>();
const editor = inject(EQUATION_EDITOR_CONTEXT)!;
const segments = computed(() => {
  let offset = 0;
  return props.sequence.children.map((node, index) => {
    const start = offset;
    offset += equationNodeLength(node);
    const previous = props.sequence.children[index - 1];
    return {
      node,
      offset: start,
      boundaryBefore:
        node.kind !== "text" &&
        node.kind !== "latex" &&
        (!previous || (previous.kind !== "text" && previous.kind !== "latex")),
    };
  });
});
const end = computed(() =>
  props.sequence.children.reduce((length, node) => length + equationNodeLength(node), 0),
);
const needsEnd = computed(() => {
  const last = props.sequence.children.at(-1);
  return last && last.kind !== "text" && last.kind !== "latex";
});
</script>
<template>
  <span
    class="equation-sequence"
    :class="{ 'is-selected': editor.selection.value.slotId === sequence.id }"
    :data-equation-sequence="sequence.id"
    :aria-label="label"
  >
    <EquationTextSlot
      v-if="!segments.length"
      :slot-id="sequence.id"
      :offset="0"
      value=""
      :label="label"
    />
    <template v-for="segment in segments" :key="segment.node.id">
      <EquationTextSlot
        v-if="segment.boundaryBefore"
        :slot-id="sequence.id"
        :offset="segment.offset"
        value=""
        :label="label"
        boundary
      />
      <EquationTextSlot
        v-if="segment.node.kind === 'text' || segment.node.kind === 'latex'"
        :slot-id="sequence.id"
        :offset="segment.offset"
        :value="segment.node.value"
        :label="label"
        :normal="segment.node.kind === 'latex' || segment.node.mode === 'normal'"
        :text-mode="segment.node.kind === 'text' ? (segment.node.mode ?? 'math') : undefined"
      />
      <EquationEditingNode
        v-else
        :node="segment.node"
        :class="{
          'is-range-selected':
            editor.selection.value.slotId === sequence.id &&
            editor.selection.value.start < editor.selection.value.end &&
            editor.selection.value.start < segment.offset + 1 &&
            editor.selection.value.end > segment.offset,
        }"
      />
    </template>
    <EquationTextSlot
      v-if="needsEnd"
      :slot-id="sequence.id"
      :offset="end"
      value=""
      :label="label"
      boundary
    />
  </span>
</template>
<style scoped>
.equation-sequence {
  display: inline-flex;
  align-items: center;
  gap: 0.03em;
  min-width: 0.55em;
  vertical-align: middle;
}
.equation-sequence.is-selected {
  background: var(--sheetcraft-selection-background, rgb(86 123 174 / 8%));
}
.is-range-selected {
  background: var(--sheetcraft-selection-background, rgb(86 123 174 / 24%));
}
</style>
