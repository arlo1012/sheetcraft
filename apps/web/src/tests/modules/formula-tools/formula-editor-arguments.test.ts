import { describe, expect, test } from "vitest";
import {
  appendFormulaEditorArgument,
  getFormulaEditorRootCall,
  replaceFormulaEditorArgument,
} from "../../../modules/formula-tools/formula-editor-arguments";

describe("formula editor root arguments", () => {
  test("keeps quoted commas, nested calls, and array constants inside their argument", () => {
    const formula = '=IF("a,b",SUM(A1,A2),{1,2;3,4})';
    const call = getFormulaEditorRootCall(formula);
    expect(call).toMatchObject({ name: "IF" });
    expect(call?.arguments.map((argument) => argument.value)).toEqual([
      '"a,b"',
      "SUM(A1,A2)",
      "{1,2;3,4}",
    ]);
  });

  test("only rewrites a complete root argument and preserves surrounding whitespace", () => {
    const formula = "=ROUND( A1 + 1 , 2 )";
    const call = getFormulaEditorRootCall(formula);
    expect(call).not.toBeNull();
    expect(replaceFormulaEditorArgument(formula, call!.arguments[1]!, "3")).toBe(
      "=ROUND( A1 + 1 , 3 )",
    );
    expect(
      appendFormulaEditorArgument("=IF(A1,1)", getFormulaEditorRootCall("=IF(A1,1)")!, "0"),
    ).toBe("=IF(A1,1,0)");
  });

  test("rejects incomplete, malformed, and suffixed root calls", () => {
    expect(getFormulaEditorRootCall("=IF(A1,")).toBeNull();
    expect(getFormulaEditorRootCall("=IF(A1,,0)")).toBeNull();
    expect(getFormulaEditorRootCall("=SUM(A1)+1")).toBeNull();
    expect(getFormulaEditorRootCall("=SUM({1,2)")).toBeNull();
  });
});
