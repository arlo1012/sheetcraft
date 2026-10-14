import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("detailed chart format export safety gate", () => {
  test.each([
    {},
    { title: { color: "#ff0000" } },
    { valueAxis: { min: 20, max: 180, majorUnit: 40 } },
    { bar: { gapWidth: 50, overlap: 50 } },
  ] as const)(
    "blocks new format presence %j before resource reads with no workbook changes",
    async (format) => {
      const f = nativeColumnFixture();
      f.drawing.chart.format = format;
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
              locations: ['Data.drawings["column-chart"].chart.format'],
            },
          ],
        },
      });
      expect(images).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("blocks an own settings getter without invoking it", async () => {
    const f = nativeColumnFixture(),
      getter = vi.fn(() => {
        throw Error("unexpected read");
      });
    Object.defineProperty(f.drawing.chart, "format", { get: getter });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });
});
