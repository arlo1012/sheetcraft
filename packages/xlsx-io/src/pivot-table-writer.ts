import { nativeValueXml } from "./pivot-native-values.js";
import { nativeGroupFingerprint } from "./pivot-native-groups.js";
import { strToU8 } from "fflate/browser";
import type { Workbook } from "@sheetcraft/core/workbook";
import {
  buildPivotResult,
  getPivotGroupLabels,
  getPivotPresentation,
  getPivotTableRange,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import type { CompatibilityReportBuilder } from "./report.js";
import {
  MAIN_NS,
  REL_NS,
  PIVOT_EXT,
  rangeRef,
  xml,
  parseXml,
  child,
  pivotFingerprint,
} from "./pivot-xml.js";
import { nativePivotSourceFingerprint, pivotValueKey, type PivotCache } from "./pivot-cache.js";
import { nativePivotFiltersXml } from "./pivot-native-filters.js";
import { nativePivotAxisItems, nativePivotFieldItemOrder } from "./pivot-native-items.js";

export function pivotTableXml(
  workbook: Workbook,
  table: SheetPivotTable,
  cache: PivotCache,
  cacheId: number,
  nativeName: string,
  report?: CompatibilityReportBuilder,
  nativeStyleName?: string,
): Uint8Array {
  const result = buildPivotResult(workbook, table, { useCache: true });
  const axisItems = nativePivotAxisItems(table, cache, result);
  const presentation = getPivotPresentation(table);
  const range = getPivotTableRange(table);
  const location = {
    start: { ...range.start, row: range.start.row + result.headerStart },
    end: range.end,
  };
  const rowFields = table.rowFields;
  const columnFields = [...table.columnFields, ...(table.values.length > 1 ? [-2] : [])];
  const fields = cache.headers
    .map((_, field) => {
      const page = table.filters.find((filter) => filter.field === field);
      const axis = rowFields.includes(field)
        ? "axisRow"
        : table.columnFields.includes(field)
          ? "axisCol"
          : page
            ? "axisPage"
            : undefined;
      const rule = table.axisFilters?.find((rule) => rule.field === field);
      const selected = page ? (page.all ? undefined : page.values) : rule?.values;
      const allowed = selected === undefined ? undefined : new Set(selected.map(pivotValueKey));
      const sort = table.sortFields?.find((rule) => rule.field === field);
      const order = sort?.order ?? table.sort;
      const group = table.groups?.find((group) => group.field === field);
      const members = group
        ? getPivotGroupLabels(group, workbook.dateSystem)
        : cache.shared[field]!;
      const items = axis
        ? `<items count="${members.length}">${nativePivotFieldItemOrder(table, field, members)
            .map(
              (index) =>
                `<item x="${index}"${allowed && !allowed.has(pivotValueKey(members[index]!)) ? ' h="1"' : ""}/>`,
            )
            .join("")}</items>`
        : "";
      const sortScope =
        sort?.measure === undefined
          ? ""
          : `<autoSortScope><pivotArea dataOnly="0" outline="0"><references count="1"><reference field="4294967294" count="1" selected="0"><x v="${sort.measure}"/></reference></references></pivotArea></autoSortScope>`;
      const repeatLabels =
        axis === "axisRow"
          ? `<extLst><ext uri="{2946ED86-A175-432a-8AC1-64E0C546D7DE}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:pivotField fillDownLabels="${presentation.repeatLabels ? 1 : 0}"/></ext></extLst>`
          : "";
      return `<pivotField${axis ? ` axis="${axis}"` : ""}${table.values.some((value) => value.field === field) ? ' dataField="1"' : ""} showAll="0" defaultSubtotal="${presentation.subtotals === "off" ? 0 : 1}" subtotalTop="${presentation.subtotals === "bottom" ? 0 : 1}" compact="${presentation.layout === "compact" ? 1 : 0}" outline="${presentation.layout === "tabular" ? 0 : 1}" insertBlankRow="${presentation.blankRows ? 1 : 0}" multipleItemSelectionAllowed="${selected !== undefined && selected.length !== 1 ? 1 : 0}" sortType="${order === "source" ? "manual" : order}">${items}${sortScope}${repeatLabels}</pivotField>`;
    })
    .join("");
  const pageFields = table.filters
    .map((filter) => {
      const member =
        filter.all || filter.values.length !== 1
          ? undefined
          : (table.groups?.some((group) => group.field === filter.field)
              ? getPivotGroupLabels(
                  table.groups.find((group) => group.field === filter.field)!,
                  workbook.dateSystem,
                )
              : cache.shared[filter.field]!
            ).findIndex((value) => pivotValueKey(value) === pivotValueKey(filter.values[0]!));
      return `<pageField fld="${filter.field}" hier="-1"${member === undefined || member < 0 ? "" : ` item="${member}"`}/>`;
    })
    .join("");
  const style = workbook.pivotTableStyles?.find((style) => style.id === table.styleId);
  const styleName =
    nativeStyleName ??
    style?.name ??
    (table.styleId?.startsWith("xlsx-pivot-table-style-")
      ? table.styleId.slice("xlsx-pivot-table-style-".length)
      : "PivotStyleLight16");
  const bindings = Object.fromEntries(
    [...workbook.sheets.values()].map((sheet) => [sheet.id, sheet.name]),
  );
  const list = (tag: string, fields: number[]) =>
    fields.length
      ? `<${tag} count="${fields.length}">${fields.map((field) => `<field x="${field}"/>`).join("")}</${tag}>`
      : "";
  const usedCaptions = new Set(cache.headers.map((header) => header.toLowerCase()));
  const captions = table.values.map((value) => {
    let caption = value.caption;
    for (let suffix = 2; usedCaptions.has(caption.toLowerCase()); suffix++)
      caption = `${value.caption} (${suffix})`;
    usedCaptions.add(caption.toLowerCase());
    return caption;
  });
  // Compact headers must agree with Core's report, instead of client-localized defaults.
  const rowHeaderCaption = rowFields.length ? result.headers[rowFields[0]!] : undefined;
  const columnHeaderCaption = table.columnFields.length
    ? table.consolidation && table.reportLayout
      ? table.reportLayout.columnLabel
      : table.columnFields.map((field) => result.headers[field]!).join(" / ")
    : undefined;
  const headerCaptions =
    (rowHeaderCaption === undefined ? "" : ` rowHeaderCaption="${xml(rowHeaderCaption)}"`) +
    (columnHeaderCaption === undefined ? "" : ` colHeaderCaption="${xml(columnHeaderCaption)}"`);
  // missingCaption fills empty data intersections; emptyLabel names blank axis members.
  const native = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><pivotTableDefinition xmlns="${MAIN_NS}" xmlns:r="${REL_NS}" name="${xml(nativeName)}" cacheId="${cacheId}" dataCaption="Values" grandTotalCaption="${xml(table.totalLabel)}" missingCaption="" showMissing="1" rowGrandTotals="${table.columnTotals ? 1 : 0}" colGrandTotals="${table.rowTotals ? 1 : 0}" compact="${presentation.layout === "compact" ? 1 : 0}" compactData="${presentation.layout === "compact" ? 1 : 0}" outline="${presentation.layout === "tabular" ? 0 : 1}" showHeaders="${presentation.rowHeaders || presentation.columnHeaders ? 1 : 0}"${headerCaptions} multipleFieldFilters="1" preserveFormatting="1" useAutoFormatting="1" createdVersion="6" updatedVersion="6" minRefreshableVersion="3"${table.values.length > 1 ? ` dataPosition="${table.columnFields.length}"` : ""}><location ref="${rangeRef(location)}" firstHeaderRow="${Math.max(0, result.headerRows - result.headerStart - 1)}" firstDataRow="${Math.max(1, result.headerRows - result.headerStart)}" firstDataCol="${result.rowLabelColumns}"${table.filters.length ? ` rowPageCount="${table.filters.length}" colPageCount="1"` : ""}/><pivotFields count="${cache.headers.length}">${fields}</pivotFields>${list("rowFields", rowFields)}${axisItems.rowItems}${list("colFields", columnFields)}${axisItems.colItems}${pageFields ? `<pageFields count="${table.filters.length}">${pageFields}</pageFields>` : ""}${
    table.values.length
      ? `<dataFields count="${table.values.length}">${table.values
          .map((value, index) =>
            nativeValueXml(
              value,
              captions[index]!,
              cache.valueNumberFormats?.[index] ??
                (value.aggregate === "count" || value.aggregate === "countNums"
                  ? 0
                  : (cache.numberFormats[value.field] ?? 0)),
              cache.headers.map((_, field) => {
                const members = table.groups?.find((group) => group.field === field)
                  ? getPivotGroupLabels(
                      table.groups.find((group) => group.field === field)!,
                      workbook.dateSystem,
                    )
                  : cache.shared[field]!;
                return nativePivotFieldItemOrder(table, field, members).map(
                  (index) => members[index]!,
                );
              }),
            ),
          )
          .join("")}</dataFields>`
      : ""
  }<pivotTableStyleInfo name="${xml(styleName)}" showRowHeaders="${presentation.rowHeaders ? 1 : 0}" showColHeaders="${presentation.columnHeaders ? 1 : 0}" showRowStripes="${presentation.bandedRows ? 1 : 0}" showColStripes="${presentation.bandedColumns ? 1 : 0}" showLastColumn="1"/>${nativePivotFiltersXml(table, report)}</pivotTableDefinition>`;
  const metadata = {
    version: 1,
    table: { ...table, dataCache: undefined },
    bindings,
    cacheSourceFingerprint: nativePivotSourceFingerprint(workbook, table),
    cacheGroupFingerprint: nativeGroupFingerprint(
      table.groups,
      cache.headers.length,
      workbook.dateSystem,
    ),
    nativeFingerprint: pivotFingerprint(child(parseXml(strToU8(native)), "pivotTableDefinition")),
  };
  return strToU8(
    native.replace(
      "</pivotTableDefinition>",
      () =>
        `<extLst><ext uri="${PIVOT_EXT}"><i10:metadata xmlns:i10="${PIVOT_EXT}">${xml(JSON.stringify(metadata))}</i10:metadata></ext></extLst></pivotTableDefinition>`,
    ),
  );
}
