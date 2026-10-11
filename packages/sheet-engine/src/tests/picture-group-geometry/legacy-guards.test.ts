import { describe, expect, test } from "vitest";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  getFloatingImageSheetRect,
  getFloatingImageViewportFragments,
  reanchorFloatingImageAtSheetRect,
  moveFloatingImageBy,
  resizeFloatingImageBy,
} from "../../floating-image-layout.js";
import {
  cropFloatingImage,
  rotateFloatingImage,
  flipFloatingImage,
  restoreFloatingImage,
} from "../../floating-image-transform.js";
import {
  captureFloatingImageGroup,
  rotateFloatingImages,
  flipFloatingImages,
  resizeFloatingImagesBy,
} from "../../floating-image-group.js";
import { resizeFloatingImageSelectionBy } from "../../floating-image-selection.js";
import {
  getFramedPictureViewportFragments,
  framedPictureContainsViewportPoint,
  moveFramedPictureBy,
  resizeFramedPictureBy,
  rotateFramedPictureBy,
  flipFramedPicture,
} from "../../picture-frame-layout.js";
import { resizeFramedPictureTo, rotateFramedPictureTo } from "../../picture-frame-numeric.js";
import type { SheetViewportLayout } from "../../viewport-layout.js";
import { group, metrics } from "./fixture.js";

const forbiddenLayout = new Proxy(
  {},
  {
    get: () => {
      throw new Error("Unsupported variant touched viewport geometry.");
    },
  },
) as SheetViewportLayout;
const rect = { x: 100, y: 100, width: 200, height: 100 };
const delta = { x: 10, y: 10 };

describe("legacy-only geometry refuses durable groups before viewport or source work", () => {
  test("every legacy placement and transform helper rejects a root group", () => {
    const original = group(),
      before = structuredClone(original);
    expect(getFloatingImageSheetRect(original, forbiddenLayout)).toBeNull();
    expect(getFloatingImageViewportFragments(original, forbiddenLayout)).toEqual([]);
    expect(reanchorFloatingImageAtSheetRect(original, rect, forbiddenLayout)).toBeNull();
    expect(moveFloatingImageBy(original, delta, forbiddenLayout)).toBeNull();
    expect(resizeFloatingImageBy(original, "se", delta, forbiddenLayout)).toBeNull();
    expect(
      cropFloatingImage(original, { x: 0, y: 0, width: 0.5, height: 0.5 }, forbiddenLayout),
    ).toBeNull();
    expect(rotateFloatingImage(original, 1, forbiddenLayout)).toBeNull();
    expect(restoreFloatingImage(original, forbiddenLayout)).toBeNull();
    expect(() => flipFloatingImage(original, "horizontal")).toThrow(/Legacy/);
    expect(original).toEqual(before);
  });
  test("legacy group/clipboard capture and selection refuse mixed groups before any member work", () => {
    const original = group(),
      before = structuredClone(original);
    const legacy: FloatingImage = {
      id: "legacy",
      assetId: "asset",
      altText: "",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 100,
      height: 100,
    };
    const mixed = [legacy, original];
    expect(captureFloatingImageGroup(mixed, forbiddenLayout)).toBeNull();
    expect(rotateFloatingImages(mixed, 1, forbiddenLayout)).toBeNull();
    expect(flipFloatingImages(mixed, "horizontal", forbiddenLayout)).toBeNull();
    expect(resizeFloatingImagesBy(mixed, "se", delta, forbiddenLayout)).toBeNull();
    expect(
      resizeFloatingImageSelectionBy(mixed, "legacy", "se", delta, forbiddenLayout),
    ).toBeNull();
    expect(original).toEqual(before);
  });
  test("standalone frame-specific APIs cannot accidentally accept a source-free group", () => {
    const original = group(),
      before = structuredClone(original),
      unsupported = original as unknown as FramedFloatingImage;
    expect(() =>
      getFramedPictureViewportFragments(unsupported, { layout: forbiddenLayout, metrics }),
    ).toThrow(/standalone/);
    expect(() =>
      framedPictureContainsViewportPoint(unsupported, delta, { layout: forbiddenLayout, metrics }),
    ).toThrow(/standalone/);
    expect(() => moveFramedPictureBy(unsupported, delta, metrics)).toThrow(/standalone/);
    expect(() => resizeFramedPictureBy(unsupported, "se", delta, metrics)).toThrow(/standalone/);
    expect(() => rotateFramedPictureBy(unsupported, 37, metrics)).toThrow(/standalone/);
    expect(() => flipFramedPicture(unsupported, "horizontal", metrics)).toThrow(/standalone/);
    expect(() =>
      resizeFramedPictureTo(unsupported, { axis: "width", value: 200 }, metrics),
    ).toThrow(/framed/);
    expect(() => rotateFramedPictureTo(unsupported, 37, metrics)).toThrow(/framed/);
    expect(original).toEqual(before);
  });
});
