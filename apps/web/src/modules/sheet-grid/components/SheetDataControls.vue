<script setup lang="ts">
import { ChevronDown, Minus, Plus } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { columnIndexToLabel } from "@idea10/core/coordinates";
import type { CellAddress, SheetDimensionAxis } from "@idea10/core/workbook";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";
import SheetCellNotice from "./SheetCellNotice.vue";
import { useAppI18n } from "../../../shared/i18n";

type OutlineGroup = Readonly<{
  id: string;
  axis: SheetDimensionAxis;
  start: number;
  end: number;
  collapsed: boolean;
}>;

export type ActiveCellValidationInfo = Readonly<{
  values: readonly (string | number | boolean)[];
  prompt?: Readonly<{ title?: string; message: string }>;
}>;

const props = defineProps<{
  frame: SheetRenderFrame;
  filterRange?: Readonly<{ start: CellAddress; end: CellAddress }>;
  filteredColumns?: readonly number[];
  activeCell: CellAddress;
  validationInfo?: ActiveCellValidationInfo;
  suppressValidationPrompt?: boolean;
  outlineGroups?: readonly OutlineGroup[];
  subtotalSummaryBelow?: Readonly<Record<string, boolean>>;
  outlineControlOffset?: number;
  showOutline: boolean;
  readOnly: boolean;
}>();

const emit = defineEmits<{
  filterColumnRequest: [payload: { column: number; anchor: DOMRect }];
  validationChoose: [payload: { address: CellAddress; value: string | number | boolean }];
  outlineToggle: [payload: { id: string; collapsed: boolean }];
  outlineLevel: [payload: { axis: SheetDimensionAxis; level: number }];
}>();

const { t } = useAppI18n();
const validationOpen = ref(false);

function surfaceRect(address: CellAddress) {
  const rect = props.frame.layout.getCellViewportRect(address);
  return rect
    ? {
        left: props.frame.body.x + rect.x,
        top: props.frame.body.y + rect.y,
        width: rect.width,
        height: rect.height,
      }
    : undefined;
}

const filterButtons = computed(() => {
  const range = props.filterRange;
  if (!range) return [];
  const start = Math.min(range.start.column, range.end.column);
  const end = Math.max(range.start.column, range.end.column);
  const row = Math.min(range.start.row, range.end.row);
  const buttons: Array<{
    column: number;
    style: Record<string, string>;
    active: boolean;
  }> = [];
  const visibleColumns = new Set<number>();
  props.frame.layout.forEachVisibleCell((address) => {
    if (address.row === row && address.column >= start && address.column <= end)
      visibleColumns.add(address.column);
  });
  for (const column of visibleColumns) {
    const rect = surfaceRect({ row, column });
    if (!rect || rect.width < 22 || rect.height < 18) continue;
    buttons.push({
      column,
      active: props.filteredColumns?.includes(column) ?? false,
      style: {
        left: `${rect.left + rect.width - 18}px`,
        top: `${rect.top + Math.max(1, (rect.height - 16) / 2)}px`,
      },
    });
  }
  return buttons;
});

function getHeaderItem(axis: SheetDimensionAxis, index: number) {
  const panes = axis === "row" ? props.frame.rowHeaders : props.frame.columnHeaders;
  return panes.flatMap((pane) => pane.items).find((item) => item.index === index);
}

function getOutlineAnchor(axis: SheetDimensionAxis, group: OutlineGroup) {
  const panes = axis === "row" ? props.frame.rowHeaders : props.frame.columnHeaders;
  const items = panes.flatMap((pane) => pane.items).sort((left, right) => left.index - right.index);
  const subtotalGroupSeparator = group.id.lastIndexOf("-group-");
  const summaryBelow =
    group.axis === "row" && subtotalGroupSeparator > 0
      ? props.subtotalSummaryBelow?.[group.id.slice(0, subtotalGroupSeparator)]
      : undefined;
  if (summaryBelow === true) return getHeaderItem(axis, group.end + 1);
  if (summaryBelow === false) return getHeaderItem(axis, group.start - 1);
  if (!group.collapsed) return getHeaderItem(axis, group.end);
  return (
    [...items].reverse().find((item) => item.index < group.start) ??
    items.find((item) => item.index > group.end)
  );
}

const activeValidationRect = computed(() => surfaceRect(props.activeCell));
const validationButtonStyle = computed(() => {
  const rect = activeValidationRect.value;
  if (!rect || !props.validationInfo?.values.length || rect.width < 24 || rect.height < 18) return;
  return {
    left: `${rect.left + rect.width - 18}px`,
    top: `${rect.top + Math.max(1, (rect.height - 16) / 2)}px`,
  };
});

const outlineControls = computed(() => {
  if (!props.showOutline) return [];
  const groups = props.outlineGroups ?? [];
  const output: Array<{
    group: OutlineGroup;
    style: Record<string, string>;
    level: number;
  }> = [];
  for (const group of groups) {
    if (
      groups.some(
        (candidate) =>
          candidate.axis === group.axis &&
          candidate.id !== group.id &&
          candidate.collapsed &&
          candidate.start <= group.start &&
          candidate.end >= group.end,
      )
    )
      continue;
    const level =
      groups.filter(
        (candidate) =>
          candidate.axis === group.axis &&
          candidate.id !== group.id &&
          candidate.start <= group.start &&
          candidate.end >= group.end,
      ).length + 1;
    const item = getOutlineAnchor(group.axis, group);
    if (!item) continue;
    output.push({
      group,
      level,
      style:
        group.axis === "row"
          ? {
              left: `${2 + (props.outlineControlOffset ?? 0) + (level - 1) * 12}px`,
              top: `${item.offset + (item.size - 16) / 2}px`,
            }
          : {
              left: `${item.offset + Math.max(1, item.size - 14)}px`,
              top: `${2 + (props.outlineControlOffset ?? 0) + (level - 1) * 12}px`,
            },
    });
  }
  return output;
});

const outlineLevels = computed(() => {
  if (!props.showOutline) return { rows: 0, columns: 0 };
  const groups = props.outlineGroups ?? [];
  const maxLevel = (axis: SheetDimensionAxis) =>
    groups.reduce((max, group) => {
      if (group.axis !== axis) return max;
      const level =
        groups.filter(
          (candidate) =>
            candidate.axis === axis &&
            candidate.id !== group.id &&
            candidate.start <= group.start &&
            candidate.end >= group.end,
        ).length + 1;
      return Math.max(max, level);
    }, 0);
  return { rows: maxLevel("row"), columns: maxLevel("column") };
});

function requestColumnFilter(column: number, event: MouseEvent): void {
  emit("filterColumnRequest", {
    column,
    anchor: (event.currentTarget as HTMLElement).getBoundingClientRect(),
  });
}

function chooseValidation(value: string | number | boolean): void {
  if (props.readOnly) return;
  validationOpen.value = false;
  emit("validationChoose", { address: { ...props.activeCell }, value });
}

watch(
  () => `${props.activeCell.row}:${props.activeCell.column}`,
  () => {
    validationOpen.value = false;
  },
);
</script>

<template>
  <div class="sheet-data-controls" aria-hidden="false">
    <button
      v-for="button in filterButtons"
      :key="button.column"
      type="button"
      class="sheet-data-controls__filter"
      :style="button.style"
      :class="{ 'is-active': button.active }"
      :aria-label="`${t('dataTools.filter.openColumn')} ${columnIndexToLabel(button.column)}`"
      :title="t('dataTools.filter.openColumn')"
      :disabled="readOnly"
      @pointerdown.stop
      @click.stop="requestColumnFilter(button.column, $event)"
    >
      <ChevronDown :size="13" aria-hidden="true" />
    </button>

    <template v-if="validationButtonStyle && validationInfo">
      <button
        type="button"
        class="sheet-data-controls__validation"
        :style="validationButtonStyle"
        :aria-label="t('dataTools.validation.openList')"
        :title="validationInfo.prompt?.message || t('dataTools.validation.openList')"
        :aria-expanded="validationOpen"
        :disabled="readOnly"
        @pointerdown.stop
        @click.stop="validationOpen = !validationOpen"
      >
        <ChevronDown :size="13" aria-hidden="true" />
      </button>
      <div
        v-if="validationOpen"
        class="sheet-data-controls__validation-menu"
        :style="{
          left: `${activeValidationRect!.left}px`,
          top: `${activeValidationRect!.top + activeValidationRect!.height}px`,
          minWidth: `${Math.max(140, activeValidationRect!.width)}px`,
        }"
        role="listbox"
        :aria-label="t('dataTools.validation.openList')"
        @keydown.escape.stop="validationOpen = false"
      >
        <button
          v-for="(value, index) in validationInfo.values"
          :key="`${typeof value}:${String(value)}:${index}`"
          type="button"
          role="option"
          @pointerdown.stop
          @click.stop="chooseValidation(value)"
        >
          {{ value }}
        </button>
      </div>
    </template>
    <SheetCellNotice
      v-if="validationInfo?.prompt?.message && !validationOpen && !suppressValidationPrompt"
      :frame="frame"
      :address="activeCell"
      :title="validationInfo.prompt.title"
      :message="validationInfo.prompt.message"
      tone="information"
      data-sheet-validation-prompt
    />

    <button
      v-for="control in outlineControls"
      :key="control.group.id"
      type="button"
      class="sheet-data-controls__outline"
      :style="control.style"
      :aria-label="
        t(control.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
      "
      :title="
        t(control.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
      "
      :disabled="readOnly"
      @pointerdown.stop
      @click.stop="
        emit('outlineToggle', {
          id: control.group.id,
          collapsed: !control.group.collapsed,
        })
      "
    >
      <Plus v-if="control.group.collapsed" :size="11" aria-hidden="true" />
      <Minus v-else :size="11" aria-hidden="true" />
    </button>

    <div
      v-if="outlineLevels.rows"
      class="sheet-data-controls__outline-levels sheet-data-controls__outline-levels--rows"
      :style="{ left: `${2 + (outlineControlOffset ?? 0)}px` }"
    >
      <button
        v-for="level in outlineLevels.rows + 1"
        :key="level"
        type="button"
        :disabled="readOnly"
        @click.stop="emit('outlineLevel', { axis: 'row', level: level - 1 })"
      >
        {{ level }}
      </button>
    </div>
    <div
      v-if="outlineLevels.columns"
      class="sheet-data-controls__outline-levels sheet-data-controls__outline-levels--columns"
      :style="{ top: `${2 + (outlineControlOffset ?? 0)}px` }"
    >
      <button
        v-for="level in outlineLevels.columns + 1"
        :key="level"
        type="button"
        :disabled="readOnly"
        @click.stop="emit('outlineLevel', { axis: 'column', level: level - 1 })"
      >
        {{ level }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-data-controls {
  position: absolute;
  z-index: 12;
  inset: 0;
  pointer-events: none;

  button {
    font: inherit;
  }

  &__filter,
  &__validation,
  &__outline {
    position: absolute;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    color: var(--idea-text-secondary);
    background: color-mix(in srgb, var(--idea-surface-panel) 78%, transparent);
    cursor: pointer;
    pointer-events: auto;

    &:hover,
    &:focus-visible {
      color: var(--idea-action-primary);
      background: var(--idea-action-hover);
      outline: none;
    }
    &.is-active {
      color: var(--idea-action-primary);
      background: var(--idea-action-subtle, var(--idea-action-hover));
    }
    &:disabled {
      cursor: default;
      opacity: 0.52;
    }
  }

  &__outline {
    border: 1px solid var(--idea-border-control);
    background: var(--idea-surface-panel);
  }

  &__validation-menu {
    position: absolute;
    z-index: 2;
    display: grid;
    max-height: 220px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--idea-border-control);
    border-radius: 4px;
    background: var(--idea-surface-panel);
    box-shadow: var(--idea-shadow-2, 0 6px 16px rgb(0 0 0 / 15%));
    pointer-events: auto;

    button {
      min-height: 26px;
      padding: 3px 8px;
      border: 0;
      border-radius: 3px;
      color: var(--idea-text-primary);
      background: transparent;
      text-align: left;
      cursor: pointer;
      &:hover,
      &:focus-visible {
        background: var(--idea-action-hover);
        outline: none;
      }
    }
  }

  &__outline-levels {
    position: absolute;
    display: flex;
    gap: 2px;
    pointer-events: auto;
    button {
      width: 14px;
      height: 14px;
      padding: 0;
      border: 0;
      border-radius: 2px;
      color: var(--idea-text-secondary);
      background: var(--idea-surface-panel);
      cursor: pointer;
      font-size: 10px;
    }
    button:hover,
    button:focus-visible {
      color: var(--idea-action-primary);
      background: var(--idea-action-hover);
      outline: none;
    }
    &--rows {
      left: 2px;
      top: 2px;
    }
    &--columns {
      right: 2px;
      top: 2px;
    }
  }
}
</style>
