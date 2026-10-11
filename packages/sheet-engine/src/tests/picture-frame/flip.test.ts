import { describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { flipFramedPicture } from "../../picture-frame-layout.js";
const metrics = createPictureSheetMetrics(createSheet("Synthetic", "s"));
function sample(image: FramedFloatingImage, u: number, v: number) {
  const g = resolvePictureFrame(image.frame, metrics),
    s = g.sourceRect!;
  const center = { x: g.rect.x + g.rect.width / 2, y: g.rect.y + g.rect.height / 2 };
  const x = s.x + (image.frame.flipHorizontal ? 1 - u : u) * s.width - center.x,
    y = s.y + (image.frame.flipVertical ? 1 - v : v) * s.height - center.y;
  const a = (g.angleDeg * Math.PI) / 180;
  return {
    x: center.x + Math.cos(a) * x - Math.sin(a) * y,
    y: center.y + Math.sin(a) * x + Math.cos(a) * y,
  };
}
describe("complete sheet-axis frame reflection", () => {
  for (const angle of [0, 37, 90, 217])
    for (const axis of ["horizontal", "vertical"] as const) {
      test(`${angle} degrees ${axis} reflects source coordinates and preserves local dimensions`, () => {
        const image: FramedFloatingImage = {
          id: "f",
          assetId: "a",
          altText: "Synthetic",
          frame: {
            kind: "object-frame-v1",
            anchor: { mode: "fixed", x: 200, y: 120, size: { width: 120, height: 80 } },
            angleDeg: angle,
            source: { widthRatio: 1.8, heightRatio: 1.3, offsetXRatio: 0.3, offsetYRatio: -0.2 },
            flipHorizontal: true,
          },
        };
        const before = structuredClone(image),
          next = flipFramedPicture(image, axis, metrics);
        for (const [u, v] of [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0.2, 0.7],
        ]) {
          const old = sample(image, u!, v!),
            actual = sample(next, u!, v!);
          expect(actual.x).toBeCloseTo(axis === "horizontal" ? 520 - old.x : old.x, 9);
          expect(actual.y).toBeCloseTo(axis === "vertical" ? 320 - old.y : old.y, 9);
        }
        expect(next.frame.anchor).toEqual(image.frame.anchor);
        expect(flipFramedPicture(next, axis, metrics)).toEqual(image);
        expect(image).toEqual(before);
      });
    }
});
