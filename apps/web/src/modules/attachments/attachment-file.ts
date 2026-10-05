import {
  normalizeSheetAttachment,
  MAX_ATTACHMENT_BYTES,
  type SheetAttachment,
} from "@idea10/core/sheet-attachments";
export async function prepareAttachment(
  file: File,
  display: SheetAttachment["display"],
): Promise<SheetAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new RangeError("Attachment is too large.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw = "";
  for (let i = 0; i < bytes.length; i += 16384)
    raw += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return normalizeSheetAttachment({
    filename: file.name.replaceAll(/[\\/]/g, "_").slice(0, 255),
    mimeType:
      file.type && /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream",
    size: bytes.length,
    data: btoa(raw),
    display,
  });
}
export function attachmentBlob(attachment: SheetAttachment): Blob {
  const value = normalizeSheetAttachment(attachment);
  const raw = atob(value.data);
  return new Blob([Uint8Array.from(raw, (char) => char.charCodeAt(0))], { type: value.mimeType });
}
export function attachmentText(attachment: SheetAttachment): string | undefined {
  if (
    !(
      attachment.mimeType.startsWith("text/") ||
      /\.(txt|csv|md|json|log|xml)$/i.test(attachment.filename)
    )
  )
    return undefined;
  const raw = atob(attachment.data.slice(0, 160000));
  return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
}
