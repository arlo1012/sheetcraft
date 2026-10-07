<script setup lang="ts">
import { computed } from "vue";
import SheetPageBreakIcon from "../../../shared/sheet-view/SheetPageBreakIcon.vue";
import { Printer, Rows3, PanelsTopBottom } from "lucide-vue-next";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { DEFAULT_SHEET_PAGE_PRINT_OPTIONS, type SheetPageSetup } from "@idea10/core/page-setup";
import type { CellAddress } from "@idea10/core/workbook";
import type { SelectionMode } from "@idea10/sheet-engine/selection";
import type { SheetViewMode } from "@idea10/sheet-engine/page-layout";
import type { PageMargins } from "../page-margin-presets";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonDialogLauncher from "../../../shared/ribbon/RibbonDialogLauncher.vue";
import PageMarginsMenu from "./PageMarginsMenu.vue";
import PageOrientationMenu from "./PageOrientationMenu.vue";
import PagePaperSizeMenu from "./PagePaperSizeMenu.vue";
import PageScalingMenu from "./PageScalingMenu.vue";
import PagePrintAreaMenu from "./PagePrintAreaMenu.vue";
import PageBreakMenu from "./PageBreakMenu.vue";
import type { PageBreakAction, PageSetupTab } from "../page-toolbar-actions";
const props = defineProps<{
  setup: SheetPageSetup;
  lastCustomMargins?: PageMargins;
  disabled: boolean;
  busy: boolean;
  activeCell: CellAddress;
  selectionMode: SelectionMode;
  viewMode: SheetViewMode;
  showPageBreaks: boolean;
  editSessionId?: string;
}>();
const emit = defineEmits<{
  change: [patch: Partial<SheetPageSetup>];
  openSetup: [tab: PageSetupTab];
  printPreview: [];
  setPrintArea: [];
  pageBreak: [action: PageBreakAction];
  "update:viewMode": [mode: SheetViewMode];
  "update:showPageBreaks": [show: boolean];
}>();
defineSlots<{ appearance(): unknown; beautify(): unknown }>();
const { t } = useAppI18n();
const printOptions = computed(() => props.setup.printOptions ?? DEFAULT_SHEET_PAGE_PRINT_OPTIONS);
function setPrintOption(key: "gridLines" | "headings", value: boolean): void {
  emit("change", { printOptions: { ...printOptions.value, [key]: value } });
}
</script>
<template>
  <RibbonToolbar
    :label="t('pageTools.label')"
    :data-cell-edit-session="editSessionId"
    class="page-toolbar"
  >
    <section
      class="page-toolbar__group page-toolbar__group--setup"
      role="group"
      :aria-label="t('pageLayout.pageSetup')"
      data-ribbon-group="page-setup"
    >
      <RibbonButton
        variant="tall"
        :label="t('pageTools.printPreview')"
        :text="t('pageTools.printPreview')"
        :disabled="busy"
        data-page-tool="print-preview"
        @activate="emit('printPreview')"
        ><Printer
      /></RibbonButton>
      <PageMarginsMenu
        :setup="setup"
        :last-custom-margins="lastCustomMargins"
        :disabled="disabled"
        @change="emit('change', $event)"
        @open-setup="emit('openSetup', 'margins')"
      />
      <PageOrientationMenu
        :setup="setup"
        :disabled="disabled"
        @change="emit('change', $event)"
        @open-setup="emit('openSetup', 'page')"
      />
      <PagePaperSizeMenu
        :setup="setup"
        :disabled="disabled"
        @change="emit('change', $event)"
        @open-setup="emit('openSetup', 'page')"
      />
      <PagePrintAreaMenu
        :disabled="disabled"
        :has-print-area="setup.printArea !== null"
        @set="emit('setPrintArea')"
        @clear="emit('change', { printArea: null })"
        @open-setup="emit('openSetup', 'sheet')"
      />
      <PageScalingMenu
        :setup="setup"
        :disabled="disabled"
        @change="emit('change', $event)"
        @open-setup="emit('openSetup', 'page')"
      />
      <div class="page-toolbar__stack">
        <RibbonButton
          :label="t('pageTools.printTitles')"
          :text="t('pageTools.printTitles')"
          :disabled="disabled"
          data-page-tool="print-titles"
          @activate="emit('openSetup', 'sheet')"
          ><Rows3
        /></RibbonButton>
        <RibbonButton
          :label="t('pageLayout.headerFooterTools')"
          :text="t('pageLayout.headerFooterTools')"
          :disabled="disabled"
          data-page-tool="header-footer"
          @activate="emit('openSetup', 'header-footer')"
          ><PanelsTopBottom
        /></RibbonButton>
      </div>
      <div class="page-toolbar__stack page-toolbar__checks">
        <TCheckbox
          :model-value="printOptions.gridLines"
          :disabled="disabled"
          data-page-option="print-grid-lines"
          @update:model-value="setPrintOption('gridLines', Boolean($event))"
          >{{ t("pageTools.printGridLines") }}</TCheckbox
        >
        <TCheckbox
          :model-value="printOptions.headings"
          :disabled="disabled"
          data-page-option="print-headings"
          @update:model-value="setPrintOption('headings', Boolean($event))"
          >{{ t("pageTools.printHeadings") }}</TCheckbox
        >
      </div>
      <RibbonDialogLauncher
        :label="t('pageLayout.pageSetup')"
        :disabled="disabled"
        data-page-tool="page-setup"
        @activate="emit('openSetup', 'page')"
      />
    </section>
    <section
      class="page-toolbar__group"
      role="group"
      :aria-label="t('pageTools.breaks')"
      data-ribbon-group="page-breaks"
    >
      <RibbonButton
        variant="tall"
        :label="t('viewTools.pageBreakPreview')"
        :text="t('viewTools.pageBreakPreview')"
        :pressed="viewMode === 'page-break-preview'"
        :disabled="busy"
        data-page-tool="page-break-preview"
        @activate="
          emit(
            'update:viewMode',
            viewMode === 'page-break-preview' ? 'normal' : 'page-break-preview',
          )
        "
        ><SheetPageBreakIcon
      /></RibbonButton>
      <div class="page-toolbar__stack">
        <TCheckbox
          :model-value="showPageBreaks"
          :disabled="busy"
          data-page-option="show-breaks"
          @update:model-value="emit('update:showPageBreaks', Boolean($event))"
          >{{ t("pageTools.showPageBreaks") }}</TCheckbox
        >
        <PageBreakMenu
          :disabled="disabled"
          :setup="setup"
          :active-cell="activeCell"
          :selection-mode="selectionMode"
          @action="emit('pageBreak', $event)"
        />
      </div>
    </section>
    <section
      class="page-toolbar__group"
      role="group"
      :aria-label="t('pageTools.appearance')"
      data-ribbon-group="page-appearance"
    >
      <slot name="appearance" />
    </section>
    <section
      class="page-toolbar__group"
      role="group"
      :aria-label="t('pageTools.beautify')"
      data-ribbon-group="page-beautify"
    >
      <slot name="beautify" />
    </section>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-toolbar {
  &__group {
    @include ribbon.columns;
    &--setup {
      @include ribbon.dialog-launcher-anchor;
    }
  }
  &__stack {
    @include ribbon.two-rows;
    align-items: center;
  }
  &__checks {
    padding-inline: var(--idea-space-2);
  }
}
</style>
