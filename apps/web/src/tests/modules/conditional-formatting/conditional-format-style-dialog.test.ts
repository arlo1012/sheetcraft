import { describe, expect, test } from "vitest";
import {
  conditionalStyleToSelectionState,
  mergeConditionalStyleChange,
} from "../../../modules/conditional-formatting/conditional-format-style-dialog";

describe("conditional-format differential style conversion", () => {
  test("preserves omitted attributes and represents explicit clears as false", () => {
    const result = mergeConditionalStyleChange(
      { fillColor: "#FDE2E1", textColor: "#9C0006" },
      { bold: true, fillColor: null },
      undefined,
    );
    expect(result).toMatchObject({
      fillColor: false,
      textColor: "#9C0006",
      bold: true,
    });
    expect("horizontalAlign" in result).toBe(false);
  });

  test("maps a cleared border edge to the differential false sentinel", () => {
    const result = mergeConditionalStyleChange(
      { borderLeft: { style: "thin", color: "#20242C" } },
      undefined,
      [{ preset: "left", border: null }],
    );
    expect(result.borderLeft).toBe(false);
  });
});

test("updates only already-overridden border edges when changing the brush", () => {
  const result = mergeConditionalStyleChange(
    { borderTop: { style: "thin", color: "#20242C" } },
    undefined,
    undefined,
    { style: "double", color: "#FF0000" },
  );
  expect(result.borderTop).toEqual({ style: "double", color: "#FF0000" });
  expect(result.borderLeft).toBeUndefined();
});

test("keeps the exact double underline variant in the reusable font panel state", () => {
  const state = conditionalStyleToSelectionState({ underline: "double" });
  expect(state.underline).toBe("on");
  expect(state.underlineStyle).toEqual({ value: "double", mixed: false });
});
