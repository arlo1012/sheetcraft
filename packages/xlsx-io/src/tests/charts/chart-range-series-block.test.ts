import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("ordinary series identity native export safety", () => {
  test("metadata alone blocks before resources without losing internal identity", async () => {
    const f = nativeColumnFixture();
    f.drawing.chart.rectangleSeries = { rows: [], columns: [{ index: 1, id: "range-series-1" }] };
    const before = serializeWorkbook(f.workbook),
      images = vi.fn(() => []);
    await expect(
      encodeXlsx(f.workbook, {
        get images() {
          return images();
        },
      }),
    ).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: ['Data.drawings["column-chart"].chart.rectangleSeries'],
          },
        ],
      },
    });
    expect(images).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("own metadata accessor is blocked without invocation", async () => {
    const f = nativeColumnFixture(),
      getter = vi.fn(() => {
        throw new Error("unexpected access");
      });
    Object.defineProperty(f.drawing.chart, "rectangleSeries", { get: getter });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });
});
