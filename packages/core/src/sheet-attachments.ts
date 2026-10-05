/** Portable embedded files; no browser or storage dependencies. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_SHEET_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export type SheetAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  data: string;
  display: "icon" | "document";
};
export function normalizeSheetAttachment(value: SheetAttachment): SheetAttachment {
  if (
    !value ||
    typeof value.filename !== "string" ||
    !value.filename.trim() ||
    value.filename.length > 255 ||
    Array.from(value.filename).some((char) => char.charCodeAt(0) < 32) ||
    /[/\\]/.test(value.filename) ||
    typeof value.mimeType !== "string" ||
    value.mimeType.length > 255 ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(value.mimeType) ||
    !Number.isInteger(value.size) ||
    value.size < 0 ||
    value.size > MAX_ATTACHMENT_BYTES ||
    typeof value.data !== "string" ||
    value.data.length !== Math.ceil(value.size / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data) ||
    (value.data.length
      ? (value.data.length * 3) / 4 -
        (value.data.endsWith("==") ? 2 : value.data.endsWith("=") ? 1 : 0)
      : 0) !== value.size ||
    (value.display !== "icon" && value.display !== "document")
  )
    throw new RangeError("Invalid embedded file.");
  return {
    filename: value.filename,
    mimeType: value.mimeType,
    size: value.size,
    data: value.data,
    display: value.display,
  };
}
