import { expect, test } from "vitest";
import { captureCellPictureSourcePresentation } from "../../../modules/sheet-images/cell-picture-presentation";
import { framedCellPicture } from "./cell-picture-fixture";

test("cell source presentation is a detached view frame with faithful source and metadata", () => {
  const image = framedCellPicture();
  image.frame.cropShape = { preset: "ellipse" };
  const before = structuredClone(image);
  const presentation = captureCellPictureSourcePresentation(image);
  expect(presentation.picture).toMatchObject({
    id: "cell-picture-source",
    assetId: image.assetId,
    altText: image.altText,
    altTitle: image.altTitle,
    locked: false,
    printObject: false,
    lockAspectRatio: false,
    transform: image.transform,
    frame: {
      kind: "object-frame-v1",
      anchor: {
        mode: "move-and-size",
        start: { column: { index: 0, offset: 0 }, row: { index: 0, offset: 0 } },
        end: {
          column: { index: 0, offset: image.frame.size.width },
          row: { index: 0, offset: image.frame.size.height },
        },
      },
      angleDeg: 37,
      source: image.frame.source,
      cropShape: { preset: "ellipse" },
      flipHorizontal: true,
    },
  });
  expect(presentation.picture.frame).not.toHaveProperty("size");
  expect(presentation.picture.transform).not.toHaveProperty("crop");
  expect(presentation.geometry.sourceRect).toEqual({ x: 90, y: 35, width: 100, height: 50 });
  presentation.picture.frame.source.widthRatio = 2;
  presentation.picture.transform!.annotations![0]!.text = "Changed view";
  expect(image).toEqual(before);
});
