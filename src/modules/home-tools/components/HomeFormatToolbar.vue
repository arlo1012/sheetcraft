<script setup lang="ts">
import {
  AlignVerticalJustifyCenter,
  AppWindow,
  ArrowDownAZ,
  ChartNoAxesColumn,
  CirclePlus,
  Database,
  DollarSign,
  FileImage,
  FilePenLine,
  Grid2X2,
  Hash,
  Image as ImageIcon,
  ListFilter,
  LockKeyhole,
  MoveLeft,
  MoveRight,
  Paintbrush,
  Percent,
  Printer,
  Redo2,
  Shapes,
  Sigma,
  Snowflake,
  Sparkles,
  Strikethrough,
  Table2,
  TableCellsMerge,
  TableProperties,
  TextWrap,
  Undo2,
  WandSparkles,
} from "lucide-vue-next";
import type { CellStylePatch } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorControls from "./CellColorControls.vue";
import FontFormatControls from "./FontFormatControls.vue";
import HorizontalAlignmentControls from "./HorizontalAlignmentControls.vue";
import RibbonIconAction from "./RibbonIconAction.vue";
import TextFormatControls from "./TextFormatControls.vue";

defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
  undo: [];
  redo: [];
}>();

const { t } = useAppI18n();

function onKeydown(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey) {
    return;
  }
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type !== "color") ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return;
  }
  const key = event.key.toLowerCase();
  if (key === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      emit("redo");
    } else {
      emit("undo");
    }
  } else if (key === "y") {
    event.preventDefault();
    emit("redo");
  }
}
</script>

<template>
  <div
    class="home-format-toolbar"
    role="group"
    data-ribbon-tools
    :aria-label="t('format.toolbar')"
    @keydown="onKeydown"
  >
    <div
      class="home-format-toolbar__group"
      data-ribbon-group="history"
      role="group"
      :aria-label="t('ribbon.historyTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('ribbon.undo')"
          data-ribbon-action="undo"
          @activate="emit('undo')"
        >
          <Undo2 :size="16" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('ribbon.redo')"
          data-ribbon-action="redo"
          @activate="emit('redo')"
        >
          <Redo2 :size="16" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.formatPainter') })"
          disabled
          data-ribbon-placeholder="format-painter"
        >
          <Paintbrush :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="cell"
      role="group"
      :aria-label="t('ribbon.cellTools')"
      :aria-disabled="disabled"
      :title="disabled ? t('format.selectionTooLarge') : undefined"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <FontFormatControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.borders') })"
          disabled
          disclosure
          data-ribbon-placeholder="borders"
        >
          <Grid2X2 :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.tableStyles') })"
          :text="t('ribbon.tableStyles')"
          disabled
          disclosure
          data-ribbon-placeholder="table-styles"
        >
          <TableProperties :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <TextFormatControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.strikethrough') })"
          disabled
          data-ribbon-placeholder="strikethrough"
        >
          <Strikethrough :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <CellColorControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.conditionalFormatting') })"
          :text="t('ribbon.conditionalFormatting')"
          disabled
          disclosure
          data-ribbon-placeholder="conditional-formatting"
        >
          <Sparkles :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="alignment"
      role="group"
      :aria-label="t('ribbon.alignmentTools')"
      :aria-disabled="disabled"
      :title="disabled ? t('format.selectionTooLarge') : undefined"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.verticalAlignment') })"
          :text="t('ribbon.verticalAlignment')"
          disabled
          disclosure
          data-ribbon-placeholder="vertical-alignment"
        >
          <AlignVerticalJustifyCenter :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.wrapText') })"
          :text="t('ribbon.wrapText')"
          disabled
          disclosure
          data-ribbon-placeholder="wrap-text"
        >
          <TextWrap :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <HorizontalAlignmentControls
          :state="state"
          :disabled="disabled"
          @apply-style="emit('applyStyle', $event)"
        />
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.mergeCells') })"
          :text="t('ribbon.mergeCells')"
          disabled
          disclosure
          data-ribbon-placeholder="merge-cells"
        >
          <TableCellsMerge :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="number"
      role="group"
      :aria-label="t('ribbon.numberTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.numberFormat') })"
          :text="t('ribbon.generalFormat')"
          disabled
          disclosure
          data-ribbon-placeholder="number-format"
        >
          <Hash :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.percentFormat') })"
          disabled
          data-ribbon-placeholder="percent-format"
        >
          <Percent :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.currencyFormat') })"
          disabled
          data-ribbon-placeholder="currency-format"
        >
          <DollarSign :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.decreaseDecimal') })"
          disabled
          data-ribbon-placeholder="decrease-decimal"
        >
          <MoveLeft :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.increaseDecimal') })"
          disabled
          data-ribbon-placeholder="increase-decimal"
        >
          <MoveRight :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="data"
      role="group"
      :aria-label="t('ribbon.dataTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.filter') })"
          :text="t('ribbon.filter')"
          disabled
          disclosure
          data-ribbon-placeholder="filter"
        >
          <ListFilter :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.freeze') })"
          :text="t('ribbon.freeze')"
          disabled
          disclosure
          data-ribbon-placeholder="freeze"
        >
          <Snowflake :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.sum') })"
          :text="t('ribbon.sum')"
          disabled
          disclosure
          data-ribbon-placeholder="sum"
        >
          <Sigma :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.protect') })"
          :text="t('ribbon.protect')"
          disabled
          disclosure
          data-ribbon-placeholder="protect"
        >
          <LockKeyhole :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.sort') })"
          :text="t('ribbon.sort')"
          disabled
          disclosure
          data-ribbon-placeholder="sort"
        >
          <ArrowDownAZ :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.data') })"
          :text="t('ribbon.data')"
          disabled
          disclosure
          data-ribbon-placeholder="data"
        >
          <Database :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group"
      data-ribbon-group="insert"
      role="group"
      :aria-label="t('ribbon.insertTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.insert') })"
          :text="t('ribbon.insert')"
          disabled
          disclosure
          data-ribbon-placeholder="insert"
        >
          <CirclePlus :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.image') })"
          :text="t('ribbon.image')"
          disabled
          disclosure
          data-ribbon-placeholder="image"
        >
          <ImageIcon :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.chart') })"
          :text="t('ribbon.chart')"
          disabled
          disclosure
          data-ribbon-placeholder="chart"
        >
          <ChartNoAxesColumn :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.pivotTable') })"
          :text="t('ribbon.pivotTable')"
          disabled
          disclosure
          data-ribbon-placeholder="pivot-table"
        >
          <Table2 :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2" aria-hidden="true" />
    </div>

    <div
      class="home-format-toolbar__group home-format-toolbar__group--automation"
      data-ribbon-group="automation"
      role="group"
      :aria-label="t('ribbon.automationTools')"
    >
      <div class="home-format-toolbar__row" data-ribbon-row="1">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.quickTools') })"
          :text="t('ribbon.quickTools')"
          disabled
          disclosure
          data-ribbon-placeholder="quick-tools"
        >
          <WandSparkles :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.generateIcon') })"
          :text="t('ribbon.generateIcon')"
          disabled
          data-ribbon-placeholder="generate-icon"
        >
          <Shapes :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.smartTable') })"
          :text="t('ribbon.smartTable')"
          disabled
          data-ribbon-placeholder="smart-table"
        >
          <TableProperties :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
      <div class="home-format-toolbar__row" data-ribbon-row="2">
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.appGenerator') })"
          :text="t('ribbon.appGenerator')"
          disabled
          data-ribbon-placeholder="app-generator"
        >
          <AppWindow :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToEditable') })"
          :text="t('ribbon.pdfToEditable')"
          disabled
          data-ribbon-placeholder="pdf-to-editable"
        >
          <FilePenLine :size="15" aria-hidden="true" />
        </RibbonIconAction>
        <RibbonIconAction
          :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToImage') })"
          :text="t('ribbon.pdfToImage')"
          disabled
          data-ribbon-placeholder="pdf-to-image"
        >
          <FileImage :size="15" aria-hidden="true" />
        </RibbonIconAction>
      </div>
    </div>

    <div
      class="home-format-toolbar__group home-format-toolbar__group--utility"
      data-ribbon-group="utility"
      role="group"
      :aria-label="t('ribbon.utilityTools')"
    >
      <RibbonIconAction
        class="home-format-toolbar__stacked-action"
        :label="t('app.unavailableFeature', { feature: t('ribbon.print') })"
        :text="t('ribbon.print')"
        disabled
        data-ribbon-placeholder="print"
        data-ribbon-span="2"
      >
        <Printer :size="16" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </div>
</template>

<style scoped lang="scss">
.home-format-toolbar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 68px;
  padding: 5px 8px;
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--td-bg-color-container);
  scrollbar-width: thin;

  &__row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    min-height: 27px;
  }

  &__group {
    display: grid;
    flex: 0 0 auto;
    grid-template-rows: repeat(2, 27px);
    align-content: center;
    padding: 1px 3px;
    border-right: 1px solid var(--td-border-level-1-color);

    &:first-child {
      padding-left: 2px;
    }

    &:last-child {
      border-right: 0;
    }

    &[data-ribbon-group="history"] {
      flex-basis: 80px;

      .home-format-toolbar__row {
        justify-content: center;
      }
    }

    &[data-ribbon-group="cell"] {
      flex-basis: 309px;

      .home-format-toolbar__row {
        justify-content: space-between;
      }
    }

    &--automation {
      flex: 0 0 314px;
      min-width: 0;

      .home-format-toolbar__row {
        justify-content: flex-start;
      }
    }

    &--utility {
      flex: 0 0 80px;
      place-items: center;
      padding-right: 2px;
      padding-left: 6px;
    }
  }

  &__stacked-action {
    grid-row: 1 / 3;
    align-self: stretch;
    width: 48px;
    height: auto;
    flex-direction: column;
    gap: 3px;
  }
}
</style>
