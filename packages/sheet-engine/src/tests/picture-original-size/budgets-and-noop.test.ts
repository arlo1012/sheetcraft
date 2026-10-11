import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resetResolvedPictureToOriginalSize,
  scaleResolvedPictureCropBy,
} from "../../picture-original-size.js";
import { fixture } from "./fixture.js";

describe("picture original-size budgets and exact no-ops", () => {
  test.each([0, 37, 90, 219, 359.75])(
    "identity scaling at %s degrees retains all references and source ratio bits",
    (angleDeg) => {
      const before = fixture(angleDeg, {
        widthRatio: Math.sin(8) + 1,
        heightRatio: Math.sin(7) + 1,
        offsetXRatio: Math.sin(8),
        offsetYRatio: Math.sin(7),
      });
      expect(scaleResolvedPictureCropBy(before, { widthFactor: 1, heightFactor: 1 })).toBe(before);
    },
  );

  test("already matching original geometry retains the exact input and all references", () => {
    const before = fixture(0, { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 });
    expect(resetResolvedPictureToOriginalSize(before, { width: 192, height: 144 })).toBe(before);
  });

  test.each([0, 37, 90, 219])(
    "scale targets at 1 and 10000 are accepted without clipping at %s degrees",
    (angleDeg) => {
      const before = fixture(angleDeg);
      before.layout = resolvePictureLayout({ x: 0, y: 0, width: 100, height: 100 }, angleDeg);
      const after = scaleResolvedPictureCropBy(before, { widthFactor: 0.01, heightFactor: 100 });
      expect(after.layout.rect.width).toBe(1);
      expect(after.layout.rect.height).toBe(10000);
      expect(after.source).toBe(before.source);
    },
  );

  test("source-free resolved original size accepts both edit-budget endpoints", () => {
    const before = fixture();
    const after = resetResolvedPictureToOriginalSize(before, { width: 1, height: 10000 });
    expect(after.layout.rect).toEqual({ x: 144, y: 144, width: 1, height: 10000 });
  });

  test("scale checks both target axes before resizing and rejects an out-of-budget counterpart atomically", () => {
    const before = fixture();
    const snapshot = structuredClone(before);
    for (const factors of [
      { widthFactor: 10001 / 192, heightFactor: 1 },
      { widthFactor: 1, heightFactor: 10001 / 144 },
      { widthFactor: 0.5 / 192, heightFactor: 1 },
      { widthFactor: 1, heightFactor: 0.5 / 144 },
      { widthFactor: Number.MIN_VALUE, heightFactor: 1 },
      { widthFactor: Number.MAX_VALUE, heightFactor: 1 },
    ])
      expect(() => scaleResolvedPictureCropBy(before, factors)).toThrow();
    expect(before).toEqual(snapshot);
  });

  test("durable large current spans may shrink into budget, but targets above budget never silently clamp", () => {
    const before = fixture();
    before.layout = resolvePictureLayout({ x: 0, y: 0, width: 20000, height: 12000 }, 37);
    const after = scaleResolvedPictureCropBy(before, { widthFactor: 0.25, heightFactor: 0.5 });
    expect(after.layout.rect.width).toBe(5000);
    expect(after.layout.rect.height).toBe(6000);
    expect(() => scaleResolvedPictureCropBy(before, { widthFactor: 1, heightFactor: 1 })).toThrow();
  });
});
