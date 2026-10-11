export type LocalSymbolFontErrorCode =
  | "unsupported"
  | "gesture-required"
  | "denied"
  | "cancelled"
  | "invalid-choice"
  | "file-read"
  | "size"
  | "container"
  | "name"
  | "cmap"
  | "malformed"
  | "font-load"
  | "hash-unavailable"
  | "storage-unavailable"
  | "storage-quota"
  | "storage-limit"
  | "storage-corrupt";

const messages: Record<LocalSymbolFontErrorCode, string> = {
  unsupported: "This browser does not support local font access.",
  "gesture-required": "Choose local fonts using the button first.",
  denied: "Local font access was denied or blocked by this browser.",
  cancelled: "Local font selection was cancelled.",
  "invalid-choice": "This font is no longer an available local font choice.",
  "file-read": "The selected font file could not be read.",
  size: "Choose a nonempty font file no larger than 64 MiB.",
  container: "Only standalone TrueType and OpenType font files are supported.",
  name: "The font does not contain a supported, valid family name.",
  cmap: "The font does not contain a supported Unicode character map.",
  malformed: "The font contains invalid or truncated font data.",
  "font-load": "This browser could not load the selected font.",
  "hash-unavailable": "This browser cannot securely identify local font files.",
  "storage-unavailable": "Local font storage is unavailable on this browser.",
  "storage-quota": "There is not enough browser storage to remember this font.",
  "storage-limit": "Local font storage is limited to 12 fonts and 128 MiB in total.",
  "storage-corrupt": "A remembered local font is invalid or has changed.",
};

export class LocalSymbolFontError extends Error {
  readonly code: LocalSymbolFontErrorCode;

  constructor(code: LocalSymbolFontErrorCode) {
    super(messages[code]);
    this.name = "LocalSymbolFontError";
    this.code = code;
  }
}

export const LOCAL_FONT_MAX_BYTES = 64 * 1024 * 1024;

export function localFontFailure(
  error: unknown,
  fallback: LocalSymbolFontErrorCode,
): LocalSymbolFontError {
  if (error instanceof LocalSymbolFontError) return error;
  const name = error && typeof error === "object" && "name" in error ? error.name : undefined;
  if (name === "AbortError") return new LocalSymbolFontError("cancelled");
  if (name === "NotAllowedError" || name === "SecurityError")
    return new LocalSymbolFontError("denied");
  if (name === "QuotaExceededError") return new LocalSymbolFontError("storage-quota");
  return new LocalSymbolFontError(fallback);
}
