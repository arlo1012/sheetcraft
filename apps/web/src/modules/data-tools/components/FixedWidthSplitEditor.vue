<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { BaseTable as TTable } from "tdesign-vue-next/es/table";
import type { BaseTableCol } from "tdesign-vue-next/es/table/type";
import TableHeightWrapper from "../../../shared/table/TableHeightWrapper.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  rows: readonly { row: number; text: string }[];
  widths: readonly number[];
}>();
const emit = defineEmits<{ change: [widths: number[]] }>();
const { t } = useAppI18n();
const characterWidth = 14;
const root = ref<HTMLElement>();
function characters(text: string): string[] {
  return Array.from(text);
}
const length = computed(() =>
  Math.min(512, Math.max(20, ...props.rows.map((row) => characters(row.text).length))),
);
const columns = computed<BaseTableCol[]>(() => [
  {
    colKey: "row",
    title: t("dataTools.textToColumns.row"),
    width: 56,
    align: "center",
    fixed: "left",
  },
  {
    colKey: "text",
    width: length.value * characterWidth,
    title: "ruler",
    cell: "characters",
    className: "idea-table__split-text",
    thClassName: "idea-table__split-text",
  },
]);
const tableData = computed(() => [...props.rows]);
const tableWidth = computed(() => `max(100%, ${56 + length.value * characterWidth}px)`);
const positions = computed(() => {
  let offset = 0;
  return props.widths.map((width) => (offset += width));
});
async function focusLine(position?: number): Promise<void> {
  await nextTick();
  const target =
    position === undefined
      ? root.value?.querySelector<HTMLElement>(".fixed-width-split-editor__ruler")
      : root.value?.querySelector<HTMLElement>(`[data-break-position="${position}"]`);
  target?.focus({ preventScroll: true });
}
// This also selects a new line created by the position input above the preview.
watch(positions, (current, previous) => {
  const added = current.find((position) => !previous.includes(position));
  if (added !== undefined) void focusLine(added);
});
function update(values: number[], focusPosition?: number): void {
  const sorted = [...new Set(values)].filter((value) => value > 0).sort((a, b) => a - b);
  emit(
    "change",
    sorted.map((value, index) => value - (sorted[index - 1] ?? 0)),
  );
  if (focusPosition !== undefined) void focusLine(focusPosition);
}
function add(event: MouseEvent): void {
  const element = event.currentTarget as HTMLElement;
  const position = Math.round(
    (event.clientX - element.getBoundingClientRect().left) / characterWidth,
  );
  if (position > 0 && position < length.value) update([...positions.value, position], position);
}
function remove(position: number): void {
  const index = positions.value.indexOf(position);
  const remaining = positions.value.filter((value) => value !== position);
  update(remaining);
  void focusLine(remaining[Math.min(index, remaining.length - 1)]);
}
let endDrag: (() => void) | undefined;
function startDrag(event: PointerEvent, position: number): void {
  if (event.button !== 0) return;
  endDrag?.();
  const handle = event.currentTarget as HTMLButtonElement;
  handle.focus({ preventScroll: true });
  const surface = handle.parentElement!;
  const others = positions.value.filter((value) => value !== position);
  const move = (moveEvent: PointerEvent) => {
    const next = Math.max(
      1,
      Math.min(
        length.value - 1,
        Math.round((moveEvent.clientX - surface.getBoundingClientRect().left) / characterWidth),
      ),
    );
    update([...others, next], next);
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
    event.stopPropagation();
    remove(position);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    event.stopPropagation();
    const next = Math.max(
      1,
      Math.min(length.value - 1, position + (event.key === "ArrowRight" ? 1 : -1)),
    );
    update([...positions.value.filter((value) => value !== position), next], next);
  }
}
onBeforeUnmount(() => endDrag?.());
</script>
<template>
  <div ref="root" class="fixed-width-split-editor">
    <div class="fixed-width-split-editor__preview">
      <TableHeightWrapper v-slot="{ height }">
        <TTable
          class="idea-table--mini idea-table--split-preview"
          row-key="row"
          :data="tableData"
          :columns="columns"
          :height="height"
          :table-content-width="tableWidth"
          :bordered="false"
          cell-empty-content=""
          size="small"
          table-layout="fixed"
          hover
          :aria-label="t('dataTools.textToColumns.preview')"
        >
          <template #row="{ row }">{{ row.row + 1 }}</template>
          <template #ruler>
            <div class="fixed-width-split-editor__ruler" tabindex="-1" @click="add">
              <span
                v-for="position in length"
                :key="position"
                class="fixed-width-split-editor__character"
                :style="{ width: `${characterWidth}px` }"
                >{{ position % 5 === 0 ? position : "·" }}</span
              >
              <button
                v-for="(position, index) in positions"
                :key="index"
                :data-break-position="position"
                type="button"
                class="fixed-width-split-editor__line"
                :style="{ left: `${position * characterWidth}px` }"
                :aria-label="t('dataTools.textToColumns.breakAt', { position })"
                @click.stop
                @pointerdown.prevent="startDrag($event, position)"
                @dblclick.stop.prevent="remove(position)"
                @keydown="key($event, position)"
              >
                <span aria-hidden="true">▼</span>
              </button>
            </div>
          </template>
          <template #characters="{ row }">
            <div class="fixed-width-split-editor__row">
              <span
                v-for="(char, index) in characters(row.text).slice(0, 512)"
                :key="index"
                class="fixed-width-split-editor__character"
                :style="{ width: `${characterWidth}px` }"
                >{{ char }}</span
              >
              <span
                v-for="position in positions"
                :key="`line-${position}`"
                class="fixed-width-split-editor__guide"
                :style="{ left: `${position * characterWidth}px` }"
                aria-hidden="true"
              />
            </div>
          </template>
        </TTable>
      </TableHeightWrapper>
    </div>
    <p>{{ t("dataTools.textToColumns.fixedHint") }}</p>
  </div>
</template>
<style scoped lang="scss">
.fixed-width-split-editor {
  min-width: 0;
  &__preview {
    height: 220px;
    min-width: 0;
  }
  &__ruler,
  &__row {
    position: relative;
    display: flex;
    white-space: pre;
    height: 28px;
    line-height: 28px;
  }
  &__character {
    flex-shrink: 0;
    text-align: center;
  }
  &__ruler {
    cursor: crosshair;
  }
  &__guide {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--td-brand-color);
    pointer-events: none;
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
  }
  p {
    margin: 4px 0 0;
    color: var(--idea-text-secondary);
  }
}
</style>
