import { strToU8 } from "fflate/browser";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import { getSheetChartData, type ChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import { createWorkbookEvaluator, type Sheet, type Workbook } from "@sheetcraft/core/workbook";
import {
  addDrawingContentType,
  appendNativeChartDrawing,
  nextDrawingPart,
} from "./drawing-parts.js";
import { toExcelNumberFormat } from "./number-format.js";
import { nativeDrawingAnchor } from "./drawing-geometry.js";
import { xml } from "./pivot-xml.js";
import type { EmittedPivotTable } from "./pivot-tables.js";
import type { CompatibilityReportBuilder } from "./report.js";

const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
type ChartSource = {
  data: ChartData;
  rows: number[];
  columns: number[];
  headerRow: number;
  names: string[];
};

function validXmlText(value: string): boolean {
  return [...value].every((character) => {
    const scalar = character.codePointAt(0)!;
    return (
      scalar === 9 ||
      scalar === 10 ||
      scalar === 13 ||
      (scalar >= 0x20 && scalar <= 0xd7ff) ||
      (scalar >= 0xe000 && scalar <= 0xfffd) ||
      (scalar >= 0x10000 && scalar <= 0x10ffff)
    );
  });
}

function chartSource(
  workbook: Workbook,
  sheet: Sheet,
  pivot: SheetPivotTable,
  drawing: SheetChartDrawing,
): ChartSource | undefined {
  const range = pivot.outputRange;
  const layout = pivot.resultLayout;
  if (
    !range ||
    !layout ||
    layout.labelColumns !== 1 ||
    !layout.dataRows.length ||
    pivot.rowFields.length !== 1 ||
    pivot.columnFields.length !== 1 ||
    pivot.values.length !== 1 ||
    pivot.groups?.length ||
    pivot.consolidation ||
    pivot.values[0]?.display ||
    !layout.headerRows ||
    drawing.chart.dataCache !== undefined
  )
    return;
  const rows = layout.dataRows.map((offset) => range.start.row + offset);
  if (rows.some((row, index) => row > range.end.row || (index > 0 && row !== rows[index - 1]! + 1)))
    return;
  const lastColumn = range.end.column - Number(pivot.columnTotals && !!pivot.columnFields.length);
  const columns = Array.from(
    { length: Math.max(0, lastColumn - range.start.column) },
    (_, index) => range.start.column + index + 1,
  );
  if (
    !columns.length ||
    (!drawing.chart.showHidden &&
      (rows.some((row) => sheet.hiddenRows?.has(row)) ||
        columns.some((column) => sheet.hiddenColumns?.has(column))))
  )
    return;
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const data = getSheetChartData(sheet, drawing.chart, evaluator);
  const headerRow = range.start.row + layout.headerRows - 1;
  const names = columns.map((column) =>
    String(evaluator.getComputedValue({ row: headerRow, column }) ?? ""),
  );
  if (
    data.categories.length !== rows.length ||
    data.series.length !== columns.length ||
    !data.series.some((series) => series.values.some((value) => value !== null)) ||
    data.categories.some((value) => !validXmlText(value)) ||
    names.some((name) => !validXmlText(name))
  )
    return;
  return { data, rows, columns, headerRow, names };
}

function reference(sheet: string, startRow: number, endRow: number, column: number): string {
  const prefix = `'${sheet.replace(/'/g, "''")}'!`;
  const absolute = (row: number) =>
    formatCellAddress({ row, column }).replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2");
  const first = absolute(startRow);
  return `${prefix}${first}${startRow === endRow ? "" : `:${absolute(endRow)}`}`;
}

function stringCache(values: readonly string[]): string {
  return `<c:ptCount val="${values.length}"/>${values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${xml(value)}</c:v></c:pt>`)
    .join("")}`;
}

function chartXml(
  workbook: Workbook,
  filename: string,
  native: EmittedPivotTable,
  pivot: SheetPivotTable,
  drawing: SheetChartDrawing,
  source: ChartSource,
): Uint8Array {
  const firstRow = source.rows[0]!;
  const lastRow = source.rows.at(-1)!;
  const categoryReference = reference(native.sheet.name, firstRow, lastRow, pivot.anchor.column);
  const series = source.data.series
    .map((series, index) => {
      const column = source.columns[index]!;
      const name = source.names[index]!;
      const numberFormat = series.numberFormat
        ? toExcelNumberFormat(series.numberFormat)
        : "General";
      const points = series.values
        .flatMap((value, point) =>
          value === null ? [] : [`<c:pt idx="${point}"><c:v>${value}</c:v></c:pt>`],
        )
        .join("");
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:strRef><c:f>${xml(reference(native.sheet.name, source.headerRow, source.headerRow, column))}</c:f><c:strCache>${stringCache([name])}</c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:schemeClr val="accent${(index % 6) + 1}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/><c:cat><c:strRef><c:f>${xml(categoryReference)}</c:f><c:strCache>${stringCache(source.data.categories)}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xml(reference(native.sheet.name, firstRow, lastRow, column))}</c:f><c:numCache><c:formatCode>${xml(numberFormat)}</c:formatCode><c:ptCount val="${source.rows.length}"/>${points}</c:numCache></c:numRef></c:val></c:ser>`;
    })
    .join("");
  const title = drawing.chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${xml(drawing.chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
    : `<c:autoTitleDeleted val="1"/>`;
  const labels = `<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${Number(drawing.chart.labels)}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const legend = drawing.chart.legend
    ? `<c:legend><c:legendPos val="r"/><c:layout/><c:overlay val="0"/></c:legend>`
    : "";
  // fmtId is a PivotChart formatting identity, not the pivot cache ID. This
  // initial producer-supported slice has no custom PivotChart format rules.
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${ART_NS}" xmlns:r="${REL_NS}"><c:date1904 val="${Number(workbook.dateSystem === "1904")}"/><c:style val="2"/><c:pivotSource><c:name>${xml(`[${filename}]${native.sheet.name}!${native.name}`)}</c:name><c:fmtId val="0"/></c:pivotSource><c:chart>${title}<c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}${labels}<c:gapWidth val="150"/><c:overlap val="0"/><c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>${legend}<c:plotVisOnly val="${Number(!drawing.chart.showHidden)}"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:extLst><c:ext uri="{781A3756-C4B2-4CAC-9D66-4F8BD8637D16}" xmlns:c14="http://schemas.microsoft.com/office/drawing/2007/8/2/chart"><c14:pivotOptions><c14:dropZoneFilter val="1"/><c14:dropZoneCategories val="1"/><c14:dropZoneData val="1"/><c14:dropZoneSeries val="1"/><c14:dropZonesVisible val="1"/></c14:pivotOptions></c:ext></c:extLst></c:chartSpace>`,
  );
}

/** Export only populated, genuine linked clustered-column reports in this slice. */
export function writeXlsxPivotCharts(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  pivots: ReadonlyMap<SheetPivotTable, EmittedPivotTable>,
  filename: string,
  report?: CompatibilityReportBuilder,
): void {
  for (const sheet of workbook.sheets.values()) {
    for (const drawing of sheet.drawings ?? []) {
      const location = `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`;
      const pivot =
        drawing.kind === "chart"
          ? sheet.pivotTables?.find((table) => table.id === drawing.chart.pivotTableId)
          : undefined;
      const native = pivot && pivots.get(pivot);
      const supported =
        drawing.kind === "chart" &&
        native &&
        native.axisItems &&
        drawing.chart.type === "column" &&
        !drawing.chart.stacked &&
        drawing.rotation === 0 &&
        !!filename.trim() &&
        !/[[\]!/\\]/.test(filename) &&
        !/[[\]!]/.test(native.sheet.name + native.name) &&
        [filename, native.sheet.name, native.name, drawing.name, drawing.chart.title].every(
          validXmlText,
        );
      const source = supported ? chartSource(workbook, sheet, pivot, drawing) : undefined;
      if (!source || drawing.kind !== "chart" || !native || !pivot) {
        report?.add("feature-omitted", "warning", location);
        continue;
      }
      let anchor;
      try {
        anchor = nativeDrawingAnchor(
          sheet,
          drawing.anchor.row,
          drawing.anchor.column,
          drawing.offsetX,
          drawing.offsetY,
          drawing.width,
          drawing.height,
        );
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        report?.add("feature-omitted", "warning", location);
        continue;
      }
      const part = nextDrawingPart(entries, "chart");
      entries[part] = chartXml(workbook, filename, native, pivot, drawing, source);
      addDrawingContentType(
        entries,
        part,
        "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      );
      appendNativeChartDrawing(entries, native.sheetPart, drawing, part, anchor);
      // This initial native slice uses the target app's chart palette/typography;
      // generic drawing decoration is not yet a fidelity guarantee.
      report?.add("style-omitted", "warning", `${location}.style`);
    }
  }
}
