<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  rows: readonly { row: number; text: string }[];
  widths: readonly number[];
}>();
const emit = defineEmits<{ change: [widths: number[]] }>();
const { t } = useAppI18n();
const characterWidth = 14;
const length = computed(() =>
  Math.min(512, Math.max(20, ...props.rows.map((row) => row.text.length))),
);
const positions = computed(() => {
  let offset = 0;
  return props.widths.map((width) => (offset += width));
});
function update(values: number[]): void {
  const sorted = [...new Set(values)].filter((value) => value > 0).sort((a, b) => a - b);
  emit(
    "change",
    sorted.map((value, index) => value - (sorted[index - 1] ?? 0)),
  );
}
function add(event: MouseEvent): void {
  const element = event.currentTarget as HTMLElement;
  const position = Math.round(
    (event.clientX - element.getBoundingClientRect().left) / characterWidth,
  );
  if (position > 0 && position < length.value) update([...positions.value, position]);
}
function remove(position: number): void {
  update(positions.value.filter((value) => value !== position));
}
let endDrag: (() => void) | undefined;
function startDrag(event: PointerEvent, position: number): void {
  if (event.button !== 0) return;
  endDrag?.();
  const surface = (event.currentTarget as HTMLElement).parentElement!;
  const others = positions.value.filter((value) => value !== position);
  const move = (moveEvent: PointerEvent) => {
    const next = Math.max(
      1,
      Math.min(
        length.value - 1,
        Math.round((moveEvent.clientX - surface.getBoundingClientRect().left) / characterWidth),
      ),
    );
    update([...others, next]);
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    endDrag = undefined;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop);
  window.addEventListener("pointercancel", stop);
  endDrag = stop;
}
function key(event: KeyboardEvent, position: number): void {
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    remove(position);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const next = Math.max(
      1,
      Math.min(length.value - 1, position + (event.key === "ArrowRight" ? 1 : -1)),
    );
    update([...positions.value.filter((value) => value !== position), next]);
  }
}
onBeforeUnmount(() => endDrag?.());
</script>
<template>
  <div class="fixed-width-split-editor">
    <div class="fixed-width-split-editor__scroll">
      <div
        class="fixed-width-split-editor__surface"
        :style="{ width: `${length * characterWidth}px` }"
      >
        <div class="fixed-width-split-editor__ruler" @click="add">
          <span
            v-for="position in length"
            :key="position"
            :style="{ width: `${characterWidth}px` }"
            >{{ position % 5 === 0 ? position : "·" }}</span
          >
        </div>
        <div v-for="row in rows" :key="row.row" class="fixed-width-split-editor__row">
          <span
            v-for="(char, index) in row.text.slice(0, 512).split('')"
            :key="index"
            :style="{ width: `${characterWidth}px` }"
            >{{ char }}</span
          >
        </div>
        <button
          v-for="(position, index) in positions"
          :key="index"
          type="button"
          class="fixed-width-split-editor__line"
          :style="{ left: `${position * characterWidth}px` }"
          :aria-label="t('dataTools.textToColumns.breakAt', { position })"
          @pointerdown.prevent="startDrag($event, position)"
          @dblclick.prevent="remove(position)"
          @keydown="key($event, position)"
        >
          <span aria-hidden="true">▼</span>
        </button>
      </div>
    </div>
    <p>{{ t("dataTools.textToColumns.fixedHint") }}</p>
  </div>
</template>
<style scoped lang="scss">
.fixed-width-split-editor {
  min-width: 0;
  &__scroll {
    overflow: auto;
    max-height: 204px;
    border: 1px solid var(--idea-border-subtle);
  }
  &__surface {
    position: relative;
    min-height: 100px;
  }
  &__ruler,
  &__row {
    display: flex;
    white-space: pre;
    min-height: 24px;
    line-height: 24px;
    font-family: monospace;
    span {
      flex-shrink: 0;
      text-align: center;
    }
  }
  &__ruler {
    background: var(--idea-surface-secondary);
    border-bottom: 1px solid var(--idea-border-subtle);
    cursor: crosshair;
  }
  &__row {
    border-bottom: 1px solid var(--idea-border-subtle);
  }
  &__line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    transform: translateX(-50%);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--td-brand-color);
    cursor: col-resize;
    touch-action: none;
    &::after {
      content: "";
      position: absolute;
      top: 16px;
      bottom: 0;
      left: 50%;
      border-left: 1px solid currentColor;
    }
    span {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
    }
    &:focus-visible {
      outline: 2px solid var(--td-brand-color);
    }
  }
  p {
    margin: 4px 0 0;
    color: var(--idea-text-secondary);
  }
}
</style>
