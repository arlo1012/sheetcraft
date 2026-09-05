<script setup lang="ts">
import { computed, onBeforeUnmount, onUpdated, ref, watch, type CSSProperties } from "vue";
import type { FormulaReferenceToken } from "./formula-reference-tokens";

const props = defineProps<{
  input: HTMLTextAreaElement | null | undefined;
  value: string;
  references: readonly FormulaReferenceToken[];
  active: boolean;
}>();

const viewportStyle = ref<CSSProperties>({});
const contentStyle = ref<CSSProperties>({});
let resizeObserver: ResizeObserver | undefined;
let observedInput: HTMLTextAreaElement | null = null;

const segments = computed(() => {
  const parts: { text: string; reference?: FormulaReferenceToken }[] = [];
  let start = 0;
  for (const reference of props.references) {
    if (reference.start > start) parts.push({ text: props.value.slice(start, reference.start) });
    parts.push({ text: props.value.slice(reference.start, reference.end), reference });
    start = reference.end;
  }
  if (start < props.value.length) parts.push({ text: props.value.slice(start) });
  return parts;
});

function syncGeometry(): void {
  const input = props.input;
  if (!input || !props.active) return;
  const style = getComputedStyle(input);
  const nextViewport: CSSProperties = {
    left: `${input.offsetLeft + input.clientLeft}px`,
    top: `${input.offsetTop + input.clientTop}px`,
    width: `${input.clientWidth}px`,
    height: `${input.clientHeight}px`,
  };
  const nextContent: CSSProperties = {
    width: `${input.clientWidth}px`,
    minHeight: `${input.clientHeight}px`,
    transform: `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`,
    padding: style.padding,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontVariant: style.fontVariant,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textAlign: style.textAlign as CSSProperties["textAlign"],
    textIndent: style.textIndent,
    textTransform: style.textTransform as CSSProperties["textTransform"],
    direction: style.direction as CSSProperties["direction"],
    whiteSpace: style.whiteSpace as CSSProperties["whiteSpace"],
    overflowWrap: style.overflowWrap as CSSProperties["overflowWrap"],
    wordBreak: style.wordBreak as CSSProperties["wordBreak"],
    tabSize: style.tabSize,
  };
  // Geometry also changes when a cell editor grows, without a text update.
  // Avoid a render loop when onUpdated observes unchanged native input metrics.
  if (JSON.stringify(viewportStyle.value) !== JSON.stringify(nextViewport)) {
    viewportStyle.value = nextViewport;
  }
  if (JSON.stringify(contentStyle.value) !== JSON.stringify(nextContent)) {
    contentStyle.value = nextContent;
  }
}

function detachInput(): void {
  observedInput?.removeEventListener("scroll", syncGeometry);
  resizeObserver?.disconnect();
  observedInput = null;
}

watch(
  () => props.input,
  (input) => {
    detachInput();
    observedInput = input ?? null;
    observedInput?.addEventListener("scroll", syncGeometry, { passive: true });
    if (observedInput && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(syncGeometry);
      resizeObserver.observe(observedInput);
    }
    syncGeometry();
  },
  { immediate: true, flush: "post" },
);
watch(() => [props.active, props.value], syncGeometry, { flush: "post" });
onUpdated(syncGeometry);
onBeforeUnmount(detachInput);
</script>

<template>
  <div
    v-if="active"
    class="formula-text-overlay"
    :style="viewportStyle"
    aria-hidden="true"
    data-formula-text-overlay
  >
    <div class="formula-text-overlay__content" :style="contentStyle">
      <template v-for="(segment, index) in segments" :key="index">
        <span
          v-if="segment.reference"
          :style="{ color: `var(--idea-formula-reference-${segment.reference.colorIndex % 8})` }"
          data-formula-reference-token
          :data-reference-key="segment.reference.key"
          :data-reference-color="segment.reference.colorIndex"
          >{{ segment.text }}</span
        ><template v-else>{{ segment.text }}</template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.formula-text-overlay {
  position: absolute;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
  user-select: none;

  &__content {
    box-sizing: border-box;
  }
}
</style>
