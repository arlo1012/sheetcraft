import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx } from "../../index.js";
test("canonical shape placement explicitly blocks XLSX before resources and leaves internal state untouched", async () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
  getActiveSheet(workbook).drawings = [
    normalizeSheetDrawing({
      id: "shape",
      kind: "shape",
      name: "Shape",
      text: "",
      shape: "rectangle",
      fill: "transparent",
      stroke: "#000000",
      strokeWidth: 1,
      color: "#000000",
      fontSize: 12,
      bold: false,
      italic: false,
      rotation: 37,
      shapeFrame: {
        kind: "shape-frame-v1",
        anchor: { mode: "fixed", x: 80, y: 24, size: { width: 240, height: 120 } },
      },
      shapeProperties: { printObject: false },
    }),
  ];
  const before = serializeWorkbook(workbook),
    readImages = vi.fn(() => []);
  const options = Object.defineProperty({}, "images", { get: readImages });
  await expect(encodeXlsx(workbook, options)).rejects.toMatchObject({
    name: "XlsxCompatibilityError",
    report: {
      issues: [
        {
          code: "feature-omitted",
          severity: "block",
          locations: ['Synthetic.drawings["shape"].shapeFrame'],
        },
      ],
    },
  });
  expect(readImages).not.toHaveBeenCalled();
  expect(serializeWorkbook(workbook)).toEqual(before);
});
