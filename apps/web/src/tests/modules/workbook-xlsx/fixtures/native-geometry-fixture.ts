import {
  createWorkbook,
  getActiveSheet,
  setColumnWidth,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import {
  applyWorkbookCommand,
  createSetSheetFloatingImagesCommand,
} from "@sheetcraft/core/commands";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { anchorPictureFrameRect } from "@sheetcraft/core/picture-frame";
import { editResolvedPictureCrop } from "@sheetcraft/core/picture-crop-edit";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { flipFramedPicture, rotateFramedPictureTo } from "@sheetcraft/sheet-engine";
import {
  getPictureFormatCropState,
  pictureFormatCropEdit,
  applyStandalonePictureCrop,
} from "../../../../modules/sheet-images/picture-format-crop";

/** The same numeric crop adapter, Core crop reducer, and sheet-engine tools used by the UI. */
export function createUiNativeGeometryFixture(
  options: { suppressed?: boolean; columnWidth?: number } = {},
) {
  const workbook = createWorkbook({ id: "b2-ui", sheetId: "s", sheetName: "B2 Pictures" });
  const sheet = getActiveSheet(workbook);
  for (let index = 0; index < 20; index++) setColumnWidth(sheet, index, options.columnWidth ?? 100);
  for (let index = 0; index < 40; index++) setRowHeight(sheet, index, 24);
  const metrics = createPictureSheetMetrics(sheet);
  const pictures: FramedFloatingImage[] = [];
  for (const mode of ["fixed", "move-only", "move-and-size"] as const) {
    for (const flips of ["none", "horizontal", "vertical", "both"] as const) {
      let picture: FramedFloatingImage = {
        id: `${mode}-${flips}`,
        assetId: "original-asymmetric",
        altText: `${mode} ${flips}`,
        frame: {
          kind: "object-frame-v1",
          anchor: anchorPictureFrameRect(
            mode,
            { x: 110.25, y: 30.125 + pictures.length * 130, width: 160, height: 96 },
            metrics,
          ),
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
        },
        ...(options.suppressed
          ? {
              transform: {
                appearance: {
                  suppressThemeEffects: {
                    shadow: true,
                    outline: true,
                    reflection: true,
                    bevel: true,
                  },
                },
              },
            }
          : {}),
      };
      for (const [field, points] of [
        ["sourceWidthPt", 180],
        ["sourceHeightPt", 120],
        ["sourceOffsetXPt", 12],
        ["sourceOffsetYPt", -6],
      ] as const) {
        const before = getPictureFormatCropState(picture, undefined, metrics)!;
        const next = editResolvedPictureCrop(
          before.layout,
          before.source,
          pictureFormatCropEdit(field, points),
        );
        picture = applyStandalonePictureCrop(picture, before, next, metrics) as FramedFloatingImage;
      }
      // Rotate before flipping as well: the real flip command negates angle and source offset.
      picture = rotateFramedPictureTo(picture, 37.5, metrics)!;
      if (flips === "horizontal" || flips === "both")
        picture = flipFramedPicture(picture, "horizontal", metrics);
      if (flips === "vertical" || flips === "both")
        picture = flipFramedPicture(picture, "vertical", metrics);
      pictures.push(picture);
    }
  }
  applyWorkbookCommand(workbook, createSetSheetFloatingImagesCommand(sheet.id, pictures));
  return { workbook, sheet, pictures: sheet.floatingImages as FramedFloatingImage[] };
}
