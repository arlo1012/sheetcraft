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

test("owned shape groups block native output before asset access without flattening their children", async () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
  const leaf = normalizeSheetDrawing({
    id: "child",
    kind: "shape",
    name: "Child",
    text: "preserved",
    shape: "rectangle",
    fill: "#123456",
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
  });
  const { shapeFrame, ...appearance } = leaf;
  getActiveSheet(workbook).drawings = [
    {
      id: "group",
      kind: "shapeGroup",
      name: "Group",
      rotation: 0,
      shapeFrame,
      members: [
        {
          ...appearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
        },
      ],
    },
  ];
  const before = serializeWorkbook(workbook),
    readImages = vi.fn(() => []);
  await expect(
    encodeXlsx(workbook, Object.defineProperty({}, "images", { get: readImages })),
  ).rejects.toMatchObject({
    name: "XlsxCompatibilityError",
    report: {
      issues: [{ severity: "block", locations: ['Synthetic.drawings["group"].shapeFrame'] }],
    },
  });
  expect(readImages).not.toHaveBeenCalled();
  expect(serializeWorkbook(workbook)).toEqual(before);
});
