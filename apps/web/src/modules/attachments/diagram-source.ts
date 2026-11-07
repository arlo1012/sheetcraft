import { normalizeSheetAttachment, type SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import { decodeAttachmentBytes, encodeAttachmentBytes } from "./attachment-file";

export const MAX_DIAGRAM_SOURCE_BYTES = 1024 * 1024;
export function encodeDiagramSource(
  document: { title: string },
  mimeType: string,
  suffix: string,
): SheetAttachment {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  if (bytes.length > MAX_DIAGRAM_SOURCE_BYTES) throw new RangeError("Diagram file is too large.");
  const name = Array.from(document.title, (char) =>
    char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char,
  ).join("");
  return {
    filename: name + suffix,
    mimeType,
    size: bytes.length,
    data: encodeAttachmentBytes(bytes),
    display: "document",
  };
}
export function decodeDiagramSource<T>(
  attachment: SheetAttachment,
  mimeType: string,
  parse: (source: unknown) => T,
): T | undefined {
  if (
    attachment.mimeType !== mimeType ||
    attachment.size > MAX_DIAGRAM_SOURCE_BYTES ||
    attachment.data.length > Math.ceil(MAX_DIAGRAM_SOURCE_BYTES / 3) * 4
  )
    return;
  try {
    normalizeSheetAttachment(attachment);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      decodeAttachmentBytes(attachment.data),
    );
    return parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}
