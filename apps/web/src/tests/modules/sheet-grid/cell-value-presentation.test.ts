import { describe, expect, test } from "vitest";
import { formatCellValueForGrid } from "../../../modules/sheet-grid/cell-value-presentation";

describe("cell value presentation", () => {
  test("uses stored numeric formats with the current display locale", () => {
    expect(
      formatCellValueForGrid(
        1234.5,
        { numberFormat: { kind: "number", fractionDigits: 2 } },
        "en-US",
      ),
    ).toBe(
      new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        1234.5,
      ),
    );
    expect(
      formatCellValueForGrid(
        0.125,
        { numberFormat: { kind: "percent", fractionDigits: 1 } },
        "zh-CN",
      ),
    ).toBe(
      new Intl.NumberFormat("zh-CN", {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(0.125),
    );
    expect(
      formatCellValueForGrid(
        12,
        { numberFormat: { kind: "currency", currency: "CNY", fractionDigits: 2 } },
        "en-US",
      ),
    ).toBe(
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(12),
    );
  });

  test("preserves General and non-numeric raw display semantics", () => {
    expect(formatCellValueForGrid(12.5, undefined, "zh-CN")).toBe("12.5");
    expect(
      formatCellValueForGrid(-0, { numberFormat: { kind: "number", fractionDigits: 0 } }, "en-US"),
    ).toBe("0");
    expect(
      formatCellValueForGrid(
        "0012",
        { numberFormat: { kind: "number", fractionDigits: 2 } },
        "en-US",
      ),
    ).toBe("0012");
    expect(
      formatCellValueForGrid(
        true,
        { numberFormat: { kind: "percent", fractionDigits: 0 } },
        "en-US",
      ),
    ).toBe("TRUE");
  });
});
