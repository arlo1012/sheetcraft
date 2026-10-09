import type { SplitColumnSuggestion, SplitTextOptions } from "@sheetcraft/core/commands";
import type { TextToColumnsDraft } from "./data-tools-types";

/** Resolve automatic recommendations once, then use the same rule for every row. */
export function resolveTextToColumnsOptions(
  draft: TextToColumnsDraft,
  suggestions: readonly SplitColumnSuggestion[],
): SplitTextOptions | undefined {
  switch (draft.mode) {
    case "auto":
      return (
        draft.autoSuggestionId
          ? suggestions.find((suggestion) => suggestion.id === draft.autoSuggestionId)
          : suggestions[0]
      )?.options;
    case "delimiter": {
      const custom =
        draft.otherDelimiterMode === "token"
          ? [draft.otherDelimiter]
          : Array.from(draft.otherDelimiter.replace(/\r\n?/gu, "\n"));
      return {
        mode: "delimiter",
        delimiters: [...new Set([...draft.delimiters, ...custom].filter(Boolean))],
        textQualifier: draft.textQualifier ?? '"',
        mergeDelimiters: draft.mergeDelimiters ?? false,
      };
    }
    case "fixed-width":
      return { mode: "fixedWidth", fixedWidths: [...draft.fixedWidths] };
    case "text-type":
      return { mode: "textType", textTypes: [...(draft.textTypes ?? [])] };
    case "keyword":
      return {
        mode: "keyword",
        keywords: [...(draft.keywords ?? [])].filter((keyword) => keyword.trim().length > 0),
        keywordPosition: draft.keywordPosition ?? "after",
        keepKeywords: draft.keepKeywords ?? true,
      };
  }
}
