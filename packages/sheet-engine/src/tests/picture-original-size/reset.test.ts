import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import { resetResolvedPictureToOriginalSize } from "../../picture-original-size.js";
import { fixture } from "./fixture.js";

describe("reset picture to actual current source original size", () => {
  test.each([0, 15, 37, 90, 219])(
    "clears crop and %s-degree rotation while keeping layout x/y",
    (angleDeg) => {
      const before = fixture(angleDeg);
      const snapshot = structuredClone(before);
      const after = resetResolvedPictureToOriginalSize(before, { width: 360, height: 240 });
      expect(after.layout).toEqual(
        resolvePictureLayout({ x: 144, y: 144, width: 360, height: 240 }, 0),
      );
      expect(after.source).toEqual({
        widthRatio: 1,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
      expect(before).toEqual(snapshot);
    },
  );

  test("replacement's tall natural source size is supplied explicitly, never inferred from old geometry", () => {
    const before = fixture(37, { widthRatio: 1, heightRatio: 3, offsetXRatio: 0, offsetYRatio: 0 });
    before.layout = resolvePictureLayout({ x: 120, y: 120, width: 288, height: 192 }, 37);
    const after = resetResolvedPictureToOriginalSize(before, { width: 180, height: 360 });
    expect(after.layout.rect).toEqual({ x: 120, y: 120, width: 180, height: 360 });
    expect(after.layout.angleDeg).toBe(0);
    expect(after.source).toEqual({
      widthRatio: 1,
      heightRatio: 1,
      offsetXRatio: 0,
      offsetYRatio: 0,
    });
  });

  test("reset with already natural spans still clears any source crop or rotation", () => {
    for (const before of [
      fixture(0),
      fixture(37, { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 }),
      fixture(0, { widthRatio: 1, heightRatio: 1, offsetXRatio: -0.25, offsetYRatio: 0 }),
    ]) {
      const after = resetResolvedPictureToOriginalSize(before, { width: 192, height: 144 });
      expect(after).not.toBe(before);
      expect(after.layout.rect).toEqual(before.layout.rect);
      expect(after.layout.angleDeg).toBe(0);
      expect(after.source).toEqual({
        widthRatio: 1,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
    }
  });
});
