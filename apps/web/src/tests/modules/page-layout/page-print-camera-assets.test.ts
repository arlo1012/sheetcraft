// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type CellAddress,
  type CellRange,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { SheetCameraDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getPrintPictureAssetIds } from "../../../modules/page-layout/page-print-pictures";

function fixture() {
  const workbook = createWorkbook({ id: "camera-print-assets", sheetId: "sheet" });
  return { workbook, sheet: getActiveSheet(workbook) };
}

function camera(range: CellRange | null): SheetCameraDrawing {
  return {
    ...createGraphicDrawing("camera", "icon", "Camera", { row: 8, column: 8 }),
    kind: "camera",
    shape: "rectangle",
    camera: { range, gridLines: true },
  };
}

function sourcePicture(sheet: Sheet, address: CellAddress, id: string) {
  setCellContent(sheet, address, {
    kind: "image",
    image: {
      assetId: `${id}-main`,
      altText: id,
      printObject: false,
      transform: {
        appearance: {
          detailedStyle: {
            fill: {
              kind: "value",
              value: {
                kind: "picture",
                assetId: `${id}-backplate`,
                opacity: 1,
                rotateWithShape: true,
                layout: {
                  kind: "stretch",
                  offsetXRatio: 0,
                  offsetYRatio: 0,
                  widthRatio: 1,
                  heightRatio: 1,
                },
              },
            },
          },
        },
      },
    },
  });
}

describe("camera print picture resources", () => {
  test("includes a camera source picture and its detailed-style asset despite printObject=false, excluding pictures outside the source", () => {
    const f = fixture();
    f.sheet.drawings = [camera({ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } })];
    sourcePicture(f.sheet, { row: 1, column: 1 }, "inside");
    sourcePicture(f.sheet, { row: 2, column: 2 }, "inside-edge");
    sourcePicture(f.sheet, { row: 0, column: 1 }, "outside-top");
    sourcePicture(f.sheet, { row: 2, column: 3 }, "outside-right");
    const before = serializeWorkbook(f.workbook);

    expect(getPrintPictureAssetIds(f.sheet)).toEqual(
      new Set(["inside-main", "inside-backplate", "inside-edge-main", "inside-edge-backplate"]),
    );

    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("does not collect non-printing source pictures when the camera has no range", () => {
    const f = fixture();
    f.sheet.drawings = [camera(null)];
    sourcePicture(f.sheet, { row: 1, column: 1 }, "unreferenced");
    const before = serializeWorkbook(f.workbook);

    expect(getPrintPictureAssetIds(f.sheet)).toEqual(new Set());

    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("includes an outside merged-cell anchor whose merged area crosses into the camera range", () => {
    const f = fixture();
    f.sheet.mergedCells = [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }];
    f.sheet.drawings = [camera({ start: { row: 2, column: 2 }, end: { row: 3, column: 3 } })];
    sourcePicture(f.sheet, { row: 1, column: 1 }, "merged-anchor");
    sourcePicture(f.sheet, { row: 1, column: 3 }, "outside-camera-inside-merge-bounds");
    sourcePicture(f.sheet, { row: 0, column: 0 }, "outside");
    const before = serializeWorkbook(f.workbook);

    expect(getPrintPictureAssetIds(f.sheet)).toEqual(
      new Set(["merged-anchor-main", "merged-anchor-backplate"]),
    );

    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("explicitly rejects an invalid camera hidden field instead of silently treating it as supported visibility", () => {
    const f = fixture();
    // Camera visibility is not admitted by the current Core drawing contract.
    const invalid = {
      ...camera({ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }),
      hidden: true,
    } as unknown as SheetCameraDrawing;
    f.sheet.drawings = [invalid];
    sourcePicture(f.sheet, { row: 1, column: 1 }, "invalid-owner");
    const before = structuredClone(f.sheet);

    expect(() => getPrintPictureAssetIds(f.sheet)).toThrow(/visibility/i);

    expect(f.sheet).toEqual(before);
  });
});
