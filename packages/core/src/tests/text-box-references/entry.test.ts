import { expect, test, vi } from "vitest";

/** These are real entry graphs, with no mocked normalizers or artificial module initialization. */
test("public drawing/workbook/reference entry orders initialize the bounded reference model", async () => {
  for (const order of [
    ["workbook", "sheet-drawings", "text-box-reference"],
    ["text-box-reference", "sheet-drawings", "workbook"],
    ["serialization", "text-box-reference", "index"],
  ]) {
    vi.resetModules();
    for (const entry of order) {
      if (entry === "workbook") await import("../../workbook.js");
      else if (entry === "sheet-drawings") await import("../../sheet-drawings.js");
      else if (entry === "text-box-reference") await import("../../text-box-reference.js");
      else if (entry === "serialization") await import("../../serialization.js");
      else await import("../../index.js");
    }
    const { linkedBox } = await import("./fixtures.js");
    const { normalizeSheetDrawing } = await import("../../sheet-drawings.js");
    const { mapSheetDrawingTextReferences } = await import("../../text-box-reference.js");
    const { createWorkbook, getActiveSheet } = await import("../../workbook.js");
    const { serializeWorkbook, deserializeWorkbook } = await import("../../serialization.js");
    const drawing = normalizeSheetDrawing(linkedBox());
    const workbook = createWorkbook({ id: "entry", sheetId: "owner" });
    getActiveSheet(workbook).drawings = mapSheetDrawingTextReferences(
      [drawing],
      (reference) => reference,
    );
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(74);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
  }
});
