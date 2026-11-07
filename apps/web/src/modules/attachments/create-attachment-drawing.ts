import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import type { CellAddress } from "@sheetcraft/core/workbook";

export function createAttachmentDrawing(
  id: string,
  anchor: CellAddress,
  attachment: SheetAttachment,
): SheetAttachmentDrawing {
  const document = attachment.display === "document";
  return {
    id,
    kind: "attachment",
    name: attachment.filename,
    anchor: { ...anchor },
    offsetX: 8,
    offsetY: 8,
    width: document ? 360 : 220,
    height: document ? 240 : 80,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#d1d5db",
    strokeWidth: 1,
    color: "#111827",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    attachment,
  };
}
