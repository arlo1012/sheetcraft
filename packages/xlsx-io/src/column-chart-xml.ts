import { nativeChartAxisTitle } from "./native-chart-axis-titles.js";
import {
  nativeChartSeriesColors,
  nativeChartLegendSurface,
  nativeChartTextBody,
  nativeChartTextProperties,
} from "./native-chart-styles.js";
import { nativeChartRgb, nativeValueAxisNumberCode } from "./native-chart-style-capabilities.js";
import { strToU8 } from "fflate/browser";
import { formatCellAddress } from "@sheetcraft/core/coordinates";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellRange, Workbook } from "@sheetcraft/core/workbook";
import { nativeChartElementValues } from "./native-chart-elements.js";
import { toExcelNumberFormat } from "./number-format.js";
import { xml } from "./pivot-xml.js";

const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export type ColumnChartSource = {
  data: ChartData;
  valueRanges: CellRange[];
  nameRanges: Array<CellRange | null>;
  categoryRange: CellRange | null;
  names: string[];
};

export function validXmlText(value: string): boolean {
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

export function columnChartReference(sheet: string, range: CellRange): string {
  const prefix = `'${sheet.replace(/'/g, "''")}'!`;
  const absolute = (cell: CellRange["start"]) =>
    formatCellAddress(cell).replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2");
  const first = absolute(range.start);
  const last = absolute(range.end);
  return `${prefix}${first}${first === last ? "" : `:${last}`}`;
}

function stringCache(values: readonly string[]): string {
  return `<c:ptCount val="${values.length}"/>${values
    .map((value, index) => `<c:pt idx="${index}"><c:v>${xml(value)}</c:v></c:pt>`)
    .join("")}`;
}

export function columnChartXml(
  workbook: Workbook,
  sheetName: string,
  drawing: SheetChartDrawing,
  source: ColumnChartSource,
  pivotIdentity?: string,
): Uint8Array {
  const elements =
    pivotIdentity === undefined ? nativeChartElementValues(drawing.chart) : undefined;
  const line = drawing.chart.type === "line" && pivotIdentity === undefined;
  const horizontal = drawing.chart.type === "bar" && pivotIdentity === undefined;
  const family = line ? "lineChart" : "barChart";
  const familyStart = line
    ? `<c:grouping val="standard"/><c:varyColors val="0"/>`
    : `<c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>`;
  const familyEnd = line
    ? `<c:marker val="1"/><c:smooth val="0"/>`
    : `<c:gapWidth val="${horizontal ? 140 : 150}"/><c:overlap val="${horizontal ? -40 : 0}"/>`;
  const category = source.categoryRange
    ? `<c:cat><c:strRef><c:f>${xml(columnChartReference(sheetName, source.categoryRange))}</c:f><c:strCache>${stringCache(source.data.categories)}</c:strCache></c:strRef></c:cat>`
    : "";
  const colors =
    pivotIdentity === undefined ? nativeChartSeriesColors(drawing.chart, source.names) : undefined;
  const series = source.data.series
    .map((series, index) => {
      const name = source.names[index]!;
      const nameRange = source.nameRanges[index]!;
      // WPS's Edit Series producer uses a quoted string constant when no
      // worksheet title cell exists. Only generated Core index names use it.
      const nameReference = nameRange
        ? columnChartReference(sheetName, nameRange)
        : JSON.stringify(name);
      const numberFormat = series.numberFormat
        ? toExcelNumberFormat(series.numberFormat)
        : "General";
      const points = series.values
        .flatMap((value, point) =>
          value === null ? [] : [`<c:pt idx="${point}"><c:v>${value}</c:v></c:pt>`],
        )
        .join("");
      const settings =
        line && series.id !== undefined
          ? drawing.chart.format?.series?.find((entry) => entry.id === series.id)
          : undefined;
      const lineWidth = Math.round((settings?.strokeWidth ?? 3) * 9525);
      const paint = colors?.[index]
        ? `<a:srgbClr val="${nativeChartRgb(colors[index])!}"/>`
        : `<a:schemeClr val="accent${(index % 6) + 1}"/>`;
      const marker =
        settings?.markers === false
          ? `<c:marker><c:symbol val="none"/></c:marker>`
          : `<c:marker><c:symbol val="circle"/><c:size val="${settings?.markerSizePt ?? 5}"/>${colors?.[index] ? `<c:spPr><a:solidFill>${paint}</a:solidFill><a:ln><a:solidFill>${paint}</a:solidFill></a:ln></c:spPr>` : ""}</c:marker>`;
      return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/><c:tx><c:strRef><c:f>${xml(nameReference)}</c:f><c:strCache>${stringCache([name])}</c:strCache></c:strRef></c:tx>${line ? `<c:spPr><a:ln w="${lineWidth}" cap="rnd"><a:solidFill>${paint}</a:solidFill><a:round/></a:ln></c:spPr>${marker}` : `<c:spPr><a:solidFill>${paint}</a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>`}${category}<c:val><c:numRef><c:f>${xml(columnChartReference(sheetName, source.valueRanges[index]!))}</c:f><c:numCache><c:formatCode>${xml(numberFormat)}</c:formatCode><c:ptCount val="${source.data.categories.length}"/>${points}</c:numCache></c:numRef></c:val>${line ? `<c:smooth val="0"/>` : ""}</c:ser>`;
    })
    .join("");
  const titleStyle =
    pivotIdentity === undefined
      ? {
          ...(drawing.chart.format?.title?.scriptFonts ? {} : { fontFamily: "Arial" }),
          fontSize: 15,
          bold: false,
          ...drawing.chart.format?.title,
        }
      : undefined;
  const title = drawing.chart.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p>${titleStyle ? `<a:pPr>${nativeChartTextProperties(titleStyle)}</a:pPr>` : ""}<a:r><a:t>${xml(drawing.chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="${Number(elements?.titleOverlay ?? false)}"/></c:title>`
    : `<c:autoTitleDeleted val="1"/>`;
  const labels = `<c:dLbls>${elements?.labelPosition ? `<c:dLblPos val="${elements.labelPosition}"/>` : ""}<c:showLegendKey val="0"/><c:showVal val="${Number(drawing.chart.labels)}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const legend = drawing.chart.legend
    ? `<c:legend><c:legendPos val="${elements?.legendPosition ?? "r"}"/><c:layout/><c:overlay val="${Number(elements?.legendOverlay ?? false)}"/>${pivotIdentity === undefined ? nativeChartLegendSurface(drawing.chart.format?.legend?.surface) + nativeChartTextBody(drawing.chart.format?.legend?.text, true) : ""}</c:legend>`
    : "";
  const valueAxis = pivotIdentity === undefined ? drawing.chart.format?.valueAxis : undefined;
  const axisNumberCode =
    valueAxis?.numberFormat === undefined
      ? "General"
      : nativeValueAxisNumberCode(valueAxis.numberFormat);
  if (
    axisNumberCode === undefined ||
    (valueAxis?.linkedToSource === true && valueAxis.numberFormat !== undefined)
  )
    throw new Error("Unsupported value axis number format.");
  const sourceLinked = valueAxis?.linkedToSource ?? valueAxis?.numberFormat === undefined;
  return strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${ART_NS}" xmlns:r="${REL_NS}"><c:date1904 val="${Number(workbook.dateSystem === "1904")}"/><c:style val="2"/>${pivotIdentity ? `<c:pivotSource><c:name>${xml(pivotIdentity)}</c:name><c:fmtId val="0"/></c:pivotSource>` : ""}<c:chart>${title}<c:plotArea><c:layout/><c:${family}>${familyStart}${series}${labels}${familyEnd}<c:axId val="1"/><c:axId val="2"/></c:${family}><c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "l" : "b"}"/>${pivotIdentity === undefined ? nativeChartAxisTitle(drawing.chart.format?.categoryAxis, nativeChartTextProperties) : ""}<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${pivotIdentity === undefined ? nativeChartTextBody(drawing.chart.format?.categoryAxis?.text, false, drawing.chart.format?.categoryAxis?.labelAngle) : ""}<c:crossAx val="2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? "b" : "l"}"/><c:majorGridlines/>${pivotIdentity === undefined ? nativeChartAxisTitle(drawing.chart.format?.valueAxis, nativeChartTextProperties) : ""}<c:numFmt formatCode="${xml(axisNumberCode)}" sourceLinked="${Number(sourceLinked)}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${pivotIdentity === undefined ? nativeChartTextBody(drawing.chart.format?.valueAxis?.text) : ""}<c:crossAx val="1"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea>${legend}<c:plotVisOnly val="${Number(!drawing.chart.showHidden)}"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart>${pivotIdentity ? `<c:extLst><c:ext uri="{781A3756-C4B2-4CAC-9D66-4F8BD8637D16}" xmlns:c14="http://schemas.microsoft.com/office/drawing/2007/8/2/chart"><c14:pivotOptions><c14:dropZoneFilter val="1"/><c14:dropZoneCategories val="1"/><c14:dropZoneData val="1"/><c14:dropZoneSeries val="1"/><c14:dropZonesVisible val="1"/></c14:pivotOptions></c:ext></c:extLst>` : ""}</c:chartSpace>`,
  );
}
