<script setup lang="ts">
import { ChevronDown, Minus, Plus } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { columnIndexToLabel } from "@idea10/core/coordinates";
import type { CellAddress, CellRange, SheetDimensionAxis } from "@idea10/core/workbook";
import type { SheetRenderFrame } from "../rendering/sheet-render-frame";
import {
  createOutlinePanes,
  getOutlineParents,
  getOutlineGutterSize,
  type OutlineGroup,
} from "../outline-layout";
import SheetCellNotice from "./SheetCellNotice.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuSearch from "../../../shared/menu/MenuSearch.vue";
import { useMenu } from "../../../shared/menu/useMenu";

export type ActiveCellValidationInfo = Readonly<{
  values: readonly (string | number | boolean)[];
  prompt?: Readonly<{ title?: string; message: string }>;
}>;

export type SheetFilterControl = Readonly<{
  range: CellRange;
  filteredColumns?: readonly number[];
  tableId?: string;
}>;

const props = defineProps<{
  frame: SheetRenderFrame;
  filterRange?: Readonly<{ start: CellAddress; end: CellAddress }>;
  filteredColumns?: readonly number[];
  tableFilters?: readonly SheetFilterControl[];
  activeCell: CellAddress;
  validationInfo?: ActiveCellValidationInfo;
  suppressValidationPrompt?: boolean;
  outlineGroups?: readonly OutlineGroup[];
  subtotalSummaryBelow?: Readonly<Record<string, boolean>>;
  outlineControlOffset?: number;
  showOutline: boolean;
  readOnly: boolean;
  contentReadOnly?: boolean;
  filterReadOnly?: boolean;
}>();

const emit = defineEmits<{
  filterColumnRequest: [
    payload: {
      column: number;
      range: CellRange;
      tableId?: string;
      anchor: DOMRect;
    },
  ];
  validationChoose: [payload: { address: CellAddress; value: string | number | boolean }];
  outlineToggle: [payload: { id: string; collapsed: boolean }];
  outlineLevel: [payload: { axis: SheetDimensionAxis; level: number }];
}>();

const { t } = useAppI18n();
const validationTriggerRef = ref<HTMLElement | null>(null);
const validationMenuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const validationMenuId = `sheet-validation-menu-${useId().replaceAll(":", "")}`;
const validationSearch = ref("");
const validationSearchRef = ref<InstanceType<typeof MenuSearch> | null>(null);
const validationChoices = computed(() => {
  const seen = new Set<string>();
  return (props.validationInfo?.values ?? []).filter((value) => {
    const text = String(value);
    if (text === "" || seen.has(text)) return false;
    seen.add(text);
    return true;
  });
});
const validationOptions = computed(() => {
  const query = validationSearch.value.trim().toLocaleLowerCase();
  return validationChoices.value.filter((value) =>
    String(value).toLocaleLowerCase().includes(query),
  );
});

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
  const filters = [
    ...(props.filterRange
      ? [{ range: props.filterRange, filteredColumns: props.filteredColumns, tableId: undefined }]
      : []),
    ...(props.tableFilters ?? []),
  ];
  const buttons: Array<{
    column: number;
    range: Readonly<{ start: CellAddress; end: CellAddress }>;
    tableId?: string;
    style: Record<string, string>;
    active: boolean;
  }> = [];
  for (const filter of filters) {
    const start = Math.min(filter.range.start.column, filter.range.end.column);
    const end = Math.max(filter.range.start.column, filter.range.end.column);
    const row = Math.min(filter.range.start.row, filter.range.end.row);
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
        range: filter.range,
        ...(filter.tableId ? { tableId: filter.tableId } : {}),
        active: filter.filteredColumns?.includes(column) ?? false,
        style: {
          left: `${rect.left + rect.width - 18}px`,
          top: `${rect.top + Math.max(1, (rect.height - 16) / 2)}px`,
        },
      });
    }
  }
  return buttons;
});

const activeValidationRect = computed(() => surfaceRect(props.activeCell));
const validationButtonStyle = computed(() => {
  const rect = activeValidationRect.value;
  if (!rect || !validationChoices.value.length || rect.width < 24 || rect.height < 18) return;
  return {
    left: `${rect.left + rect.width + 1}px`,
    top: `${rect.top + Math.max(1, (rect.height - 16) / 2)}px`,
  };
});

const {
  open: validationOpen,
  floatingStyles: validationMenuStyle,
  dismiss: dismissValidation,
  toggleMenu: toggleValidationMenu,
  onTriggerKeydown: onValidationTriggerKeydown,
} = useMenu({
  triggerRef: validationTriggerRef,
  menuSurfaceRef: validationMenuRef,
  disabled: computed(
    () => (props.contentReadOnly ?? props.readOnly) || !validationButtonStyle.value,
  ),
  placement: "bottom-end",
  offset: 4,
  pointerFocus: "menu",
  onOpen() {
    validationSearch.value = "";
  },
});

async function toggleValidation(event: MouseEvent): Promise<void> {
  toggleValidationMenu(event);
  await nextTick();
  if (validationOpen.value) validationSearchRef.value?.focus();
}

function onValidationSearchKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (event.key === "ArrowDown") validationMenuRef.value?.focusFirstItem();
    else validationMenuRef.value?.focusLastItem();
  } else if (event.key === "Enter" && validationOptions.value.length) {
    event.preventDefault();
    chooseValidation(validationOptions.value[0]!);
  }
}

const outlineLevels = computed(() => {
  if (!props.showOutline) return { rows: 0, columns: 0 };
  const groups = props.outlineGroups ?? [];
  const maxLevel = (axis: SheetDimensionAxis) =>
    groups.reduce((max, group) => {
      if (group.axis !== axis) return max;
      const level = getOutlineParents(group, groups).length + 1;
      return Math.max(max, level);
    }, 0);
  return { rows: maxLevel("row"), columns: maxLevel("column") };
});

const rowOutlineWidth = computed(() => getOutlineGutterSize(outlineLevels.value.rows));
const columnOutlineHeight = computed(() => getOutlineGutterSize(outlineLevels.value.columns));
const rowOutlinePanes = computed(() =>
  props.showOutline && rowOutlineWidth.value
    ? createOutlinePanes(
        "row",
        props.frame.rowHeaders,
        props.outlineGroups ?? [],
        props.subtotalSummaryBelow,
      )
    : [],
);
const columnOutlinePanes = computed(() =>
  props.showOutline && columnOutlineHeight.value
    ? createOutlinePanes("column", props.frame.columnHeaders, props.outlineGroups ?? [])
    : [],
);

function requestColumnFilter(
  button: (typeof filterButtons.value)[number],
  event: MouseEvent,
): void {
  emit("filterColumnRequest", {
    column: button.column,
    range: { start: { ...button.range.start }, end: { ...button.range.end } },
    ...(button.tableId ? { tableId: button.tableId } : {}),
    anchor: (event.currentTarget as HTMLElement).getBoundingClientRect(),
  });
}

function chooseValidation(value: string | number | boolean): void {
  if (props.contentReadOnly ?? props.readOnly) return;
  dismissValidation("programmatic", true);
  emit("validationChoose", { address: { ...props.activeCell }, value });
}

watch(
  () => `${props.activeCell.row}:${props.activeCell.column}`,
  () => {
    dismissValidation("programmatic", false);
  },
);
</script>

<template>
  <div class="sheet-data-controls" aria-hidden="false">
    <span
      v-for="button in filterButtons"
      :key="`${button.tableId ?? 'sheet'}:${button.column}`"
      v-icon-action="filterReadOnly ?? readOnly"
      class="sheet-data-controls__filter"
      :style="button.style"
      :class="{ 'is-active': button.active }"
      :aria-label="`${t('dataTools.filter.openColumn')} ${columnIndexToLabel(button.column)}`"
      :title="t('dataTools.filter.openColumn')"
      @pointerdown.stop
      @click.stop="requestColumnFilter(button, $event)"
    >
      <ChevronDown :size="13" aria-hidden="true" />
    </span>

    <template v-if="validationButtonStyle && validationInfo">
      <span
        ref="validationTriggerRef"
        v-icon-action="contentReadOnly ?? readOnly"
        class="sheet-data-controls__validation"
        :style="validationButtonStyle"
        :aria-label="t('dataTools.validation.openList')"
        :title="validationInfo.prompt?.message || t('dataTools.validation.openList')"
        :aria-expanded="validationOpen"
        :aria-controls="validationOpen ? validationMenuId : undefined"
        aria-haspopup="menu"
        @pointerdown.stop
        @click.stop="toggleValidation"
        @keydown.stop="onValidationTriggerKeydown"
      >
        <ChevronDown :size="13" aria-hidden="true" />
      </span>
      <Teleport to="body">
        <MenuSurface
          v-if="validationOpen"
          :id="validationMenuId"
          ref="validationMenuRef"
          class="sheet-data-controls__validation-menu"
          :style="[
            validationMenuStyle,
            { width: `${Math.max(180, activeValidationRect!.width)}px` },
          ]"
          :label="t('dataTools.validation.openList')"
          @pointerdown.stop
          @click.stop
        >
          <MenuSearch
            ref="validationSearchRef"
            v-model="validationSearch"
            :label="t('dataTools.validation.searchValues')"
            @keydown="onValidationSearchKeydown"
          />
          <MenuItem
            v-for="(value, index) in validationOptions"
            :key="`${typeof value}:${String(value)}:${index}`"
            class="sheet-data-controls__validation-item"
            :disabled="contentReadOnly ?? readOnly"
            :title="String(value)"
            @select="chooseValidation(value)"
          >
            {{ value }}
          </MenuItem>
          <li
            v-if="!validationOptions.length"
            class="sheet-data-controls__validation-empty"
            role="none"
          >
            <span role="status">{{ t("dataTools.filter.noMatches") }}</span>
          </li>
        </MenuSurface>
      </Teleport>
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

    <div
      v-for="pane in rowOutlinePanes"
      :key="pane.id"
      class="sheet-data-controls__row-outline-pane"
      :style="{
        left: `${outlineControlOffset ?? 0}px`,
        top: `${pane.offset}px`,
        width: `${rowOutlineWidth}px`,
        height: `${pane.size}px`,
      }"
    >
      <span
        v-for="dot in pane.dots"
        :key="`dot-${dot.index}`"
        class="sheet-data-controls__outline-dot"
        :style="{ left: `${dot.lane}px`, top: `${dot.offset}px` }"
        aria-hidden="true"
      />
      <div
        v-for="track in pane.tracks"
        :key="track.group.id"
        class="sheet-data-controls__row-outline-track"
        :style="{ left: `${track.lane}px`, top: `${track.offset}px`, height: `${track.length}px` }"
      >
        <span
          v-if="!track.group.collapsed"
          class="sheet-data-controls__row-outline-line"
          :class="{
            'has-start': track.start,
            'has-end': track.end,
            'has-button': track.button,
            'has-button-at-start': track.button && track.buttonAtStart,
          }"
          aria-hidden="true"
        />
        <span
          v-if="track.button"
          v-icon-action="readOnly"
          class="sheet-data-controls__outline sheet-data-controls__outline--row"
          :style="{ top: `${track.buttonAtStart ? 0 : track.length - 16}px` }"
          :data-outline-id="track.group.id"
          :aria-label="
            t(track.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
          "
          :title="
            t(track.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
          "
          :aria-expanded="!track.group.collapsed"
          @pointerdown.stop
          @click.stop="
            emit('outlineToggle', { id: track.group.id, collapsed: !track.group.collapsed })
          "
        >
          <Plus v-if="track.group.collapsed" :size="10" :stroke-width="2.5" aria-hidden="true" />
          <Minus v-else :size="10" :stroke-width="2.5" aria-hidden="true" />
        </span>
      </div>
    </div>

    <div
      v-for="pane in columnOutlinePanes"
      :key="pane.id"
      class="sheet-data-controls__column-outline-pane"
      :style="{
        left: `${pane.offset}px`,
        top: `${outlineControlOffset ?? 0}px`,
        width: `${pane.size}px`,
        height: `${columnOutlineHeight}px`,
      }"
    >
      <span
        v-for="dot in pane.dots"
        :key="`dot-${dot.index}`"
        class="sheet-data-controls__outline-dot"
        :style="{ left: `${dot.offset}px`, top: `${dot.lane}px` }"
        aria-hidden="true"
      />
      <div
        v-for="track in pane.tracks"
        :key="track.group.id"
        class="sheet-data-controls__column-outline-track"
        :style="{ left: `${track.offset}px`, top: `${track.lane}px`, width: `${track.length}px` }"
      >
        <span
          v-if="!track.group.collapsed"
          class="sheet-data-controls__column-outline-line"
          :class="{ 'has-start': track.start, 'has-button': track.button }"
          aria-hidden="true"
        />
        <span
          v-if="track.button"
          v-icon-action="readOnly"
          class="sheet-data-controls__outline sheet-data-controls__outline--column"
          :data-outline-id="track.group.id"
          :aria-label="
            t(track.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
          "
          :title="
            t(track.group.collapsed ? 'dataTools.outline.expand' : 'dataTools.outline.collapse')
          "
          :aria-expanded="!track.group.collapsed"
          @pointerdown.stop
          @click.stop="
            emit('outlineToggle', { id: track.group.id, collapsed: !track.group.collapsed })
          "
        >
          <Plus v-if="track.group.collapsed" :size="10" :stroke-width="2.5" aria-hidden="true" />
          <Minus v-else :size="10" :stroke-width="2.5" aria-hidden="true" />
        </span>
      </div>
    </div>

    <div
      v-if="outlineLevels.rows"
      class="sheet-data-controls__outline-levels sheet-data-controls__outline-levels--rows"
      :style="{
        left: `${2 + (outlineControlOffset ?? 0)}px`,
        top: `${frame.headerSize.height - 18}px`,
      }"
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
      :style="{
        top: `${2 + (outlineControlOffset ?? 0)}px`,
        left: `${frame.headerSize.width - 18}px`,
      }"
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
@use "../../../shared/option-list/option-list";

.sheet-data-controls {
  position: absolute;
  z-index: 12;
  inset: 0;
  pointer-events: none;

  [role="button"] {
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

    &.is-active {
      color: var(--idea-action-primary);
      background: var(--idea-action-subtle, var(--idea-action-hover));
    }
    &[aria-disabled="true"] {
      cursor: default;
      opacity: 0.52;
    }
  }

  &__outline {
    border-radius: 0;
    color: var(--idea-text-primary);
    background: transparent;

    &::before {
      content: "";
      position: absolute;
      inset: 2px;
      border: 1px solid var(--idea-border-control);
      border-radius: 0;
      background: var(--idea-surface-panel);
    }
    svg {
      position: relative;
    }
    &:hover:not([aria-disabled="true"])::before {
      background: color-mix(in srgb, var(--idea-text-primary) 8%, var(--idea-surface-panel));
    }
  }

  &__outline-dot {
    position: absolute;
    width: 2px;
    height: 2px;
    background: var(--idea-text-primary);
    transform: translate(-50%, -50%);
  }

  &__validation-menu {
    @include option-list.scrollbar;
    z-index: var(--idea-layer-sheet-menu);
    display: flex;
    flex-direction: column;
    max-height: min(320px, calc(100vh - var(--idea-space-4) - var(--idea-space-4)));
    scroll-padding-top: 32px;
    pointer-events: auto;
  }

  &__validation-item {
    flex: 0 0 auto;
    min-width: 0;
  }

  &__validation-empty {
    padding: 6px 14px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    list-style: none;
  }

  &__row-outline-pane,
  &__column-outline-pane {
    position: absolute;
    overflow: hidden;
  }
  &__row-outline-track {
    position: absolute;
    width: 16px;
  }
  &__row-outline-line {
    position: absolute;
    left: 8px;
    top: 0;
    bottom: 0;
    width: 4px;
    border-left: 1px solid var(--idea-text-primary);
    &.has-start {
      border-top: 1px solid var(--idea-text-primary);
    }
    &.has-end {
      border-bottom: 1px solid var(--idea-text-primary);
    }
    &.has-button {
      bottom: 16px;
    }
    &.has-button-at-start {
      top: 16px;
      bottom: 0;
    }
  }
  &__outline--row {
    left: 0;
  }
  &__column-outline-track {
    position: absolute;
    height: 16px;
  }
  &__column-outline-line {
    position: absolute;
    top: 8px;
    left: 0;
    right: 0;
    height: 4px;
    border-top: 1px solid var(--idea-text-primary);
    &.has-start {
      border-left: 1px solid var(--idea-text-primary);
    }
    &.has-button {
      right: 16px;
    }
  }
  &__outline--column {
    right: 0;
    top: 0;
  }

  &__outline-levels {
    position: absolute;
    display: flex;
    gap: 4px;
    pointer-events: auto;
    button {
      display: grid;
      place-items: center;
      box-sizing: border-box;
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      padding: 0;
      border: 1px solid var(--idea-border-control);
      border-radius: 0;
      color: var(--idea-text-primary);
      background: var(--idea-surface-panel);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }
    button:hover {
      color: var(--idea-action-primary);
      background: var(--idea-action-hover);
      outline: none;
    }
    &--rows {
      left: 2px;
      top: 2px;
    }
    &--columns {
      flex-direction: column;
    }
  }
}
</style>
