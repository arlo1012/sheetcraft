import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx } from "../../index.js";
import { nativeColumnFixture } from "./native-column-fixture.js";

describe("combo native export safety gate", () => {
  test.each(["combo", "dormant"] as const)(
    "blocks %s before image resources and preserves the workbook",
    async (mode) => {
      const f = nativeColumnFixture(),
        images = vi.fn(() => []);
      if (mode === "combo") f.drawing.chart.type = "combo";
      else f.drawing.chart.format = { series: [{ id: "dormant", drawType: "line" }] };
      const before = serializeWorkbook(f.workbook);
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
              locations: [
                `Data.drawings["column-chart"].chart.${mode === "combo" ? "type" : "format.series"}`,
              ],
            },
          ],
        },
      });
      expect(images).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
  test.each(["combo", "dormant"] as const)(
    "raw %s gate precedes unrelated stacked accessors",
    async (mode) => {
      const f = nativeColumnFixture(),
        getter = vi.fn(() => {
          throw Error("unrelated read");
        });
      if (mode === "combo") f.drawing.chart.type = "combo";
      else f.drawing.chart.format = { series: [{ id: "dormant", drawType: "line" }] };
      Object.defineProperty(f.drawing.chart, "stacked", { get: getter });
      await expect(encodeXlsx(f.workbook)).rejects.toMatchObject({
        name: "XlsxCompatibilityError",
      });
      expect(getter).not.toHaveBeenCalled();
    },
  );
});
