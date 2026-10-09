import { validateCellNumberFormatCode } from "@sheetcraft/core/number-format";

const STORAGE_KEY = "sheetcraft.custom-number-formats";
const MAX_CUSTOM_FORMATS = 100;

export function readCustomNumberFormats(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      !stored ||
      typeof stored !== "object" ||
      !("version" in stored) ||
      stored.version !== 1 ||
      !("codes" in stored) ||
      !Array.isArray(stored.codes)
    )
      return [];
    return [
      ...new Set(
        stored.codes.filter(
          (code): code is string => typeof code === "string" && validateCellNumberFormatCode(code),
        ),
      ),
    ].slice(0, MAX_CUSTOM_FORMATS);
  } catch {
    return [];
  }
}

function writeCustomNumberFormats(codes: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, codes }));
  } catch {
    // A format still applies to the document when browser preferences cannot be saved.
  }
}

export function rememberCustomNumberFormat(code: string): void {
  if (!validateCellNumberFormatCode(code)) return;
  writeCustomNumberFormats(
    [code, ...readCustomNumberFormats().filter((item) => item !== code)].slice(
      0,
      MAX_CUSTOM_FORMATS,
    ),
  );
}

export function removeCustomNumberFormat(code: string): string[] {
  const codes = readCustomNumberFormats().filter((item) => item !== code);
  writeCustomNumberFormats(codes);
  return codes;
}
