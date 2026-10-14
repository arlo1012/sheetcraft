import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("chart element placement export safety gate", () => {
  test.each([
    {},
    { titlePosition: "overlay" },
    { legendPosition: "left" },
    { labelPosition: "outsideEnd" },
  ] as const)(
    "blocks new element presence %j before resource reads with no workbook changes",
    async (elements) => {
      const f = nativeColumnFixture();
      f.drawing.chart.elements = elements;
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
              locations: ['Data.drawings["column-chart"].chart.elements'],
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
    Object.defineProperty(f.drawing.chart, "elements", { get: getter });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });
});
