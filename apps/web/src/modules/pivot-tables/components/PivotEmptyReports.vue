<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { TableProperties } from "lucide-vue-next";
import {
  getPivotTableRange,
  addressInRange,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import type { CellAddress } from "@idea10/core/workbook";
import { getFloatingImageViewportFragments } from "@idea10/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  tables: readonly SheetPivotTable[];
  layout: SheetViewportLayout;
  body: Rect;
  activeAddress: CellAddress;
}>();
const emit = defineEmits<{ select: [id: string] }>();
const { t } = useAppI18n();
const fragments = computed(() =>
  props.tables
    .filter((table) => !table.outputRange)
    .flatMap((table) => {
      const range = getPivotTableRange(table),
        rect = props.layout.getRangeRect(range);
      if (!rect) return [];
      return getFloatingImageViewportFragments(
        { anchor: table.anchor, offsetX: 0, offsetY: 0, width: rect.width, height: rect.height },
        props.layout,
      ).map((fragment) => ({
        ...fragment,
        table,
        active: addressInRange(props.activeAddress, range),
      }));
    }),
);
const outer = (rect: Rect): CSSProperties => ({
  left: `${props.body.x + rect.x}px`,
  top: `${props.body.y + rect.y}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});
const inner = (rect: Rect, clip: Rect): CSSProperties => ({
  left: `${rect.x - clip.x}px`,
  top: `${rect.y - clip.y}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});
</script>
<template>
  <div class="pivot-empty-reports">
    <div
      v-for="fragment in fragments"
      :key="`${fragment.table.id}-${fragment.paneId}`"
      class="pivot-empty-reports__clip"
      :style="outer(fragment.clippedRect)"
    >
      <button
        type="button"
        class="pivot-empty-reports__report"
        :class="{ 'is-active': fragment.active }"
        :style="inner(fragment.rect, fragment.clippedRect)"
        :data-pivot-placeholder="fragment.table.id"
        :aria-label="`${fragment.table.name}: ${t('pivot.emptyHint')}`"
        @pointerdown.stop.prevent="emit('select', fragment.table.id)"
        @click.stop="emit('select', fragment.table.id)"
        @keydown.enter.stop="emit('select', fragment.table.id)"
        @keydown.space.stop.prevent="emit('select', fragment.table.id)"
      >
        <strong>{{ fragment.table.name }}</strong
        ><span>{{ t("pivot.emptyHint") }}</span
        ><TableProperties :size="76" :stroke-width="1" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
<style scoped lang="scss">
.pivot-empty-reports {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  &__clip {
    position: absolute;
    overflow: hidden;
  }
  &__report {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding: 20px 12px;
    box-sizing: border-box;
    pointer-events: auto;
    border: 1px solid var(--idea-border-control);
    background: var(--idea-surface-panel);
    color: var(--idea-text-primary);
    cursor: pointer;
    strong {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      color: var(--idea-text-secondary);
    }
    span {
      font-size: 12px;
      line-height: 20px;
    }
    svg {
      color: var(--idea-action-primary);
      margin-block: 12px;
    }
    &.is-active {
      border-color: var(--idea-action-primary);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -3px;
    }
  }
}
</style>
