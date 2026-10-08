<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { ChevronDown, Filter } from "lucide-vue-next";
import {
  getPivotTableSource,
  getPivotPresentation,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import { getFloatingImageViewportFragments } from "@idea10/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import PivotFieldFilterPanel from "./PivotFieldFilterPanel.vue";

type ReportControl = { id: string; area: "filters" | "rows" | "columns"; index: number };

const props = defineProps<{
  tables: readonly SheetPivotTable[];
  workbook: Workbook;
  revision: number;
  layout: SheetViewportLayout;
  body: Rect;
  disabled: boolean;
}>();
const emit = defineEmits<{
  update: [table: SheetPivotTable];
  settings: [id: string, index: number];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLElement | null>(null);
const selected = ref<ReportControl>();
const open = ref(false);
const current = computed(() => props.tables.find((table) => table.id === selected.value?.id));
const fragments = computed(() => {
  void props.revision;
  return props.tables
    .filter((table) => table.reportLayout && table.outputRange)
    .flatMap((table) => {
      let headers: string[];
      try {
        headers = getPivotTableSource(props.workbook, table).headers;
      } catch {
        return [];
      }
      const controls = table.filters.map((filter, index) => ({
        area: "filters" as const,
        index,
        label: t("pivot.pageFilter", { field: headers[filter.field]! }),
        anchor: { row: table.anchor.row + index, column: table.anchor.column + 1 },
      }));
      const presentation = getPivotPresentation(table);
      const headerStart = table.anchor.row + (table.filters.length ? table.filters.length + 1 : 0);
      const headerEnd = table.anchor.row + (table.resultLayout?.headerRows ?? 1) - 1;
      const dimensions: Array<{
        area: "rows" | "columns";
        index: number;
        label: string;
        anchor: { row: number; column: number };
      }> = [];
      if (presentation.rowHeaders)
        table.rowFields
          .slice(0, presentation.layout === "compact" ? 1 : undefined)
          .forEach((field, index) =>
            dimensions.push({
              area: "rows",
              index,
              label: `${headers[field]} · ${t("pivot.sort")}`,
              anchor: { row: headerEnd, column: table.anchor.column + index },
            }),
          );
      if (presentation.columnHeaders && table.columnFields.length)
        dimensions.push({
          area: "columns",
          index: 0,
          label: `${table.columnFields.map((field) => headers[field]).join(" / ")} · ${t("pivot.sort")}`,
          anchor: {
            row: headerStart,
            column: table.anchor.column + (table.resultLayout?.labelColumns ?? 1),
          },
        });
      return [...controls, ...dimensions].flatMap((control) => {
        const { anchor } = control;
        const rect = props.layout.getRangeRect({ start: anchor, end: anchor });
        if (!rect) return [];
        return getFloatingImageViewportFragments(
          {
            anchor,
            offsetX: Math.max(0, rect.width - 18),
            offsetY: Math.max(0, (rect.height - 16) / 2),
            width: Math.min(16, rect.width),
            height: Math.min(16, rect.height),
          },
          props.layout,
        ).map((fragment) => ({ ...fragment, ...control, table }));
      });
    });
});
function filtered(table: SheetPivotTable, area: ReportControl["area"], index: number): boolean {
  return area === "filters"
    ? !table.filters[index]?.all
    : !!table.axisFilters?.some(
        (filter) =>
          filter.axis === area &&
          (filter.values !== undefined || filter.labelCondition || filter.valueCondition),
      );
}
function style(rect: Rect): CSSProperties {
  return {
    left: `${props.body.x + rect.x}px`,
    top: `${props.body.y + rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}
function menu(event: MouseEvent, id: string, area: ReportControl["area"], index: number): void {
  if (props.disabled) return;
  selected.value = { id, area, index };
  triggerRef.value = event.currentTarget as HTMLElement;
  open.value = true;
}
function key(event: KeyboardEvent, id: string, area: ReportControl["area"], index: number): void {
  if (props.disabled || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  selected.value = { id, area, index };
  triggerRef.value = event.currentTarget as HTMLElement;
  event.preventDefault();
  open.value = true;
}
watch(
  () => [props.revision, props.disabled],
  () => {
    open.value = false;
  },
);
</script>
<template>
  <div class="pivot-report-filters">
    <span
      v-for="fragment in fragments"
      :key="`${fragment.table.id}-${fragment.area}-${fragment.index}-${fragment.paneId}`"
      v-icon-action="disabled"
      :style="style(fragment.clippedRect)"
      class="pivot-report-filters__trigger"
      :data-pivot-report-filter="fragment.area === 'filters' ? fragment.index : undefined"
      :data-pivot-report-dimension="fragment.area === 'filters' ? undefined : fragment.area"
      :aria-label="fragment.label"
      :title="fragment.label"
      aria-haspopup="dialog"
      :aria-expanded="
        open &&
        selected?.id === fragment.table.id &&
        selected.area === fragment.area &&
        selected.index === fragment.index
      "
      @pointerdown.stop
      @keydown.stop="key($event, fragment.table.id, fragment.area, fragment.index)"
      @click.stop="menu($event, fragment.table.id, fragment.area, fragment.index)"
    >
      <Filter
        v-if="filtered(fragment.table, fragment.area, fragment.index)"
        :size="12"
        aria-hidden="true"
      />
      <ChevronDown v-else :size="12" aria-hidden="true" />
    </span>
  </div>
  <PivotFieldFilterPanel
    v-if="open && current && selected && triggerRef"
    :key="`${selected.id}-${selected.area}-${selected.index}`"
    :table="current"
    :workbook="workbook"
    :area="selected.area"
    :index="selected.index"
    :trigger="triggerRef"
    :disabled="disabled"
    @update="emit('update', $event)"
    @close="open = false"
  />
</template>
<style scoped lang="scss">
.pivot-report-filters {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
  &__trigger {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    pointer-events: auto;
    border: 1px solid var(--idea-border-control);
    background: var(--idea-surface-secondary);
    color: var(--idea-text-primary);
    cursor: pointer;
    &[aria-disabled="true"] {
      cursor: default;
    }
  }
}
</style>
