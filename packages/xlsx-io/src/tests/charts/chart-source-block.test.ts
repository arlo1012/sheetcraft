import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("independent chart source export safety", () => {
  test.each([true, false])(
    "blocks source presence with empty=%s before resources",
    async (empty) => {
      const f = nativeColumnFixture();
      f.drawing.chart.range = null;
      f.drawing.chart.source = {
        kind: "series",
        categories: { kind: "generated" },
        series: empty
          ? []
          : [
              {
                id: "bonus",
                colorIndex: 2,
                name: { kind: "literal", text: "Bonus" },
                values: { kind: "literal", values: [10, 20, 30] },
              },
            ],
      };
      const before = serializeWorkbook(f.workbook);
      const images = vi.fn(() => []);
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
              locations: ['Data.drawings["column-chart"].chart.source'],
            },
          ],
        },
      });
      expect(images).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test("presence gate never invokes a source accessor", async () => {
    const f = nativeColumnFixture();
    const get = vi.fn(() => {
      throw new Error("Unexpected source read");
    });
    Object.defineProperty(f.drawing.chart, "source", { get });
    await expect(encodeXlsx(f.workbook)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(get).not.toHaveBeenCalled();
  });
});
