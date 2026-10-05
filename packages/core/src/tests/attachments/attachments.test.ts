import { describe, expect, test } from "vitest";
import { normalizeSheetAttachment, MAX_ATTACHMENT_BYTES } from "../../sheet-attachments.js";
import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetAttachmentDrawing,
} from "../../sheet-drawings.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { getActiveSheet } from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(): SheetAttachmentDrawing {
  return {
    id: "attachment",
    kind: "attachment",
    name: "Report",
    anchor: { row: 1, column: 1 },
    offsetX: 0,
    offsetY: 0,
    width: 220,
    height: 80,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    attachment: {
      filename: "report.txt",
      mimeType: "text/plain",
      size: 3,
      data: "YWJj",
      display: "icon",
    },
  };
}
describe("embedded attachments", () => {
  test.each([
    { filename: "" },
    { filename: "../report.txt" },
    { filename: "a\\b.txt" },
    { filename: "a\n.txt" },
    { filename: "a".repeat(256) },
    { mimeType: "text" },
    { mimeType: "text/plain; charset=utf-8" },
    { size: -1 },
    { size: 1.5 },
    { size: MAX_ATTACHMENT_BYTES + 1 },
    { size: 2 },
    { data: "a*bc" },
    { data: "YWJ=" },
    { data: "YWJj====" },
    { display: "other" },
  ])("rejects malformed attachment fields", (patch) => {
    expect(() =>
      normalizeSheetAttachment({
        ...drawing().attachment,
        ...patch,
      } as SheetAttachmentDrawing["attachment"]),
    ).toThrow();
  });
  test.each([
    { size: 0, data: "" },
    { size: 1, data: "YQ==" },
    { size: 2, data: "YWI=" },
    { size: 3, data: "YWJj" },
  ])("accepts base64 padding for $size bytes", (bytes) => {
    expect(
      normalizeSheetAttachment({ ...drawing().attachment, ...bytes, display: "document" }),
    ).toMatchObject(bytes);
  });
  test("clones attachment payloads and anchors", () => {
    const source = drawing();
    const clone = normalizeSheetDrawing(source) as SheetAttachmentDrawing;
    clone.attachment.filename = "other.txt";
    clone.anchor.row = 5;
    expect(source.attachment.filename).toBe("report.txt");
    expect(source.anchor.row).toBe(1);
  });
  test("enforces the aggregate sheet attachment byte limit", () => {
    const size = MAX_ATTACHMENT_BYTES;
    const data = "A".repeat(Math.ceil(size / 3) * 4 - 2) + "==";
    const entries = Array.from({ length: 6 }, (_, i) => ({
      ...drawing(),
      id: `file-${i}`,
      attachment: { ...drawing().attachment, size, data },
    }));
    expect(normalizeSheetDrawings(entries.slice(0, 5))).toHaveLength(5);
    expect(() => normalizeSheetDrawings(entries)).toThrow("sheet limit");
  });
  test("inserts attachment bytes atomically and restores them through undo/redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, [drawing()]));
    expect(sheet.drawings).toEqual([drawing()]);
    undoWorkbookCommand(session);
    expect(sheet.drawings).toEqual([]);
    redoWorkbookCommand(session);
    expect(sheet.drawings).toEqual([drawing()]);
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(33);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 28 })).toThrow();
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
  });
});
