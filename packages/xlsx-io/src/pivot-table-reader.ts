import type { CellNumberFormat } from "@sheetcraft/core/style";
import { readNativeValue } from "./pivot-native-values.js";
import { cacheGroupFingerprint, readNativePivotGroups } from "./pivot-native-groups.js";
import type { FormulaValue } from "@sheetcraft/core/formula";
import { createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import {
  buildPivotResult,
  getPivotTableSource,
  normalizePivotTable,
  resolvePivotTableSource,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import {
  pivotCacheSourceFingerprint,
  primitivePivotValue,
  readPivotSharedItems,
  readPivotCacheRecords,
} from "./pivot-cache.js";
import { readNativePivotFilters } from "./pivot-native-filters.js";
import {
  attr,
  child,
  flag,
  nodes,
  parseRange,
  parseXml,
  PIVOT_EXT,
  pivotFingerprint,
  type XmlNode,
} from "./pivot-xml.js";
import { xlsxPivotTableStyleId } from "./table-styles.js";

function requiresBoundTable(root: XmlNode, cacheRoot: XmlNode): boolean {
  const ext = nodes(child(root, "extLst").ext).find((ext) => attr(ext, "uri") === PIVOT_EXT);
  if (typeof ext?.metadata !== "string") return false;
  try {
    const data = JSON.parse(ext.metadata) as {
      version?: unknown;
      table?: { sourceTableId?: unknown };
      nativeFingerprint?: unknown;
      cacheSourceFingerprint?: unknown;
    };
    return (
      data.version === 1 &&
      typeof data.table?.sourceTableId === "string" &&
      !!data.table.sourceTableId.trim() &&
      data.nativeFingerprint === pivotFingerprint(root) &&
      data.cacheSourceFingerprint === pivotCacheSourceFingerprint(cacheRoot)
    );
  } catch {
    return false;
  }
}
function nativeSource(
  workbook: Workbook,
  cacheRoot: XmlNode,
  headers: string[],
  boundTableRequired: boolean,
): Pick<SheetPivotTable, "sourceSheetId" | "sourceTableId" | "source" | "consolidation"> {
  const source = child(cacheRoot, "cacheSource");
  const sheetNamed = (name: string) => {
    const sheet = [...workbook.sheets.values()].find((sheet) => sheet.name === name);
    if (!sheet) throw new Error("Missing pivot source worksheet.");
    return sheet;
  };
  if (attr(source, "type") === "worksheet") {
    const worksheet = child(source, "worksheetSource");
    const name = attr(worksheet, "name");
    if (name) {
      const sheetName = attr(worksheet, "sheet");
      const tables = [...workbook.sheets.values()].flatMap((sheet) =>
        (sheet.tables ?? [])
          .filter((table) => table.name.toLowerCase() === name.toLowerCase())
          .map((table) => ({ sheet, table })),
      );
      if (tables.length) {
        if (tables.length !== 1) throw new Error("Ambiguous pivot source table.");
        const { sheet, table } = tables[0]!;
        if (!table.headerRow || (sheetName && sheet.name !== sheetName))
          throw new Error("Invalid pivot source table.");
        return {
          sourceSheetId: sheet.id,
          // Native table IDs are rewritten on export; the imported table is authoritative.
          sourceTableId: table.id,
          source: {
            start: { ...table.range.start },
            end: { ...table.range.end, row: table.range.end.row - (table.totalRow ? 1 : 0) },
          },
        };
      }
      // A matching own binding cannot turn into an identically named defined range.
      if (boundTableRequired) throw new Error("Missing bound pivot source table.");
      const definition = [...workbook.definedNames.values()].find(
        (definition) => definition.name.toLowerCase() === name.toLowerCase(),
      );
      if (definition)
        return {
          sourceSheetId: definition.reference.sheetId,
          source: { start: definition.reference.start, end: definition.reference.end },
        };
      throw new Error("Unsupported pivot named source.");
    }
    return {
      sourceSheetId: sheetNamed(attr(worksheet, "sheet")).id,
      source: parseRange(attr(worksheet, "ref")),
    };
  }
  if (attr(source, "type") !== "consolidation") throw new Error("Unsupported pivot source.");
  const consolidation = child(source, "consolidation");
  const pages = nodes(child(consolidation, "pages").page).map((page) =>
    nodes(page.pageItem).map((item) => attr(item, "name")),
  );
  const count = headers.length - 3;
  if (count < 0 || count > 4) throw new Error("Unsupported consolidation pages.");
  const autoPage = flag(consolidation, "autoPage");
  const ranges = nodes(child(consolidation, "rangeSets").rangeSet).map((range, index) => {
    const pageItems = Array.from({ length: count }, (_, page) => {
      const item = pages[page]?.[Number(attr(range, `i${page + 1}`, "-1"))];
      if (item !== undefined) return item;
      if (autoPage && count === 1) return `Item${index + 1}`;
      throw new Error("Invalid consolidation page assignment.");
    });
    return {
      sheetId: sheetNamed(attr(range, "sheet")).id,
      range: parseRange(attr(range, "ref")),
      label: pageItems[0] ?? `Area ${index + 1}`,
      pageItems,
    };
  });
  if (!ranges.length) throw new Error("Empty consolidation source.");
  return {
    sourceSheetId: ranges[0]!.sheetId,
    source: ranges[0]!.range,
    consolidation: {
      labels: headers,
      ranges,
      pageFields: { mode: autoPage ? "single" : "custom", count },
    },
  };
}
function restoreMetadata(
  root: XmlNode,
  cacheRoot: XmlNode,
  workbook: Workbook,
  native: SheetPivotTable,
): SheetPivotTable {
  const ext = nodes(child(root, "extLst").ext).find((ext) => attr(ext, "uri") === PIVOT_EXT);
  if (!ext || typeof ext.metadata !== "string") return native;
  try {
    const data = JSON.parse(ext.metadata) as {
      version?: unknown;
      nativeFingerprint?: string;
      cacheGroupFingerprint?: string;
      cacheSourceFingerprint?: string;
      table?: SheetPivotTable;
      bindings?: Record<string, string>;
    };
    if (
      data.version !== 1 ||
      !data.table ||
      !data.bindings ||
      data.nativeFingerprint !== pivotFingerprint(root) ||
      (data.cacheSourceFingerprint !== undefined &&
        data.cacheSourceFingerprint !== pivotCacheSourceFingerprint(cacheRoot)) ||
      (data.table.sourceTableId !== undefined && data.cacheSourceFingerprint === undefined) ||
      (data.cacheGroupFingerprint !== undefined
        ? data.cacheGroupFingerprint !== cacheGroupFingerprint(cacheRoot)
        : !!native.groups?.length)
    )
      return native;
    const remap = (id: string) => {
      const sheet = [...workbook.sheets.values()].find(
        (sheet) => sheet.name === data.bindings![id],
      );
      if (!sheet) throw new Error("Missing metadata source.");
      return sheet.id;
    };
    const restored = normalizePivotTable({
      ...data.table,
      sourceSheetId: remap(data.table.sourceSheetId),
      ...(data.table.sourceTableId !== undefined
        ? {
            // Native identity wins; source remains the last-refresh rectangle.
            sourceTableId: native.sourceTableId,
          }
        : {}),
      ...(data.table.consolidation
        ? {
            consolidation: {
              ...data.table.consolidation,
              ranges: data.table.consolidation.ranges.map((area) => ({
                ...area,
                sheetId: remap(area.sheetId),
              })),
            },
          }
        : {}),
    });
    // External edits to the native axes/source/layout take precedence over stale extension data.
    const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
    if (
      !same(restored.rowFields, native.rowFields) ||
      !same(restored.columnFields, native.columnFields) ||
      !same(
        restored.values.map(({ field, aggregate }) => ({ field, aggregate })),
        native.values.map(({ field, aggregate }) => ({ field, aggregate })),
      ) ||
      (data.table.sourceTableId === undefined) !== (native.sourceTableId === undefined) ||
      !(restored.sourceTableId !== undefined && restored.source && native.source
        ? restored.source.start.column === native.source.start.column &&
          restored.source.end.column === native.source.end.column
        : same(restored.source, native.source)) ||
      restored.sourceSheetId !== native.sourceSheetId
    )
      return native;
    restored.dataCache = native.dataCache;
    const result = buildPivotResult(workbook, restored, { useCache: true });
    if (
      restored.anchor.row + result.headerStart !==
        parseRange(attr(child(root, "location"), "ref")).start.row ||
      restored.anchor.column !== parseRange(attr(child(root, "location"), "ref")).start.column
    )
      return native;
    return restored;
  } catch {
    return native;
  }
}
export function readPivotTable(
  workbook: Workbook,
  definitionBytes: Uint8Array,
  cacheBytes: Uint8Array,
  id: string,
  recordsBytes?: Uint8Array,
  reportSheetId?: string,
  readNumberFormat?: (id: number) => CellNumberFormat | undefined,
): SheetPivotTable {
  const root = child(parseXml(definitionBytes), "pivotTableDefinition");
  const cacheRoot = child(parseXml(cacheBytes), "pivotCacheDefinition");
  if (flag(root, "dataOnRows") || "calculatedItems" in cacheRoot || "cacheHierarchies" in cacheRoot)
    throw new Error("Unsupported pivot layout or calculated cache.");
  const cacheFields = nodes(child(cacheRoot, "cacheFields").cacheField);
  if (
    cacheFields.some((field) => attr(field, "databaseField", "1") === "0" || attr(field, "formula"))
  )
    throw new Error("Unsupported grouped/calculated pivot.");
  const cache = readPivotSharedItems(cacheBytes, workbook.dateSystem);
  const groups = readNativePivotGroups(cacheRoot, workbook.dateSystem);
  const fields = nodes(child(root, "pivotFields").pivotField);
  const source = nativeSource(
    workbook,
    cacheRoot,
    cache.headers,
    requiresBoundTable(root, cacheRoot),
  );
  const location = parseRange(attr(child(root, "location"), "ref"));
  const axisFields = (tag: string) =>
    nodes(child(root, tag).field)
      .map((field) => Number(attr(field, "x", "-1")))
      .filter((field) => field !== -2);
  const rowFields = axisFields("rowFields");
  const columnFields = axisFields("colFields");
  const readValues = (
    field: number,
  ): { values: FormulaValue[]; hidden: boolean; itemValues: FormulaValue[] } => {
    if (!Number.isInteger(field) || field < 0 || field >= cache.headers.length)
      throw new Error("Invalid pivot field.");
    const members = groups.find((group) => group.field === field)?.labels ?? cache.shared[field]!;
    const items = nodes(child(fields[field] ?? {}, "items").item).filter((item) =>
      ["", "data"].includes(attr(item, "t")),
    );
    const values: FormulaValue[] = [];
    const itemValues: FormulaValue[] = [];
    let hidden = false;
    for (const item of items) {
      const index = Number(attr(item, "x", "-1"));
      if (index < 0 || index >= members.length) throw new Error("Invalid pivot member.");
      const value = members[index]!;
      itemValues.push(value);
      if (flag(item, "h")) hidden = true;
      else values.push(value);
    }
    return { values, hidden, itemValues };
  };
  const filters = nodes(child(root, "pageFields").pageField).map((page) => {
    const field = Number(attr(page, "fld", "-1"));
    const selection = readValues(field);
    const item = attr(page, "item");
    if (item !== "") {
      const value = selection.itemValues[Number(item)];
      if (value === undefined) throw new Error("Invalid page selection.");
      return { field, all: false, values: [primitivePivotValue(value)] };
    }
    return {
      field,
      all: !selection.hidden,
      values: selection.hidden ? selection.values.map(primitivePivotValue) : [],
    };
  });
  const baseMembers = cache.headers.map((_, index) => {
    const items = readValues(index).itemValues;
    return items.length
      ? items
      : (groups.find((group) => group.field === index)?.labels ?? cache.shared[index]!);
  });
  const values = nodes(child(root, "dataFields").dataField).map((field) => {
    const index = Number(attr(field, "fld", "-1"));
    const value = readNativeValue(field, baseMembers);
    const formatId = Number(attr(field, "numFmtId", "0"));
    const type = value.display?.type;
    const format =
      readNumberFormat?.(formatId) ??
      (formatId === 0 && type && (type.startsWith("percent") || type === "percentDiff")
        ? { kind: "custom" as const, code: "General" }
        : undefined);
    return {
      field: index,
      ...value,
      ...(format ? { numberFormat: format } : {}),
      caption: attr(field, "name", cache.headers[index] ?? "Value"),
    };
  });
  const compact = flag(root, "compact", true);
  const outline = flag(root, "outline");
  const style = child(root, "pivotTableStyleInfo");
  const rowField = fields[rowFields[0] ?? -1] ?? {};
  const table: SheetPivotTable = {
    id,
    ...(groups.length ? { groups } : {}),
    ...(recordsBytes
      ? {
          dataCache: {
            headers: cache.headers,
            records: readPivotCacheRecords(recordsBytes, cache, workbook.dateSystem),
          },
        }
      : {}),
    name: attr(root, "name", "PivotTable"),
    ...source,
    anchor: {
      ...location.start,
      row: Math.max(0, location.start.row - (filters.length ? filters.length + 1 : 0)),
    },
    outputRange: {
      start: {
        ...location.start,
        row: Math.max(0, location.start.row - (filters.length ? filters.length + 1 : 0)),
      },
      end: location.end,
    },
    rowFields,
    columnFields,
    values,
    filters,
    rowTotals: flag(root, "colGrandTotals", true),
    columnTotals: flag(root, "rowGrandTotals", true),
    includeHidden: true,
    sort: "source",
    totalLabel: attr(root, "grandTotalCaption", "Grand Total"),
    // missingCaption is a data-cell replacement, not the name of a blank axis member.
    emptyLabel: "(blank)",
    styleId: xlsxPivotTableStyleId(attr(style, "name")),
    reportLayout: {
      rowLabel: attr(root, "rowHeaderCaption", "Row Labels"),
      columnLabel: attr(root, "colHeaderCaption", "Column Labels"),
      allLabel: "(All)",
      multipleLabel: "(Multiple Items)",
    },
    presentation: {
      layout: compact ? "compact" : outline ? "outline" : "tabular",
      subtotals: flag(rowField, "defaultSubtotal", true)
        ? flag(rowField, "subtotalTop", true)
          ? "top"
          : "bottom"
        : "off",
      repeatLabels:
        rowFields.length > 0 &&
        rowFields.every((field) => {
          const extension = nodes(child(fields[field] ?? {}, "extLst").ext).find(
            (ext) => attr(ext, "uri") === "{2946ED86-A175-432a-8AC1-64E0C546D7DE}",
          );
          return extension ? flag(child(extension, "pivotField"), "fillDownLabels") : false;
        }),
      blankRows: flag(rowField, "insertBlankRow"),
      rowHeaders: flag(style, "showRowHeaders", true),
      columnHeaders: flag(style, "showColHeaders", true),
      bandedRows: flag(style, "showRowStripes"),
      bandedColumns: flag(style, "showColStripes"),
    },
  };
  for (const [axis, indices] of [
    ["rows", rowFields],
    ["columns", columnFields],
  ] as const) {
    for (const field of indices) {
      const selection = readValues(field);
      if (selection.hidden)
        (table.axisFilters ??= []).push({
          axis,
          field,
          values: selection.values.map(primitivePivotValue),
        });
      const definition = fields[field] ?? {};
      const order = attr(definition, "sortType", "manual");
      if (order === "ascending" || order === "descending") {
        const reference = nodes(
          child(child(child(definition, "autoSortScope"), "pivotArea"), "references").reference,
        ).find((reference) => attr(reference, "field") === "4294967294");
        const measure = reference ? Number(attr(nodes(reference.x)[0] ?? {}, "v", "0")) : undefined;
        (table.sortFields ??= []).push({
          axis,
          field,
          order,
          ...(measure === undefined ? {} : { measure }),
        });
      }
    }
  }
  readNativePivotFilters(root, table);
  const normalized = normalizePivotTable(table);
  // Validate actual sources without replacing the already cached worksheet results.
  const width =
    normalized.consolidation?.labels.length ??
    (normalized.sourceTableId !== undefined
      ? resolvePivotTableSource(workbook, normalized).headers.length
      : normalized.source
        ? normalized.source.end.column - normalized.source.start.column + 1
        : 0);
  if (width !== cache.headers.length) throw new Error("Pivot source fields changed.");
  if (!normalized.dataCache) getPivotTableSource(workbook, normalized);
  const restored = restoreMetadata(root, cacheRoot, workbook, normalized);
  if (restored.dataCache && !restored.resultLayout) {
    // Offer drill-through only when our rebuilt layout agrees with the imported displayed cells.
    // External clients may retain manual ordering/layouts that this model cannot reproduce.
    try {
      const result = buildPivotResult(workbook, restored, { useCache: true });
      if (
        reportSheetId &&
        restored.outputRange &&
        result.matrix.length === restored.outputRange.end.row - restored.anchor.row + 1 &&
        result.matrix[0]?.length === restored.outputRange.end.column - restored.anchor.column + 1
      ) {
        const evaluator = createWorkbookEvaluator(workbook, reportSheetId);
        const matches = result.matrix.every((row, rowIndex) =>
          row.every(
            (value, column) =>
              JSON.stringify(value === "" ? null : value) ===
              JSON.stringify(
                evaluator.getComputedValue({
                  row: restored.anchor.row + rowIndex,
                  column: restored.anchor.column + column,
                }),
              ),
          ),
        );
        if (matches)
          restored.resultLayout = {
            labelColumns: result.rowLabelColumns,
            dataRows: result.dataRows,
            rowLabels: result.rowLabels,
            headerRows: result.headerRows,
            rowFieldIndices: result.rowFieldIndices,
            valueRows: result.rowMembers.flatMap((members, row) => (members === null ? [] : [row])),
            seriesLabels: result.seriesLabels,
          };
      }
    } catch {
      /* Keep the native report and cache available for a subsequent explicit refresh. */
    }
  }
  return restored;
}
