import type { mapSheetDrawingChartReferences } from "./chart-source-references.js";
import { formControlListRange } from "./form-controls.js";
import type { SheetDrawing } from "./sheet-drawings.js";

export function mapSheetFormControlReferences(
  drawings: readonly SheetDrawing[] | undefined,
  mapCell: Parameters<typeof mapSheetDrawingChartReferences>[1],
  mapRange: Parameters<typeof mapSheetDrawingChartReferences>[2],
) {
  return (drawings ?? []).map((drawing) => {
    if (drawing.kind !== "control") return drawing;
    const { linkedSheetId, sourceSheetId } = drawing.control;
    if (!linkedSheetId && !sourceSheetId) return drawing;
    const control = { ...drawing.control };
    if (linkedSheetId) {
      const link = mapCell({ sheetId: linkedSheetId, cell: control.linkedCell });
      control.linkedSheetId = link.sheetId;
      control.linkedCell = link.cell;
    }
    if (sourceSheetId) {
      const source = mapRange({ sheetId: sourceSheetId, range: control.source });
      control.sourceSheetId = source.sheetId;
      control.source = formControlListRange(source.range);
    }
    return { ...drawing, control };
  });
}
