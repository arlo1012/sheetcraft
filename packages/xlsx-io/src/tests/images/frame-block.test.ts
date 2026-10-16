import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { encodeXlsx } from "../../index.js";
import { createXlsxImageExporter } from "../../image-export.js";
import { XlsxCompatibilityError } from "../../types.js";
function picture(): FramedFloatingImage {
  return {
    id: "frame",
    assetId: "missing-source",
    altText: "Synthetic",
    hidden: true,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 194, y: 74, size: { width: 120, height: 80 } },
      angleDeg: 37,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}
describe("unsupported frame-aware native export safety", () => {
  test("even hidden frames block before missing-resource handling and keep the source workbook unchanged", async () => {
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
    const sheet = getActiveSheet(workbook);
    sheet.floatingImages = [picture()];
    const before = serializeWorkbook(workbook);
    await expect(encodeXlsx(workbook)).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: ['Synthetic.floatingImages["frame"].frame'],
          },
        ],
      },
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("the direct image exporter rejects a frame before asset registration or drawing mutation", () => {
    const target = { addImage: vi.fn(() => 1) },
      output = { addImage: vi.fn() };
    const sheet = getActiveSheet(createWorkbook({ id: "w", sheetId: "s" }));
    let failure: unknown;
    try {
      createXlsxImageExporter(target, undefined).addFloatingImage(
        output,
        sheet,
        picture(),
        "Synthetic!C4",
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(XlsxCompatibilityError);
    expect(failure).toMatchObject({
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: ['Synthetic!C4.floatingImages["frame"].frame'],
          },
        ],
      },
    });
    expect(target.addImage).not.toHaveBeenCalled();
    expect(output.addImage).not.toHaveBeenCalled();
  });
});
