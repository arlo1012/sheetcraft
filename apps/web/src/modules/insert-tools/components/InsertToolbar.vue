<script setup lang="ts">
import EquationInsertMenu from "../../sheet-drawings/equation/EquationInsertMenu.vue";
import type { EquationPresetId } from "../../sheet-drawings/equation/equation-catalog";
import ScreenCaptureMenu from "./ScreenCaptureMenu.vue";
import type { CaptureShape } from "../capture-region";
import DiagramInsertMenu from "./DiagramInsertMenu.vue";
import type { MindMapStart } from "../../mind-maps/mind-map-document";
import type { FlowchartStart } from "../../flowcharts/flowchart-templates";
import SymbolInsertMenu from "./SymbolInsertMenu.vue";
import type { SymbolInsertion } from "../symbols/symbol-preferences";
import PivotInsertTools from "../../pivot-tables/components/PivotInsertTools.vue";
import ChartInsertTools from "../../charts/components/ChartInsertTools.vue";
import type { ChartInsertIntent } from "../../charts/chart-design-intents";
import type { SheetIconId } from "@sheetcraft/core/sheet-icons";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import IconInsertMenu from "../../sheet-drawings/components/IconInsertMenu.vue";
import FormControlInsertMenu from "../../form-controls/components/FormControlInsertMenu.vue";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import WordArtInsertMenu from "../../sheet-drawings/components/WordArtInsertMenu.vue";
import type { WordArtStylePreset } from "../../sheet-drawings/wordart-style-presets";
import ShapeInsertMenu from "../../sheet-drawings/components/ShapeInsertMenu.vue";
import TextBoxInsertMenu from "../../sheet-drawings/components/TextBoxInsertMenu.vue";
import type { ShapeGalleryChoice } from "../../sheet-drawings/shape-gallery";
import {
  Camera,
  Workflow,
  Network,
  FileText,
  Paperclip,
  Link2,
  Table2,
  ListFilter,
  Shapes,
  Type,
  ALargeSmall,
  Star,
  Sigma,
  Eraser,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
import SparklineInsertMenu from "../../sparklines/components/SparklineInsertMenu.vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
defineProps<{
  disabled: boolean;
  dashboardDisabled?: boolean;
  pivotDisabled: boolean;
  pivotChartDisabled?: boolean;
  pivotManageDisabled: boolean;
  hasPivot: boolean;
  imageDisabled: boolean;
  symbolDisabled: boolean;
  sparklineDisabled: boolean;
  hyperlinkDisabled: boolean;
  slicerDisabled?: boolean;
  hasTable: boolean;
  editSessionId?: string;
  insertSymbolTextHandler?: (payload: SymbolInsertion) => boolean;
  insertShapeHandler?: (choice: ShapeGalleryChoice, continuous: boolean) => boolean;
  themeColors?: readonly string[];
  shapeOwnerId?: string | number;
  insertEquationHandler?: (choice: EquationPresetId | null) => boolean | Promise<boolean>;
  insertWordArtHandler?: (choice: WordArtStylePreset) => boolean | Promise<boolean>;
  insertIconHandler?: (id: SheetIconId) => boolean;
}>();
const emit = defineEmits<{
  insertPivot: [chart: boolean];
  refreshPivot: [];
  editPivot: [];
  removePivot: [];
  insertDashboard: [];
  insertChart: [intent: ChartInsertIntent];
  insertMindMap: [start: MindMapStart];
  insertFlowchart: [start: FlowchartStart];
  insertAttachment: [display: "icon" | "document"];
  insertCamera: [];
  insertControl: [type: FormControlType];
  insertSymbol: [];
  insertSymbolText: [payload: SymbolInsertion];
  insertSparkline: [type: CellSparkline["type"]];
  clearSparklines: [];
  recordScreen: [];
  captureScreen: [shape: CaptureShape, tools: boolean, excludeSelf: boolean];
  insertDrawing: [kind: SheetGraphicDrawing["kind"]];
  insertImage: [mode: "cell" | "floating"];
  insertHyperlink: [];
  insertTable: [];
  insertSlicer: [];
  manageTable: [];
}>();
defineSlots<{ watermark(): unknown }>();
const { t, locale } = useAppI18n();
</script>
<template>
  <RibbonToolbar :label="t('ribbon.insertTools')" :data-cell-edit-session="editSessionId">
    <PivotInsertTools
      :disabled="pivotDisabled || hasPivot"
      :chart-disabled="pivotChartDisabled ?? pivotDisabled"
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
        :disabled="disabled || hasPivot"
        data-insert-tool="table"
        @activate="hasTable ? emit('manageTable') : emit('insertTable')"
        ><Table2
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :label="t('tables.insertSlicer')"
        :text="t('tables.slicer')"
        :disabled="slicerDisabled ?? true"
        data-insert-tool="slicer"
        @activate="emit('insertSlicer')"
        ><ListFilter
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
        :disabled="imageDisabled && hyperlinkDisabled"
        data-insert-tool="document"
        @activate="emit('insertAttachment', 'document')"
        ><FileText
      /></RibbonButton>
      <slot name="watermark" />
      <ScreenCaptureMenu
        :disabled="imageDisabled"
        @record="emit('recordScreen')"
        @capture="(shape, tools, excludeSelf) => emit('captureScreen', shape, tools, excludeSelf)"
      />
      <ShapeInsertMenu
        v-if="insertShapeHandler"
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        :edit-session-id="editSessionId"
        :handler="insertShapeHandler"
      />
      <RibbonButton
        v-else
        variant="tall"
        :label="t('drawing.shape')"
        :text="t('drawing.shape')"
        :disabled="imageDisabled"
        data-insert-tool="shape"
        @activate="emit('insertDrawing', 'shape')"
        ><Shapes
      /></RibbonButton>
      <IconInsertMenu
        v-if="insertIconHandler"
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        :handler="insertIconHandler"
      />
      <RibbonButton
        v-else
        variant="tall"
        :label="t('drawing.icon')"
        :text="t('drawing.icon')"
        :disabled="imageDisabled"
        data-insert-tool="icon"
        @activate="emit('insertDrawing', 'icon')"
        ><Star
      /></RibbonButton>
      <WordArtInsertMenu
        v-if="insertWordArtHandler"
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        :edit-session-id="editSessionId"
        :handler="insertWordArtHandler"
      />
      <RibbonButton
        v-else
        variant="tall"
        :label="t('drawing.wordArt')"
        :text="t('drawing.wordArt')"
        :disabled="imageDisabled"
        data-insert-tool="wordArt"
        @activate="emit('insertDrawing', 'wordArt')"
        ><ALargeSmall
      /></RibbonButton>
      <TextBoxInsertMenu
        v-if="insertShapeHandler"
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        :edit-session-id="editSessionId"
        :handler="insertShapeHandler"
      />
      <RibbonButton
        v-else
        variant="tall"
        :label="t('drawing.textBox')"
        :text="t('drawing.textBox')"
        :disabled="imageDisabled"
        data-insert-tool="text-box"
        @activate="emit('insertDrawing', 'textBox')"
        ><Type
      /></RibbonButton>
      <div class="insert-toolbar__diagrams">
        <DiagramInsertMenu
          tool="flowchart"
          :disabled="imageDisabled"
          :title="t('flowchart.title')"
          :workbook-label="t('flowchart.workbookMenu')"
          :local-label="t('flowchart.localMenu')"
          @workbook="emit('insertFlowchart', 'gallery')"
          @local="emit('insertFlowchart', 'local')"
          ><Workflow
        /></DiagramInsertMenu>
        <DiagramInsertMenu
          tool="mind-map"
          :disabled="imageDisabled"
          :title="t('mindMap.title')"
          :workbook-label="t('mindMap.workbook')"
          :local-label="t('mindMap.local')"
          @workbook="emit('insertMindMap', 'workbook')"
          @local="emit('insertMindMap', 'local')"
          ><Network
        /></DiagramInsertMenu>
      </div>
    </section>
    <ChartInsertTools
      :theme-colors="themeColors"
      :disabled="imageDisabled"
      :dashboard-disabled="dashboardDisabled"
      @dashboard="emit('insertDashboard')"
      @insert="emit('insertChart', $event)"
    />
    <section class="insert-toolbar__group" role="group" :aria-label="t('sparkline.title')">
      <SparklineInsertMenu
        :disabled="sparklineDisabled"
        @insert="emit('insertSparkline', $event)"
      />
      <RibbonButton
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
      <FormControlInsertMenu
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        @insert="emit('insertControl', $event)"
      />
      <RibbonButton
        variant="tall"
        :label="t('camera.title')"
        :text="t('camera.title')"
        :disabled="imageDisabled"
        data-insert-tool="camera"
        @activate="emit('insertCamera')"
        ><Camera
      /></RibbonButton>
      <EquationInsertMenu
        v-if="insertEquationHandler"
        :handler="insertEquationHandler"
        :disabled="imageDisabled"
        :owner-id="shapeOwnerId"
        :edit-session-id="editSessionId"
        :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
      />
      <RibbonButton
        v-else
        variant="tall"
        :label="t('drawing.equation')"
        :text="t('drawing.equation')"
        :disabled="imageDisabled"
        data-insert-tool="equation"
        @activate="emit('insertDrawing', 'equation')"
        ><Sigma
      /></RibbonButton>
      <SymbolInsertMenu
        :disabled="symbolDisabled"
        :edit-session-id="editSessionId"
        :insert-text="insertSymbolTextHandler"
        @more="emit('insertSymbol')"
        @insert="emit('insertSymbolText', $event)"
      />
    </section>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.insert-toolbar__diagrams {
  @include ribbon.two-rows;
}
.insert-toolbar__group {
  @include ribbon.columns;
}
</style>
