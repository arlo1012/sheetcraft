import { normalizePivotTable, type SheetPivotTable } from "@idea10/core/pivot-tables";
import type { Workbook } from "@idea10/core/workbook";
import type { PivotDraft } from "./usePivotActions";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";

type PivotSourceDefinition = Pick<SheetPivotTable, "sourceSheetId" | "source" | "consolidation">;

/** Resolve at confirmation time so deleted reports and stale sheet references cannot be used. */
export function resolvePivotDraftSource(
  workbook: Workbook,
  draft: PivotDraft,
): PivotSourceDefinition {
  if (draft.mode === "move") {
    const table = normalizePivotTable(draft.table);
    return {
      sourceSheetId: table.sourceSheetId,
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
      source: table.source,
      consolidation: table.consolidation,
    };
  }
  if (draft.sourceKind === "consolidation") {
    if (!draft.sources.length) throw new RangeError("Select consolidation ranges.");
    const ranges = draft.sources.map((reference) => {
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
      return { sheetId: area.sheetId, range: area.range, label };
    });
    return {
      sourceSheetId: ranges[0]!.sheetId,
      source: ranges[0]!.range,
      consolidation: { ranges, labels: [...draft.consolidationLabels] },
    };
  }
  const area = resolveRangeReference(workbook, draft.source, draft.referenceSheetId);
  if (!area) throw new RangeError("Invalid pivot source.");
  return { sourceSheetId: area.sheetId, source: area.range, consolidation: undefined };
}
