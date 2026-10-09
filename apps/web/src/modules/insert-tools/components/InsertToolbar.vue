<script setup lang="ts">
import PivotInsertTools from "../../pivot-tables/components/PivotInsertTools.vue";
import ChartInsertTools from "../../charts/components/ChartInsertTools.vue";
import type { ChartType } from "@sheetcraft/core/sheet-charts";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  Camera,
  PanelsTopLeft,
  FileText,
  Paperclip,
  Link2,
  Table2,
  Shapes,
  Type,
  ALargeSmall,
  Star,
  Sigma,
  Omega,
  Scan,
  Activity,
  Eraser,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
defineProps<{
  disabled: boolean;
  pivotDisabled: boolean;
  pivotManageDisabled: boolean;
  hasPivot: boolean;
  imageDisabled: boolean;
  symbolDisabled: boolean;
  sparklineDisabled: boolean;
  hyperlinkDisabled: boolean;
  hasTable: boolean;
  editSessionId?: string;
}>();
const emit = defineEmits<{
  insertPivot: [chart: boolean];
  refreshPivot: [];
  editPivot: [];
  removePivot: [];
  insertChart: [type: ChartType | "dashboard"];
  insertAttachment: [display: "icon" | "document"];
  insertCamera: [];
  insertControl: [];
  insertSymbol: [];
  insertSparkline: [];
  clearSparklines: [];
  captureScreen: [];
  insertDrawing: [kind: SheetGraphicDrawing["kind"]];
  insertImage: [mode: "cell" | "floating"];
  insertHyperlink: [];
  insertTable: [];
  manageTable: [];
}>();
defineSlots<{ watermark(): unknown }>();
const { t } = useAppI18n();
</script>
<template>
  <RibbonToolbar :label="t('ribbon.insertTools')" :data-cell-edit-session="editSessionId">
    <PivotInsertTools
      :disabled="pivotDisabled"
      :manage-disabled="pivotManageDisabled"
      :has-pivot="hasPivot"
      @insert="emit('insertPivot', $event)"
      @refresh="emit('refreshPivot')"
      @edit="emit('editPivot')"
      @remove="emit('removePivot')"
    />
    <section
      class="insert-toolbar__group"
      :aria-label="t('tables.tools')"
      role="group"
      data-ribbon-group="insert-tables"
    >
      <RibbonButton
        variant="tall"
        :label="t('tables.tools')"
        :text="t('tables.create')"
        :disabled="disabled"
        data-insert-tool="table"
        @activate="hasTable ? emit('manageTable') : emit('insertTable')"
        ><Table2
      /></RibbonButton>
    </section>
    <section
      class="insert-toolbar__group"
      :aria-label="t('image.insertMenu')"
      role="group"
      data-ribbon-group="insert-illustrations"
    >
      <ImageInsertMenu :disabled="imageDisabled" @insert-image="emit('insertImage', $event)" />
      <RibbonButton
        variant="tall"
        :label="t('attachment.document')"
        :text="t('attachment.document')"
        :disabled="imageDisabled"
        data-insert-tool="document"
        @activate="emit('insertAttachment', 'document')"
        ><FileText
      /></RibbonButton>
      <slot name="watermark" />
      <RibbonButton
        variant="tall"
        :label="t('drawing.screenshot')"
        :text="t('drawing.screenshot')"
        :disabled="imageDisabled"
        data-insert-tool="screenshot"
        @activate="emit('captureScreen')"
        ><Scan
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.shape')"
        :text="t('drawing.shape')"
        :disabled="imageDisabled"
        data-insert-tool="shape"
        @activate="emit('insertDrawing', 'shape')"
        ><Shapes
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.icon')"
        :text="t('drawing.icon')"
        :disabled="imageDisabled"
        data-insert-tool="icon"
        @activate="emit('insertDrawing', 'icon')"
        ><Star
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.wordArt')"
        :text="t('drawing.wordArt')"
        :disabled="imageDisabled"
        data-insert-tool="wordArt"
        @activate="emit('insertDrawing', 'wordArt')"
        ><ALargeSmall
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.textBox')"
        :text="t('drawing.textBox')"
        :disabled="imageDisabled"
        data-insert-tool="text-box"
        @activate="emit('insertDrawing', 'textBox')"
        ><Type
      /></RibbonButton>
    </section>
    <ChartInsertTools :disabled="imageDisabled" @insert="emit('insertChart', $event)" />
    <section class="insert-toolbar__group" role="group" :aria-label="t('sparkline.title')">
      <RibbonButton
        variant="tall"
        :label="t('sparkline.title')"
        :text="t('sparkline.title')"
        :disabled="sparklineDisabled"
        @activate="emit('insertSparkline')"
        ><Activity /></RibbonButton
      ><RibbonButton
        variant="tall"
        :label="t('sparkline.remove')"
        :text="t('sparkline.remove')"
        :disabled="sparklineDisabled"
        @activate="emit('clearSparklines')"
        ><Eraser
      /></RibbonButton>
    </section>

    <section
      class="insert-toolbar__group"
      :aria-label="t('hyperlinks.insert')"
      role="group"
      data-ribbon-group="insert-links"
    >
      <RibbonButton
        variant="tall"
        :label="t('hyperlinks.insert')"
        :text="t('hyperlinks.insert')"
        :disabled="hyperlinkDisabled"
        data-insert-tool="hyperlink"
        @activate="emit('insertHyperlink')"
        ><Link2
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('attachment.title')"
        :text="t('attachment.title')"
        :disabled="imageDisabled"
        data-insert-tool="attachment"
        @activate="emit('insertAttachment', 'icon')"
        ><Paperclip
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('control.title')"
        :text="t('control.title')"
        :disabled="imageDisabled"
        data-insert-tool="control"
        @activate="emit('insertControl')"
        ><PanelsTopLeft
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('camera.title')"
        :text="t('camera.title')"
        :disabled="imageDisabled"
        data-insert-tool="camera"
        @activate="emit('insertCamera')"
        ><Camera
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.equation')"
        :text="t('drawing.equation')"
        :disabled="imageDisabled"
        data-insert-tool="equation"
        @activate="emit('insertDrawing', 'equation')"
        ><Sigma
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('drawing.symbol')"
        :text="t('drawing.symbol')"
        :disabled="symbolDisabled"
        data-insert-tool="symbol"
        @activate="emit('insertSymbol')"
        ><Omega
      /></RibbonButton>
    </section>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.insert-toolbar__group {
  @include ribbon.columns;
}
</style>
