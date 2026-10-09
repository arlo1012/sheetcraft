import type { SheetPaperSize } from "@sheetcraft/core/page-setup";
import type { MessageKey } from "../../shared/i18n";

export const PAGE_PAPER_LABELS = {
  letter: "pageLayout.paperLetter",
  tabloid: "pageLayout.paperTabloid",
  legal: "pageLayout.paperLegal",
  statement: "pageLayout.paperStatement",
  executive: "pageLayout.paperExecutive",
  a3: "pageLayout.paperA3",
  a4: "pageLayout.paperA4",
  a5: "pageLayout.paperA5",
  "b4-jis": "pageLayout.paperB4Jis",
  "b5-jis": "pageLayout.paperB5Jis",
} satisfies Record<Exclude<SheetPaperSize, "custom">, MessageKey>;
