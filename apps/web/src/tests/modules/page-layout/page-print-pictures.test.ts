import { expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  getPrintablePictureRoots,
  getPrintPictureAssetIds,
} from "../../../modules/page-layout/page-print-pictures";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import { framedPicture } from "../sheet-images/framed-picture-fixture";
import { pictureGroup } from "../sheet-images/picture-group-fixture";

test("Print false excludes a complete root tree without hiding or deleting owned assets", () => {
  const workbook = createWorkbook({ id: "print", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook),
    frame = framedPicture(),
    group = pictureGroup();
  frame.printObject = false;
  group.printObject = false;
  sheet.floatingImages = [frame, group];
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    {
      kind: "image",
      image: { assetId: "cell-hidden-from-print", altText: "", printObject: false },
    },
  );
  setCellContent(
    sheet,
    { row: 0, column: 1 },
    { kind: "image", image: { assetId: "cell-print", altText: "" } },
  );
  const before = serializeWorkbook(workbook),
    roots = sheet.floatingImages;
  expect(getPrintablePictureRoots(sheet)).toEqual([]);
  expect([...getPrintPictureAssetIds(sheet)]).toEqual(["cell-print"]);
  const preview = createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) });
  expect(getPrintablePictureRoots(preview.sheet)).toEqual([]);
  expect(preview.sheet).toBe(sheet);
  expect(preview.sheet.cells).toBe(sheet.cells);
  expect(sheet.floatingImages).toBe(roots);
  expect(serializeWorkbook(workbook)).toEqual(before);
  expect(frame.hidden).toBeUndefined();
  expect(group.hidden).toBeUndefined();
  group.printObject = true;
  expect(() =>
    createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }),
  ).toThrow(/does not support/);
});
test("printing still blocks a printable owned group even if all leaf flags are false", () => {
  const workbook = createWorkbook({ id: "print", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook),
    group = pictureGroup();
  for (const member of group.members) member.printObject = false;
  sheet.floatingImages = [group];
  expect(getPrintablePictureRoots(sheet)).toEqual([group]);
  expect(() => getPrintPictureAssetIds(sheet)).toThrow(/does not support/);
});
test("legacy main and auxiliary assets are retained only for printable objects", () => {
  const workbook = createWorkbook({ id: "print", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
  const legacy = {
    id: "picture",
    assetId: "primary",
    altText: "",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 50,
    transform: {
      appearance: {
        detailedStyle: {
          fill: {
            kind: "value" as const,
            value: {
              kind: "picture" as const,
              assetId: "backplate",
              opacity: 1,
              rotateWithShape: true,
              layout: {
                kind: "stretch" as const,
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
  };
  sheet.floatingImages = [legacy];
  expect([...getPrintPictureAssetIds(sheet)]).toEqual(["primary", "backplate"]);
  Object.assign(legacy, { printObject: false });
  expect([...getPrintPictureAssetIds(sheet)]).toEqual([]);
  expect(sheet.floatingImages[0]).toMatchObject({ assetId: "primary" });
});
