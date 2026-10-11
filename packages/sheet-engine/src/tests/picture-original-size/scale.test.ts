import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import { scaleResolvedPictureCropBy } from "../../picture-original-size.js";
import { expectScaledSource, fixture } from "./fixture.js";

describe("picture scale preserves normalized crop and fixes rotated local NW", () => {
  test.each([0, 37, 90, 137, 219, 359.75])("free axis scaling at %s degrees", (angleDeg) => {
    for (const [widthFactor, heightFactor] of [
      [1.5, 0.8],
      [1, 1.2],
      [1.25, 1],
      [0.5, 0.5],
    ] as const) {
      const before = fixture(angleDeg);
      const snapshot = structuredClone(before);
      const after = scaleResolvedPictureCropBy(before, { widthFactor, heightFactor });
      expect(after.layout.rect.width).toBe(before.layout.rect.width * widthFactor);
      expect(after.layout.rect.height).toBe(before.layout.rect.height * heightFactor);
      expect(after.layout.angleDeg).toBe(angleDeg);
      expect(after.layout.corners[0].x).toBeCloseTo(before.layout.corners[0].x, 10);
      expect(after.layout.corners[0].y).toBeCloseTo(before.layout.corners[0].y, 10);
      expect(after.layout).toEqual(resolvePictureLayout(after.layout.rect, angleDeg));
      expect(after.source).toBe(before.source);
      expect(after.layout.rect.width * after.source.widthRatio).toBeCloseTo(360 * widthFactor, 10);
      expect(after.layout.rect.height * after.source.heightRatio).toBeCloseTo(
        240 * heightFactor,
        10,
      );
      expect(after.layout.rect.width * after.source.offsetXRatio).toBeCloseTo(48 * widthFactor, 10);
      expect(after.layout.rect.height * after.source.offsetYRatio).toBeCloseTo(
        28.8 * heightFactor,
        10,
      );
      expectScaledSource(before, after, widthFactor, heightFactor);
      expect(before).toEqual(snapshot);
    }
  });

  test("37-degree WPS sequence scales frame/source/offset together and accepts caller-selected factors", () => {
    const baseline = fixture();
    const width150 = scaleResolvedPictureCropBy(baseline, { widthFactor: 1.5, heightFactor: 1.5 });
    const height120 = scaleResolvedPictureCropBy(width150, {
      widthFactor: 1,
      heightFactor: 120 / 150,
    });
    const relative125 = scaleResolvedPictureCropBy(height120, {
      widthFactor: 1.25,
      heightFactor: 1,
    });
    const relative125Again = scaleResolvedPictureCropBy(relative125, {
      widthFactor: 1.25,
      heightFactor: 1,
    });
    for (const [state, width, height, sourceWidth, sourceHeight, offsetX, offsetY] of [
      [width150, 3, 2.25, 5.625, 3.75, 0.75, 0.45],
      [height120, 3, 1.8, 5.625, 3, 0.75, 0.36],
      [relative125, 3.75, 1.8, 7.03125, 3, 0.9375, 0.36],
      [relative125Again, 4.6875, 1.8, 8.7890625, 3, 1.171875, 0.36],
    ] as const) {
      const { rect } = state.layout;
      expect(rect.width / 96).toBeCloseTo(width, 10);
      expect(rect.height / 96).toBeCloseTo(height, 10);
      expect((rect.width * state.source.widthRatio) / 96).toBeCloseTo(sourceWidth, 10);
      expect((rect.height * state.source.heightRatio) / 96).toBeCloseTo(sourceHeight, 10);
      expect((rect.width * state.source.offsetXRatio) / 96).toBeCloseTo(offsetX, 10);
      expect((rect.height * state.source.offsetYRatio) / 96).toBeCloseTo(offsetY, 10);
      expect(state.layout.corners[0].x).toBeCloseTo(baseline.layout.corners[0].x, 10);
      expect(state.layout.corners[0].y).toBeCloseTo(baseline.layout.corners[0].y, 10);
      expect(state.source).toBe(baseline.source);
    }
    expect(
      ((relative125Again.layout.rect.width * relative125Again.source.widthRatio) / 360) * 100,
    ).toBeCloseTo(234.375, 10);
    expect(
      ((relative125Again.layout.rect.height * relative125Again.source.heightRatio) / 240) * 100,
    ).toBeCloseTo(120, 10);
  });

  test("signed padding, tiny source spans and source spans over the frame budget scale freely", () => {
    const before = fixture(37, {
      widthRatio: 100000 / 192,
      heightRatio: 0.5 / 144,
      offsetXRatio: -20,
      offsetYRatio: 17,
    });
    const after = scaleResolvedPictureCropBy(before, { widthFactor: 1.2, heightFactor: 1.5 });
    expect(after.source).toBe(before.source);
    expectScaledSource(before, after, 1.2, 1.5);
  });
});
