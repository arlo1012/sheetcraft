import coverage from "./assets/font-coverage.json";
import {
  MANAGED_CELL_FONTS,
  type ManagedCellFontId,
} from "../../../shared/cell-text/managed-fonts";
import type { FontCoverageRange } from "./unicode-catalog";

export type SymbolFont = Readonly<{
  id: string;
  family: string;
  source: "bundled" | "local";
  ranges: readonly FontCoverageRange[];
  sha256?: string;
}>;

export const BUNDLED_SYMBOL_FONTS: readonly SymbolFont[] = MANAGED_CELL_FONTS.map((font) => {
  const entry = coverage.find((item) => item.id === font.id);
  if (!entry || entry.family !== font.family) throw new Error(`Missing font coverage: ${font.id}`);
  return {
    id: font.id as ManagedCellFontId,
    family: font.family,
    source: "bundled",
    ranges: entry.ranges as Array<[number, number]>,
    sha256: entry.sha256,
  };
});
