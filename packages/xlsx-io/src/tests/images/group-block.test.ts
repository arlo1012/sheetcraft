import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureGroup } from "@sheetcraft/core/picture-group";
import { encodeXlsx } from "../../index.js";
import { createXlsxImageExporter } from "../../image-export.js";
function group(): PictureGroup {
  return {
    kind: "picture-group-v1",
    id: "group",
    altText: "Synthetic",
    hidden: true,
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 40, y: 10, size: { width: 120, height: 80 } },
      angleDeg: 37,
    },
    members: [
      {
        kind: "grouped-picture-v1",
        id: "leaf",
        assetId: "missing-leaf",
        altText: "Synthetic leaf",
        frame: {
          kind: "group-member-frame-v1",
          rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          angleDeg: 37,
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        },
      },
    ],
  };
}
describe("owned group native writer safety boundary", () => {
  test("a hidden source-free container blocks before resource handling and keeps snapshot48 unchanged", async () => {
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
    getActiveSheet(workbook).floatingImages = [group()];
    const before = serializeWorkbook(workbook);
    await expect(encodeXlsx(workbook)).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            code: "feature-omitted",
            severity: "block",
            count: 1,
            locations: ['Synthetic.floatingImages["group"].frame'],
          },
        ],
      },
    });
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("the direct exporter refuses before registering a leaf asset or mutating a drawing", () => {
    const target = { addImage: vi.fn(() => 1) },
      output = { addImage: vi.fn() };
    const sheet = getActiveSheet(createWorkbook({ id: "w", sheetId: "s" }));
    expect(() =>
      createXlsxImageExporter(target, undefined).addFloatingImage(
        output,
        sheet,
        group(),
        "Synthetic!C4",
      ),
    ).toThrow(/not yet supported/);
    expect(target.addImage).not.toHaveBeenCalled();
    expect(output.addImage).not.toHaveBeenCalled();
  });
});
