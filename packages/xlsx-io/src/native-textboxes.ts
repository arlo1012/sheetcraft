import { hasShapeObjectFrame } from "@sheetcraft/core/sheet-drawings";
import type { Workbook } from "@sheetcraft/core/workbook";
import { appendNativeDrawingAnchor, ensureNativeDrawingPart } from "./drawing-parts.js";
import { assertSupportedNativeTextBox } from "./textbox-capabilities.js";
import type { CompatibilityReportBuilder } from "./report.js";
import { assertFreshTextBoxProfile } from "./native/textbox-export-profile.js";
import { nativeTextBoxAnchorXml } from "./native/writer-textboxes.js";

/** Only canonical textboxes proved by the adapter participate; legacy omission stays explicit. */
export function writeXlsxTextBoxes(
  entries: Record<string, Uint8Array>,
  workbook: Workbook,
  options?: { freshExport: true; report?: CompatibilityReportBuilder },
): void {
  if (
    options &&
    [...workbook.sheets.values()].some((sheet) =>
      sheet.drawings?.some((drawing) => drawing.kind === "textBox" && hasShapeObjectFrame(drawing)),
    )
  )
    assertFreshTextBoxProfile(entries);
  for (const [index, sheet] of [...workbook.sheets.values()].entries()) {
    for (const drawing of sheet.drawings ?? []) {
      if (drawing.kind !== "textBox" || !hasShapeObjectFrame(drawing)) continue;
      assertSupportedNativeTextBox(
        drawing,
        sheet,
        `${sheet.name}.drawings[${JSON.stringify(drawing.id)}]`,
      );
      const { part, objectId } = ensureNativeDrawingPart(
        entries,
        `xl/worksheets/sheet${index + 1}.xml`,
      );
      appendNativeDrawingAnchor(
        entries,
        part,
        nativeTextBoxAnchorXml(
          drawing,
          sheet,
          objectId,
          options ? "excel-horizontal-editable" : undefined,
        ),
        drawing.id,
      );
      if (options && drawing.shapeText!.layout.lineOrder === "rtl")
        options.report?.add(
          "textbox-layout-normalized",
          "warning",
          `${sheet.name}.drawings[${JSON.stringify(drawing.id)}].shapeText.layout.lineOrder`,
        );
    }
  }
}
