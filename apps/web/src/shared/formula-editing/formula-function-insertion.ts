import {
  applyFunctionCompletion,
  getFormulaCompletionContext,
  getFormulaReferenceEditContext,
} from "./formula-input-lexical";

export type FormulaTextEdit = { value: string; caret: number };

/** Insert at an operand or replace the current function/reference without changing its suffix. */
export function insertFormulaFunction(
  value: string,
  selection: { start: number; end: number },
  functionName: string,
): FormulaTextEdit | null {
  const completion = getFormulaCompletionContext(value, selection.start, selection.end);
  if (completion) return applyFunctionCompletion(value, completion, functionName);
  const reference = getFormulaReferenceEditContext(value, selection.start, selection.end);
  if (!reference) return null;
  const insertion = `${functionName}(`;
  return {
    value: value.slice(0, reference.replaceStart) + insertion + value.slice(reference.replaceEnd),
    caret: reference.replaceStart + insertion.length,
  };
}
