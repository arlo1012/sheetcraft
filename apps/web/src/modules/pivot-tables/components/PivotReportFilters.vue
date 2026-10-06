<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import { ChevronDown } from "lucide-vue-next";
import {
  getPivotTableSource,
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
const selected = ref<{ id: string; index: number }>();
const { open, floatingStyles, openMenu, dismiss } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});
const current = computed(() => props.tables.find((table) => table.id === selected.value?.id));
const filter = computed(() => selected.value && current.value?.filters[selected.value.index]);
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
const fragments = computed(() =>
  props.tables
    .filter(
      (table) =>
        table.reportLayout &&
        table.outputRange &&
        table.outputRange.end.column > table.anchor.column,
    )
    .flatMap((table) =>
      table.filters.flatMap((filter, index) => {
        const anchor = { row: table.anchor.row + index, column: table.anchor.column + 1 };
        const rect = props.layout.getRangeRect({ start: anchor, end: anchor });
        if (!rect) return [];
        return getFloatingImageViewportFragments(
          {
            anchor,
            offsetX: Math.max(0, rect.width - 20),
            offsetY: 0,
            width: Math.min(20, rect.width),
            height: rect.height,
          },
          props.layout,
        ).map((fragment) => ({ ...fragment, table, index, filter }));
      }),
    ),
);
function style(rect: Rect): CSSProperties {
  return {
    left: `${props.body.x + rect.x}px`,
    top: `${props.body.y + rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}
function menu(event: MouseEvent, id: string, index: number): void {
  if (props.disabled) return;
  selected.value = { id, index };
  triggerRef.value = event.currentTarget as HTMLElement;
  openMenu();
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
watch(
  () => props.revision,
  () => dismiss("programmatic", false),
);
</script>
<template>
  <div class="pivot-report-filters">
    <button
      v-for="fragment in fragments"
      :key="`${fragment.table.id}-${fragment.index}-${fragment.paneId}`"
      type="button"
      :style="style(fragment.clippedRect)"
      :disabled="disabled"
      class="pivot-report-filters__trigger"
      :data-pivot-report-filter="fragment.index"
      :aria-label="
        t('pivot.pageFilter', {
          field:
            fragment.table.consolidation?.labels[fragment.filter.field] ??
            String(fragment.filter.field + 1),
        })
      "
      aria-haspopup="menu"
      :aria-expanded="
        open && selected?.id === fragment.table.id && selected.index === fragment.index
      "
      @pointerdown.stop
      @click.stop="menu($event, fragment.table.id, fragment.index)"
    >
      <ChevronDown :size="12" />
    </button>
  </div>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      ref="menuSurfaceRef"
      :style="floatingStyles"
      :label="t('pivot.filters')"
    >
      <template #items>
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
    &:disabled {
      cursor: default;
    }
  }
}
</style>
