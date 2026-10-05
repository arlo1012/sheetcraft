import type { ReviewTextCell } from "../../shared/workbook-text-edits";
export {
  collectReviewText,
  createReviewTextCommand,
  type ReviewTextCell,
} from "../../shared/workbook-text-edits";
export type TextReviewScope = "selection" | "sheet" | "workbook";
export type TextReviewMode = "spelling" | "to-simplified" | "to-traditional";
export type SpellingLanguage = "en-US" | "en-GB";
export type TextReviewIssue = {
  cell: number;
  start: number;
  end: number;
  word: string;
  suggestions: string[];
};
export type TextConversion = { cell: number; text: string };
export type TextReviewResult = {
  issues: TextReviewIssue[];
  conversions: TextConversion[];
  truncated: boolean;
};
export type TextReviewRequest = {
  cells: ReviewTextCell[];
  mode: TextReviewMode;
  language: SpellingLanguage;
  ignored: string[];
};

export function replaceSpellingIssues(
  cells: readonly ReviewTextCell[],
  issues: readonly TextReviewIssue[],
  replacement: string,
): TextConversion[] {
  const byCell = new Map<number, TextReviewIssue[]>();
  for (const issue of issues) byCell.set(issue.cell, [...(byCell.get(issue.cell) ?? []), issue]);
  return [...byCell].map(([cell, entries]) => {
    let text = cells[cell]!.text;
    for (const issue of entries.sort((a, b) => b.start - a.start))
      text = text.slice(0, issue.start) + replacement + text.slice(issue.end);
    return { cell, text };
  });
}
