import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("chart presentation export safety gate", () => {
  test.each([{ background: "#202020" }, { lineMarkers: true }])(
    "blocks presentation presence %j before resource reads",
    async (presentation) => {
      const f = nativeColumnFixture();
      if ("lineMarkers" in presentation) f.drawing.chart.type = "line";
      f.drawing.chart.presentation = presentation;
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
              locations: [
                `Data.drawings["column-chart"].chart.presentation.${"background" in presentation ? "background" : "lineMarkers"}`,
              ],
            },
          ],
        },
      });
      expect(images).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("blocks an own presentation getter without reading it", async () => {
    const f = nativeColumnFixture(),
      getter = vi.fn(() => {
        throw Error("unexpected presentation read");
      });
    Object.defineProperty(f.drawing.chart, "presentation", { get: getter });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(getter).not.toHaveBeenCalled();
  });

  test.each(["column", "bar", "line", "area"] as const)(
    "blocks unsupported %s stacks instead of omitting a whole chart",
    async (type) => {
      const f = nativeColumnFixture();
      f.drawing.chart.type = type;
      f.drawing.chart.stacked = true;
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
              locations: ['Data.drawings["column-chart"].chart.stacked'],
            },
          ],
        },
      });
      expect(images).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
});
