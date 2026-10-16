import { MANAGED_CELL_FONTS } from "../../../shared/cell-text/managed-fonts";

// Browsing state is deliberately separate from the custom/recent insertion payloads.
export const SYMBOL_VIEW_PREFERENCES_KEY = "sheetcraft.symbol-view.v1";
export type SymbolViewPreferences = Readonly<{
  version: 1;
  fontId: string;
  family?: string;
  label?: string;
}>;

export function parseSymbolViewPreferences(raw: string | null): SymbolViewPreferences | undefined {
  if (!raw || raw.length > 2048) return undefined;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.version !== 1 || typeof value.fontId !== "string") return undefined;
    if (
      value.fontId === "normal-text" ||
      MANAGED_CELL_FONTS.some((font) => font.id === value.fontId)
    )
      return { version: 1, fontId: value.fontId };
    const localId = /^local:([a-f0-9]{64})$/.exec(value.fontId)?.[1];
    if (!localId || value.family !== `SheetcraftLocal_${localId}`) return undefined;
    return {
      version: 1,
      fontId: value.fontId,
      family: value.family,
      ...(typeof value.label === "string" && value.label.length > 0 && value.label.length <= 256
        ? { label: value.label }
        : {}),
    };
  } catch {
    return undefined;
  }
}
