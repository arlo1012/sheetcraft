<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { ChevronDown } from "lucide-vue-next";
import {
  getPivotTableSource,
  getPivotPresentation,
  normalizePivotTable,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import { isFormulaError } from "@idea10/core/formula";
import type { Workbook, CellValue } from "@idea10/core/workbook";
import { getFloatingImageViewportFragments } from "@idea10/sheet-engine/floating-image-layout";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { Rect } from "@idea10/sheet-engine/geometry";
import { useAppI18n } from "../../../shared/i18n";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { vIconAction } from "../../../shared/focus/icon-action";

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
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const selected = ref<ReportControl>();
const { open, floatingStyles, openMenu, onTriggerKeydown, dismiss } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});
const current = computed(() => props.tables.find((table) => table.id === selected.value?.id));
const filter = computed(() =>
  selected.value?.area === "filters" ? current.value?.filters[selected.value.index] : undefined,
);
const choices = computed(() => {
  void props.revision;
  if (!current.value || !filter.value) return [];
  const values = new Map<string, CellValue>();
  try {
    for (const record of getPivotTableSource(props.workbook, current.value).records()) {
      const value = record[filter.value.field] ?? null;
      if (!isFormulaError(value)) values.set(JSON.stringify(value), value);
    }
  } catch {
    return [];
  }
  return [...values].map(([key, value]) => ({
    key,
    value,
    label: value === null || value === "" ? t("pivot.empty") : String(value),
  }));
});
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
  openMenu();
}
function key(event: KeyboardEvent, id: string, area: ReportControl["area"], index: number): void {
  if (props.disabled || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  selected.value = { id, area, index };
  triggerRef.value = event.currentTarget as HTMLElement;
  onTriggerKeydown(event);
}
function apply(value?: CellValue): void {
  if (!current.value || !selected.value || props.disabled) return;
  const table = normalizePivotTable(current.value);
  table.filters[selected.value.index] = {
    ...table.filters[selected.value.index]!,
    all: value === undefined,
    values: value === undefined ? [] : [value],
  };
  dismiss();
  emit("update", table);
}
function settings(): void {
  if (selected.value) {
    dismiss();
    emit("settings", selected.value.id, selected.value.index);
  }
}
function sort(order: SheetPivotTable["sort"]): void {
  if (!current.value || props.disabled) return;
  const table = normalizePivotTable(current.value);
  table.sort = order;
  dismiss();
  emit("update", table);
}
watch(
  () => props.revision,
  () => dismiss("programmatic", false),
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
      aria-haspopup="menu"
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
      <ChevronDown :size="12" aria-hidden="true" />
    </span>
  </div>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      ref="menuSurfaceRef"
      :style="floatingStyles"
      :label="t(selected?.area === 'filters' ? 'pivot.filters' : 'pivot.sort')"
    >
      <template #items>
        <template v-if="selected?.area !== 'filters'">
          <MenuRadioItem :checked="current?.sort === 'ascending'" @select="sort('ascending')">{{
            t("pivot.ascending")
          }}</MenuRadioItem>
          <MenuRadioItem :checked="current?.sort === 'descending'" @select="sort('descending')">{{
            t("pivot.descending")
          }}</MenuRadioItem>
          <MenuRadioItem :checked="current?.sort === 'source'" @select="sort('source')">{{
            t("pivot.sourceOrder")
          }}</MenuRadioItem>
        </template>
        <template v-else>
          <MenuRadioItem :checked="!!filter?.all" @select="apply()">{{
            t("pivot.reportAll")
          }}</MenuRadioItem>
          <MenuRadioItem
            v-for="choice in choices"
            :key="choice.key"
            :checked="
              !filter?.all &&
              filter?.values.length === 1 &&
              JSON.stringify(filter.values[0]) === choice.key
            "
            @select="apply(choice.value)"
            >{{ choice.label }}</MenuRadioItem
          >
          <MenuItem @select="settings">{{ t("pivot.filterItems") }}…</MenuItem>
        </template>
      </template>
    </MenuSurface>
  </Teleport>
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
