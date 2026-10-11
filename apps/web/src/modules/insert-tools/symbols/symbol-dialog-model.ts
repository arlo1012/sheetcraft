import { parseSymbolCharacterCode, type SymbolUnicodeCatalog } from "./unicode-catalog";
import { symbolUnicodeBlockLabel } from "./unicode-block-labels.zh-CN";
export type SymbolCodeFormat = "unicode-hex" | "latin1-decimal" | "latin1-hex";
export const SPECIAL_SYMBOLS = [
  { text: "—", label: "emDash" },
  { text: "–", label: "enDash" },
  { text: "\u3000", label: "ideographicSpace", referenceMismatch: true },
  { text: " ", label: "space", referenceMismatch: true },
  { text: "\u00A0", label: "noBreakSpace" },
  { text: "©", label: "copyright" },
  { text: "®", label: "registered" },
  { text: "™", label: "trademark" },
  { text: "§", label: "section" },
  { text: "¶", label: "paragraph" },
  { text: "…", label: "ellipsis" },
  { text: "‘", label: "leftSingleQuote" },
  { text: "’", label: "rightSingleQuote" },
  { text: "“", label: "leftDoubleQuote" },
  { text: "”", label: "rightDoubleQuote" },
  { text: "\u2003", label: "emSpace" },
  { text: "\u2002", label: "enSpace" },
] as const;
export function parseDialogCode(input: string, format: SymbolCodeFormat): number | undefined {
  const value = parseSymbolCharacterCode(input, format === "latin1-decimal" ? "decimal" : "hex");
  return value !== undefined && (format === "unicode-hex" || value <= 255) ? value : undefined;
}
export function filterSymbolPoints(
  catalog: SymbolUnicodeCatalog,
  points: Uint32Array,
  query: string,
  format: SymbolCodeFormat,
  locale = "en-US",
): Uint32Array {
  const normalized = query.trim();
  const normalizedUpper = normalized.toLocaleUpperCase("en-US");
  const decimal = /^\d+$/.test(normalized) ? Number(normalized) : undefined;
  // Resolve translated block names once per query, rather than per character.
  // Official names, aliases, characters, categories and codes still match below.
  const localizedBlocks =
    normalized && /^zh(?:-|$)/i.test(locale)
      ? catalog.blocks.filter(([, , name]) =>
          symbolUnicodeBlockLabel(name, locale)
            .toLocaleUpperCase("en-US")
            .includes(normalizedUpper),
        )
      : [];
  return points.filter(
    (cp) =>
      (format === "unicode-hex" || cp <= 255) &&
      (!normalized ||
        cp === decimal ||
        catalog.category(cp).toUpperCase() === normalized.toUpperCase() ||
        localizedBlocks.some(([start, end]) => cp >= start && cp <= end) ||
        catalog.matches(cp, normalized)),
  );
}
export function navigateSymbolGrid(
  index: number,
  count: number,
  columns: number,
  rows: number,
  key: string,
  whole: boolean,
): number {
  if (!count) return -1;
  const current = Math.max(0, index);
  let next = current;
  if (key === "ArrowRight") next++;
  else if (key === "ArrowLeft") next--;
  else if (key === "ArrowDown") next += columns;
  else if (key === "ArrowUp") next -= columns;
  else if (key === "PageDown") next += columns * rows;
  else if (key === "PageUp") next -= columns * rows;
  else if (key === "Home") next = whole ? 0 : Math.floor(current / columns) * columns;
  else if (key === "End")
    next = whole ? count - 1 : Math.floor(current / columns) * columns + columns - 1;
  return Math.max(0, Math.min(count - 1, next));
}
