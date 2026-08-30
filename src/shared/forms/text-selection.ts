export type TextSelectionInsertion = {
  value: string;
  caret: number;
};

export function insertTextAtSelection(
  value: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  insertion: string,
): TextSelectionInsertion {
  const start = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
  return {
    value: `${value.slice(0, start)}${insertion}${value.slice(end)}`,
    caret: start + insertion.length,
  };
}
