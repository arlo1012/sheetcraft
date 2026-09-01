<script setup lang="ts">
import { computed } from "vue";
import { FileSpreadsheet, LayoutDashboard, ZoomIn, ZoomOut } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import type { SelectionSummary } from "@idea10/core/selection-summary";
import type { Sheet } from "@idea10/core/workbook";
import WorkbookSheetTabs from "./WorkbookSheetTabs.vue";

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
  statusText: string;
  selectionSummary: SelectionSummary;
}>();

const emit = defineEmits<{
  select: [sheetId: string];
  add: [];
  rename: [payload: { sheetId: string; name: string }];
  delete: [sheetId: string];
}>();

const { locale, t } = useAppI18n();
const numberFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 6 }),
);
const shouldShowSummary = computed(
  () => props.selectionSummary.selectedCellCount > 1 && props.selectionSummary.count > 0,
);

function formatNumber(value: number): string {
  return numberFormatter.value.format(Object.is(value, -0) ? 0 : value);
}
</script>

<template>
  <footer class="workbook-status-bar" :aria-label="t('statusBar.label')">
    <div class="workbook-status-bar__sheets">
      <WorkbookSheetTabs
        :sheets="sheets"
        :active-sheet-id="activeSheetId"
        @select="emit('select', $event)"
        @add="emit('add')"
        @rename="emit('rename', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
    <span
      class="workbook-status-bar__status"
      :class="{ 'is-empty': !statusText }"
      aria-live="polite"
    >
      {{ statusText }}
    </span>
    <dl
      v-if="shouldShowSummary"
      class="workbook-status-bar__summary"
      :aria-label="t('statusBar.selectionSummary')"
      data-selection-summary
    >
      <div class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.count") }}</dt>
        <dd>{{ formatNumber(selectionSummary.count) }}</dd>
      </div>
      <div v-if="selectionSummary.numericCount > 0" class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.average") }}</dt>
        <dd>{{ formatNumber(selectionSummary.average) }}</dd>
      </div>
      <div v-if="selectionSummary.numericCount > 0" class="workbook-status-bar__stat">
        <dt>{{ t("statusBar.sum") }}</dt>
        <dd>{{ formatNumber(selectionSummary.sum) }}</dd>
      </div>
    </dl>
    <div
      class="workbook-status-bar__view-zoom"
      role="group"
      :aria-label="t('statusBar.viewAndZoom')"
    >
      <button
        class="workbook-status-bar__placeholder"
        type="button"
        role="button"
        disabled
        :aria-label="t('app.unavailableFeature', { feature: t('statusBar.normalView') })"
        :title="t('app.unavailableFeature', { feature: t('statusBar.normalView') })"
      >
        <LayoutDashboard :size="14" aria-hidden="true" />
      </button>
      <button
        class="workbook-status-bar__placeholder"
        type="button"
        role="button"
        disabled
        :aria-label="t('app.unavailableFeature', { feature: t('statusBar.pageLayoutView') })"
        :title="t('app.unavailableFeature', { feature: t('statusBar.pageLayoutView') })"
      >
        <FileSpreadsheet :size="14" aria-hidden="true" />
      </button>
      <span class="workbook-status-bar__view-zoom-separator" aria-hidden="true" />
      <button
        class="workbook-status-bar__placeholder"
        type="button"
        role="button"
        disabled
        :aria-label="t('app.unavailableFeature', { feature: t('statusBar.zoomOut') })"
        :title="t('app.unavailableFeature', { feature: t('statusBar.zoomOut') })"
      >
        <ZoomOut :size="14" aria-hidden="true" />
      </button>
      <button
        class="workbook-status-bar__zoom-level"
        type="button"
        role="button"
        disabled
        :aria-label="
          t('app.unavailableFeature', { feature: t('statusBar.zoomLevel', { value: 100 }) })
        "
        :title="t('app.unavailableFeature', { feature: t('statusBar.zoomLevel', { value: 100 }) })"
      >
        {{ t("statusBar.zoomLevel", { value: 100 }) }}
      </button>
      <button
        class="workbook-status-bar__placeholder"
        type="button"
        role="button"
        disabled
        :aria-label="t('app.unavailableFeature', { feature: t('statusBar.zoomIn') })"
        :title="t('app.unavailableFeature', { feature: t('statusBar.zoomIn') })"
      >
        <ZoomIn :size="14" aria-hidden="true" />
      </button>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.workbook-status-bar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 30px;
  background: var(--idea-surface-panel);
  border-top: 1px solid var(--idea-border-control);
  color: var(--idea-text-secondary);
  font-size: 12px;

  &__sheets {
    display: flex;
    flex: 1 1 360px;
    min-width: 90px;
    overflow: hidden;
  }

  &__status {
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    min-width: 60px;
    padding: 0 12px;
    overflow: hidden;
    color: var(--idea-text-muted);
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-empty {
      flex-basis: 0;
      min-width: 0;
      padding: 0;
    }
  }

  &__summary {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin: 0;
    padding: 0 12px;
    border-left: 1px solid var(--idea-border-subtle);
    font-variant-numeric: tabular-nums;
  }

  &__stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;

    dd {
      margin: 0;
      color: var(--idea-text-primary);
    }
  }

  &__view-zoom {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    border-left: 1px solid var(--idea-border-subtle);
  }

  &__placeholder,
  &__zoom-level {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: 3px;
    color: var(--idea-status-warning-strong, #d68a00);

    &:disabled {
      cursor: not-allowed;
      opacity: 0.72;
    }
  }

  &__zoom-level {
    width: auto;
    min-width: 42px;
    padding: 0 4px;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  &__view-zoom-separator {
    width: 1px;
    height: 14px;
    margin: 0 3px;
    background: var(--idea-border-subtle);
  }

  @media (max-width: 720px) {
    &__status {
      position: absolute;
      width: 1px;
      min-width: 0;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    &__summary {
      gap: 8px;
      padding: 0 8px;
    }
  }

  @media (max-width: 480px) {
    &__summary {
      gap: 0;
    }

    &__stat:not(:first-child) {
      display: none;
    }

    &__view-zoom {
      padding: 0 4px;
    }

    &__view-zoom-separator,
    &__zoom-level {
      display: none;
    }
  }
}
</style>
