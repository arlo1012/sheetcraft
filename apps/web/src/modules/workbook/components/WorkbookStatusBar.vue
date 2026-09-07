<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import type { SelectionSummary } from "@idea10/core/selection-summary";
import type { Sheet, SheetProperties } from "@idea10/core/workbook";
import { useStatusBarSettings } from "../composables/useStatusBarSettings";
import { useSheetTabsWidth } from "../composables/useSheetTabsWidth";
import { formatStatusBarNumber } from "../status-bar-number-format";
import WorkbookStatusBarSettings from "./WorkbookStatusBarSettings.vue";
import WorkbookSheetTabs from "./WorkbookSheetTabs.vue";
import WorkbookViewControls from "./WorkbookViewControls.vue";

const props = withDefaults(
  defineProps<{
    sheets: readonly Sheet[];
    activeSheetId: string;
    selectionSummary: SelectionSummary;
    zoom?: number;
    showHeaders?: boolean;
    showGridLines?: boolean;
    showAxisQuickTools?: boolean;
    highlightEnabled?: boolean;
    highlightColor?: string;
    fullscreen?: boolean;
    fullscreenAvailable?: boolean;
  }>(),
  {
    zoom: 100,
    showHeaders: true,
    showGridLines: true,
    showAxisQuickTools: false,
    highlightEnabled: false,
    highlightColor: "#22a06b",
    fullscreen: false,
    fullscreenAvailable: false,
  },
);

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  duplicate: [sheetId: string];
  rename: [payload: { sheetId: string; name: string }];
  move: [payload: { sheetId: string; toIndex: number }];
  delete: [sheetId: string];
  updateProperties: [payload: { sheetId: string; patch: Partial<SheetProperties> }];
  restore: [sheetId: string];
  "update:zoom": [value: number];
  "update:showHeaders": [value: boolean];
  "update:showGridLines": [value: boolean];
  "update:showAxisQuickTools": [value: boolean];
  "update:highlightEnabled": [value: boolean];
  "update:highlightColor": [value: string];
  toggleFullscreen: [];
  fitSelection: [];
}>();

const { locale, t } = useAppI18n();
const settings = useStatusBarSettings();
const topRowRef = ref<HTMLDivElement | null>(null);
const sheetsRegionId = `workbook-sheet-tabs-${useId().replaceAll(":", "")}`;
const {
  width: sheetsWidth,
  minimum: minimumSheetsWidth,
  maximum: maximumSheetsWidth,
  resizing,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeydown,
} = useSheetTabsWidth(topRowRef);
const shouldShowSummary = computed(
  () =>
    props.selectionSummary.selectedCellCount > 1 &&
    props.selectionSummary.count > 0 &&
    (settings.value.count ||
      settings.value.numericCount ||
      (props.selectionSummary.numericCount > 0 &&
        (settings.value.average ||
          settings.value.minimum ||
          settings.value.maximum ||
          settings.value.sum))),
);

function formatNumber(value: number): string {
  return formatStatusBarNumber(value, locale.value, settings.value.numberFormat);
}
</script>

<template>
  <footer class="workbook-status-bar" :aria-label="t('statusBar.label')">
    <div
      ref="topRowRef"
      class="workbook-status-bar__top-row"
      :style="{ '--sheet-tabs-width': `${sheetsWidth}px` }"
    >
      <div :id="sheetsRegionId" class="workbook-status-bar__sheets">
        <WorkbookSheetTabs
          :sheets="sheets"
          :active-sheet-id="activeSheetId"
          @select="emit('select', $event)"
          @add="emit('add')"
          @duplicate="emit('duplicate', $event)"
          @rename="emit('rename', $event)"
          @move="emit('move', $event)"
          @delete="emit('delete', $event)"
          @update-properties="emit('updateProperties', $event)"
          @restore="emit('restore', $event)"
        />
      </div>
      <div
        class="workbook-status-bar__splitter"
        :class="{ 'is-resizing': resizing }"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('statusBar.resizeSheetTabs')"
        :title="t('statusBar.resizeSheetTabs')"
        :aria-controls="sheetsRegionId"
        :aria-valuemin="minimumSheetsWidth"
        :aria-valuemax="maximumSheetsWidth"
        :aria-valuenow="sheetsWidth"
        :aria-disabled="maximumSheetsWidth <= minimumSheetsWidth"
        :tabindex="maximumSheetsWidth > minimumSheetsWidth ? 0 : -1"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
        @lostpointercapture="onPointerUp"
        @keydown="onKeydown"
      />
      <div class="workbook-status-bar__horizontal-scrollbar">
        <slot name="horizontal-scrollbar" />
      </div>
    </div>
    <div class="workbook-status-bar__bottom-row">
      <WorkbookStatusBarSettings v-model="settings" />
      <div class="workbook-status-bar__metrics">
        <dl
          v-if="shouldShowSummary"
          class="workbook-status-bar__summary"
          :aria-label="t('statusBar.selectionSummary')"
          data-selection-summary
        >
          <div v-if="settings.count" class="workbook-status-bar__stat">
            <dt>{{ t("statusBar.count") }}</dt>
            <dd :title="formatNumber(selectionSummary.count)">
              {{ formatNumber(selectionSummary.count) }}
            </dd>
          </div>
          <div
            v-if="settings.average && selectionSummary.numericCount > 0"
            class="workbook-status-bar__stat"
          >
            <dt>{{ t("statusBar.average") }}</dt>
            <dd :title="formatNumber(selectionSummary.average)">
              {{ formatNumber(selectionSummary.average) }}
            </dd>
          </div>
          <div v-if="settings.numericCount" class="workbook-status-bar__stat">
            <dt>{{ t("statusBar.numericCount") }}</dt>
            <dd :title="formatNumber(selectionSummary.numericCount)">
              {{ formatNumber(selectionSummary.numericCount) }}
            </dd>
          </div>
          <div
            v-if="settings.minimum && selectionSummary.numericCount > 0"
            class="workbook-status-bar__stat"
          >
            <dt>{{ t("statusBar.minimum") }}</dt>
            <dd :title="formatNumber(selectionSummary.minimum)">
              {{ formatNumber(selectionSummary.minimum) }}
            </dd>
          </div>
          <div
            v-if="settings.maximum && selectionSummary.numericCount > 0"
            class="workbook-status-bar__stat"
          >
            <dt>{{ t("statusBar.maximum") }}</dt>
            <dd :title="formatNumber(selectionSummary.maximum)">
              {{ formatNumber(selectionSummary.maximum) }}
            </dd>
          </div>
          <div
            v-if="settings.sum && selectionSummary.numericCount > 0"
            class="workbook-status-bar__stat"
          >
            <dt>{{ t("statusBar.sum") }}</dt>
            <dd :title="formatNumber(selectionSummary.sum)">
              {{ formatNumber(selectionSummary.sum) }}
            </dd>
          </div>
        </dl>
        <WorkbookViewControls
          class="workbook-status-bar__view-controls"
          :zoom="zoom"
          :show-headers="showHeaders"
          :show-grid-lines="showGridLines"
          :show-axis-quick-tools="showAxisQuickTools"
          @update:show-headers="emit('update:showHeaders', $event)"
          @update:show-grid-lines="emit('update:showGridLines', $event)"
          @update:show-axis-quick-tools="emit('update:showAxisQuickTools', $event)"
          :highlight-enabled="highlightEnabled"
          :highlight-color="highlightColor"
          :fullscreen="fullscreen"
          :fullscreen-available="fullscreenAvailable"
          @update:zoom="emit('update:zoom', $event)"
          @fit-selection="emit('fitSelection')"
          @update:highlight-enabled="emit('update:highlightEnabled', $event)"
          @update:highlight-color="emit('update:highlightColor', $event)"
          @toggle-fullscreen="emit('toggleFullscreen')"
        />
      </div>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.workbook-status-bar {
  display: grid;
  grid-template-rows: 26px 22px;
  min-width: 0;
  min-height: 48px;
  background: var(--idea-sheet-bar-surface);
  color: var(--idea-text-secondary);
  font-size: 12px;

  &__top-row,
  &__bottom-row {
    min-width: 0;
  }

  &__top-row {
    display: flex;
    align-items: stretch;
    overflow: hidden;
    background: var(--idea-sheet-bar-surface);
  }

  &__sheets {
    display: flex;
    flex: 0 0 var(--sheet-tabs-width);
    min-width: 0;
    overflow: hidden;
  }

  &__splitter {
    position: relative;
    flex: 0 0 8px;
    cursor: col-resize;
    touch-action: none;
    user-select: none;

    &::after {
      position: absolute;
      top: 50%;
      left: 3px;
      width: 2px;
      height: 8px;
      border-radius: 1px;
      background: var(--idea-sheet-bar-thumb);
      transform: translateY(-50%);
      content: "";
    }

    &:hover,
    &:focus-visible,
    &.is-resizing {
      outline: none;

      &::after {
        height: 12px;
        background: var(--idea-sheet-bar-thumb-hover);
      }
    }

    &:focus-visible::after {
      background: var(--idea-action-primary);
    }
  }

  &__horizontal-scrollbar {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 0;
    padding: 0 5px 0 2px;
    overflow: hidden;
  }

  &__bottom-row {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    align-items: center;
    border-top: 1px solid var(--idea-sheet-bar-border);
  }

  &__metrics {
    display: flex;
    align-items: center;
    min-width: 0;
    height: 100%;
  }

  &__summary {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 16px;
    min-width: 0;
    overflow: hidden;
    margin: 0;
    padding: 0 12px;
    font-variant-numeric: tabular-nums;
  }

  &__stat {
    display: inline-flex;
    align-items: baseline;
    gap: 0;
    min-width: 0;
    white-space: nowrap;

    dt {
      flex: 0 0 auto;
    }

    dd {
      min-width: 0;
      margin: 0;
      overflow: hidden;
      color: var(--idea-text-primary);
      text-overflow: ellipsis;
    }
  }

  &__view-controls {
    flex: 0 0 auto;
    margin-left: auto;
    border-left: 1px solid var(--idea-border-subtle);
  }

  @media (max-width: 480px) {
    &__summary {
      gap: 10px;
      padding: 0 8px;
    }
  }
}
</style>
