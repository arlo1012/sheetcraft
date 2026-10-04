<script setup lang="ts">
import { Eye, Maximize2, Minimize2, PanelsTopLeft, TableProperties } from "lucide-vue-next";
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import SheetFreezeMenu from "../../../shared/sheet-view/SheetFreezeMenu.vue";
import SheetHighlightControl from "../../../shared/sheet-view/SheetHighlightControl.vue";
import SheetZoomMenu from "../../../shared/sheet-view/SheetZoomMenu.vue";

type SheetViewMode = "normal" | "page-break-preview" | "page-layout";

const props = withDefaults(
  defineProps<{
    editSessionId?: string;
    viewMode: SheetViewMode;
    showFormulaBar: boolean;
    showHeaders: boolean;
    showGridLines: boolean;
    eyeComfortEnabled: boolean;
    highlightEnabled: boolean;
    highlightColor: string;
    fullscreen: boolean;
    fullscreenAvailable: boolean;
    zoom: number;
    freezeDisabled: boolean;
    activeCell: { row: number; column: number };
    freezePanes: { rows: number; columns: number };
    showPageRulers?: boolean;
    showPageMargins?: boolean;
    showPageWhiteSpace?: boolean;
    pageRulerUnit?: "mm" | "cm" | "in";
  }>(),
  {
    showPageRulers: true,
    showPageMargins: false,
    showPageWhiteSpace: true,
    pageRulerUnit: "cm",
  },
);
const emit = defineEmits<{
  "update:viewMode": [value: SheetViewMode];
  "update:showFormulaBar": [value: boolean];
  "update:showHeaders": [value: boolean];
  "update:showGridLines": [value: boolean];
  "update:eyeComfortEnabled": [value: boolean];
  "update:highlightEnabled": [value: boolean];
  "update:highlightColor": [value: string];
  "update:zoom": [value: number];
  "update:showPageRulers": [value: boolean];
  "update:showPageMargins": [value: boolean];
  "update:showPageWhiteSpace": [value: boolean];
  "update:pageRulerUnit": [value: "mm" | "cm" | "in"];
  toggleFullscreen: [];
  fitSelection: [];
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
}>();
const { t } = useAppI18n();
const pageRulerUnitOptions = computed(() => [
  { label: t("pageLayout.unitMillimetres"), value: "mm" },
  { label: t("pageLayout.unitCentimetres"), value: "cm" },
  { label: t("pageLayout.unitInches"), value: "in" },
]);
</script>

<template>
  <RibbonToolbar
    :label="t('viewTools.label')"
    :data-cell-edit-session="props.editSessionId"
    class="view-toolbar"
  >
    <section
      class="view-toolbar__group view-toolbar__group--display"
      data-ribbon-group="view-display"
      role="group"
      :aria-label="t('viewTools.display')"
    >
      <div class="view-toolbar__checks">
        <TCheckbox
          :model-value="showFormulaBar"
          data-view-option="formula-bar"
          @update:model-value="emit('update:showFormulaBar', Boolean($event))"
          >{{ t("viewTools.formulaBar") }}</TCheckbox
        >
        <TCheckbox
          :model-value="showGridLines"
          data-view-option="grid-lines"
          @update:model-value="emit('update:showGridLines', Boolean($event))"
          >{{ t("statusBar.showGridLines") }}</TCheckbox
        >
        <TCheckbox
          :model-value="showHeaders"
          data-view-option="headers"
          @update:model-value="emit('update:showHeaders', Boolean($event))"
          >{{ t("statusBar.showHeaders") }}</TCheckbox
        >
        <!-- TODO: task pane needs an application-owned panel host before it can be enabled. -->
        <TCheckbox
          :model-value="false"
          disabled
          data-view-option="task-pane"
          :title="t('viewTools.unavailable')"
          >{{ t("viewTools.taskPane") }}</TCheckbox
        >
      </div>
      <RibbonButton
        variant="tall"
        :label="t('statusBar.normalView')"
        :text="t('statusBar.normalView')"
        :pressed="viewMode === 'normal'"
        data-view-tool="normal-view"
        @activate="emit('update:viewMode', 'normal')"
        ><TableProperties aria-hidden="true"
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('viewTools.pageBreakPreview')"
        :text="t('viewTools.pageBreakPreview')"
        :pressed="viewMode === 'page-break-preview'"
        data-view-tool="page-break-preview"
        @activate="emit('update:viewMode', 'page-break-preview')"
        ><PanelsTopLeft aria-hidden="true"
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('statusBar.pageLayoutView')"
        :text="t('statusBar.pageLayoutView')"
        :pressed="viewMode === 'page-layout'"
        data-view-tool="page-layout-view"
        @activate="emit('update:viewMode', 'page-layout')"
        ><PanelsTopLeft aria-hidden="true"
      /></RibbonButton>
      <!-- TODO: custom views need persisted view-state snapshots, not a local visual toggle. -->
      <RibbonButton
        variant="tall"
        :label="t('viewTools.customViews')"
        :text="t('viewTools.customViews')"
        disabled
        :title="t('viewTools.unavailable')"
        data-view-tool="custom-views"
        ><Eye aria-hidden="true"
      /></RibbonButton>
    </section>

    <section
      v-if="viewMode === 'page-layout'"
      class="view-toolbar__group"
      data-ribbon-group="page-layout-rulers"
      role="group"
      :aria-label="t('pageLayout.rulers')"
    >
      <div class="view-toolbar__checks view-toolbar__checks--page-layout">
        <TCheckbox
          :model-value="showPageRulers"
          data-page-layout-option="rulers"
          @update:model-value="emit('update:showPageRulers', Boolean($event))"
          >{{ t("pageLayout.showRulers") }}</TCheckbox
        >
        <TCheckbox
          :model-value="showPageMargins"
          data-page-layout-option="margins"
          @update:model-value="emit('update:showPageMargins', Boolean($event))"
          >{{ t("pageLayout.showMargins") }}</TCheckbox
        >
        <TCheckbox
          :model-value="showPageWhiteSpace"
          data-page-layout-option="white-space"
          @update:model-value="emit('update:showPageWhiteSpace', Boolean($event))"
          >{{ t("pageLayout.showWhiteSpace") }}</TCheckbox
        >
        <label>
          <span class="ui-visually-hidden">{{ t("pageLayout.rulerUnits") }}</span>
          <TSelect
            :model-value="pageRulerUnit"
            :options="pageRulerUnitOptions"
            data-page-layout-option="ruler-unit"
            size="small"
            @update:model-value="emit('update:pageRulerUnit', $event as 'mm' | 'cm' | 'in')"
          />
        </label>
      </div>
    </section>

    <section
      class="view-toolbar__group"
      data-ribbon-group="view-reading"
      role="group"
      :aria-label="t('viewTools.reading')"
    >
      <RibbonButton
        variant="tall"
        :label="t('statusBar.eyeComfortMode')"
        :text="t('statusBar.eyeComfortMode')"
        :pressed="eyeComfortEnabled"
        data-view-tool="eye-comfort"
        @activate="emit('update:eyeComfortEnabled', !eyeComfortEnabled)"
        ><Eye aria-hidden="true"
      /></RibbonButton>
      <SheetHighlightControl
        variant="ribbon"
        :highlight-enabled="highlightEnabled"
        :highlight-color="highlightColor"
        @update:highlight-enabled="emit('update:highlightEnabled', $event)"
        @update:highlight-color="emit('update:highlightColor', $event)"
      />
      <RibbonButton
        variant="tall"
        :label="t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')"
        :text="t(fullscreen ? 'statusBar.exitFullscreen' : 'statusBar.fullscreen')"
        :pressed="fullscreen"
        :disabled="!fullscreenAvailable"
        data-view-tool="fullscreen"
        @activate="emit('toggleFullscreen')"
        ><Minimize2 v-if="fullscreen" aria-hidden="true" /><Maximize2 v-else aria-hidden="true"
      /></RibbonButton>
    </section>

    <section
      class="view-toolbar__group"
      data-ribbon-group="view-zoom"
      role="group"
      :aria-label="t('viewTools.zoom')"
    >
      <RibbonButton
        variant="tall"
        label="100%"
        text="100%"
        data-view-tool="zoom-100"
        @activate="emit('update:zoom', 100)"
        ><TableProperties aria-hidden="true"
      /></RibbonButton>
      <SheetZoomMenu
        variant="ribbon"
        :zoom="zoom"
        @select="emit('update:zoom', $event)"
        @fit-selection="emit('fitSelection')"
      />
    </section>
    <section
      class="view-toolbar__group"
      data-ribbon-group="view-freeze"
      role="group"
      :aria-label="t('viewTools.freeze')"
    >
      <SheetFreezeMenu
        variant="tall"
        :disabled="freezeDisabled"
        :active-cell="activeCell"
        :freeze="freezePanes"
        @freeze="emit('freeze', $event)"
        @unfreeze="emit('unfreeze')"
      />
    </section>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.view-toolbar {
  &__group {
    @include ribbon.columns;
  }
  &__checks {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    gap: var(--idea-space-1) var(--idea-space-3);
    align-content: center;
    min-width: 150px;
    padding: 0 var(--idea-space-2);
    font-size: var(--idea-font-size-body-small);
    &--page-layout {
      grid-template-columns: max-content minmax(88px, 1fr);
    }
  }
}
</style>
