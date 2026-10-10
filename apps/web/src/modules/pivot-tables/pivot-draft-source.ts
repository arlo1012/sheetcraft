import {
  normalizePivotTable,
  resolvePivotTableSource,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import type { Workbook } from "@sheetcraft/core/workbook";
import type { PivotDraft } from "./usePivotActions";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";

type PivotSourceDefinition = Pick<
  SheetPivotTable,
  "sourceSheetId" | "sourceTableId" | "source" | "consolidation"
>;

/** Resolve at confirmation time so deleted reports and stale sheet references cannot be used. */
export function resolvePivotDraftSource(
  workbook: Workbook,
  draft: PivotDraft,
): PivotSourceDefinition {
  if (draft.mode === "move") {
    const table = normalizePivotTable(draft.table);
    if (table.sourceTableId !== undefined) resolvePivotTableSource(workbook, table);
    return {
      sourceSheetId: table.sourceSheetId,
      sourceTableId: table.sourceTableId,
      source: table.source,
      consolidation: table.consolidation,
    };
  }
  if (draft.sourceKind === "pivot") {
    const selected = draft.sourcePivot;
    const report =
      selected &&
      workbook.sheets
        .get(selected.sheetId)
        ?.pivotTables?.find(
          (table) =>
            table.id === selected.tableId &&
            !(
              draft.existing &&
              selected.sheetId === draft.referenceSheetId &&
              table.id === draft.table.id
            ),
        );
    if (!report) throw new RangeError("Select an existing PivotTable.");
    const table = normalizePivotTable(report);
    return {
      sourceSheetId: table.sourceSheetId,
      // Reusing a report's stored physical source keeps this mode's fixed-range semantics.
      sourceTableId: undefined,
      source: table.source,
      consolidation: table.consolidation,
    };
  }
  if (draft.sourceKind === "consolidation") {
    if (!draft.sources.length) throw new RangeError("Select consolidation ranges.");
    const count = draft.consolidationPageMode === "single" ? 1 : draft.consolidationPageCount;
    const ranges = draft.sources.map((reference, index) => {
      const area = resolveRangeReference(workbook, reference, draft.referenceSheetId);
      if (!area) throw new RangeError("Invalid consolidation range.");
      const previous = draft.table.consolidation?.ranges.find(
        (item) =>
          item.sheetId === area.sheetId &&
          JSON.stringify(item.range) === JSON.stringify(area.range),
      );
      const label =
        previous?.label ??
        formatRangeReference(workbook.sheets.get(area.sheetId)!.name, area.range);
      const pageItems =
        draft.consolidationPageMode === "single"
          ? [`${draft.consolidationItemPrefix}${index + 1}`]
          : (draft.consolidationPageItems[index] ?? []).slice(0, count);
      return { sheetId: area.sheetId, range: area.range, label, pageItems };
    });
    return {
      sourceSheetId: ranges[0]!.sheetId,
      sourceTableId: undefined,
      source: ranges[0]!.range,
      consolidation: {
        ranges,
        labels: draft.consolidationLabels.slice(0, 3 + count),
        pageFields: { mode: draft.consolidationPageMode, count },
      },
    };
  }
  // Structured names are a pivot-only source choice, not a general A1 reference extension.
  const name = draft.source.trim().replace(/^=/, "").toLowerCase();
  const tables = [...workbook.sheets.values()].flatMap((sheet) =>
    (sheet.tables ?? [])
      .filter((table) => table.name.toLowerCase() === name)
      .map((table) => ({ sheet, table })),
  );
  const namedRange = [...workbook.definedNames.values()].some(
    (entry) =>
      entry.name.toLowerCase() === name &&
      (entry.scopeSheetId === undefined || entry.scopeSheetId === draft.referenceSheetId),
  );
  if (tables.length > 1 || (tables.length && namedRange))
    throw new RangeError("Ambiguous pivot source table name.");
  if (tables.length === 1) {
    const { sheet, table } = tables[0]!;
    if (table.headerRow !== true) throw new RangeError("Pivot source table needs headers.");
    return {
      sourceSheetId: sheet.id,
      sourceTableId: table.id,
      source: {
        start: { ...table.range.start },
        end: { ...table.range.end, row: table.range.end.row - Number(table.totalRow) },
      },
      consolidation: undefined,
    };
  }
  const area = resolveRangeReference(workbook, draft.source, draft.referenceSheetId);
  if (!area) throw new RangeError("Invalid pivot source.");
  return {
    sourceSheetId: area.sheetId,
    sourceTableId: undefined,
    source: area.range,
    consolidation: undefined,
  };
}
