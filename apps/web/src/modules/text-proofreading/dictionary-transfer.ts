import { parseTsvToCellTexts, serializeCellValuesToTsv } from "@idea10/core/clipboard";
import type { DictionaryCategory, WordDictionary, WordRule } from "./proofreading";

export function isSingleWordCategory(category: DictionaryCategory) {
  return category === "accepted" || category === "sensitive" || category === "terms";
}

export function dictionaryEntries(
  dictionary: WordDictionary,
  category: DictionaryCategory,
): WordRule[] {
  return category === "accepted"
    ? dictionary.accepted.map((word) => ({ word, replacement: "" }))
    : dictionary[category].map((row) => ({ ...row }));
}
export function parseDictionaryText(text: string, category: DictionaryCategory): WordRule[] {
  if (text.length > 2_000_000) throw new Error("invalid-import");
  const matrix = parseTsvToCellTexts(text.replace(/^\uFEFF/, ""));
  const maxColumns = isSingleWordCategory(category) ? 1 : 2;
  if (matrix.length > 5000 || matrix.some((row) => row.length > maxColumns))
    throw new Error("invalid-import");
  const rows = matrix
    .map((row) => ({ word: (row[0] ?? "").trim(), replacement: (row[1] ?? "").trim() }))
    .filter((row) => row.word || row.replacement);
  if (!rows.length) throw new Error("invalid-import");
  return rows;
}
export function serializeDictionaryText(
  rows: readonly WordRule[],
  category: DictionaryCategory,
): string {
  return serializeCellValuesToTsv(
    rows.map((row) => (isSingleWordCategory(category) ? [row.word] : [row.word, row.replacement])),
  );
}
export function downloadDictionaryText(
  rows: readonly WordRule[],
  category: DictionaryCategory,
  name: string,
) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", serializeDictionaryText(rows, category)], {
      type: "text/tab-separated-values;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.tsv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
