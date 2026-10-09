import { expect, test, vi } from "vitest";
import { createAutoRowHeightCalculator } from "../../row-height.js";
import type { Cell } from "@sheetcraft/core/workbook";

test("an image replaces wrapped text without retaining text-derived row height", () => {
  const calculator = createAutoRowHeightCalculator({ measure: (text) => text.length * 10 });
  const cells = new Map<string, Cell>([
    [
      "0:0",
      {
        content: { kind: "literal", value: "a very long wrapped text line" },
        style: { wrapText: true },
      },
    ],
  ]);
  const getComputedValue = vi.fn(() => "a very long wrapped text line");
  const input = {
    cells,
    getComputedValue,
    columnWidths: new Map([[0, 30]]),
    rowCount: 5,
    columnCount: 5,
  };
  expect(calculator.reconcile(input).get(0)).toBeGreaterThan(24);
  cells.set("0:0", {
    content: { kind: "image", image: { assetId: "asset", altText: "" } },
    style: { wrapText: true },
  });
  expect(calculator.reconcile(input).size).toBe(0);
  expect(getComputedValue).toHaveBeenCalledTimes(1);
});
