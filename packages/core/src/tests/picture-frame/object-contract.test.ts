import { describe, expect, test } from "vitest";
import {
  normalizePictureObject,
  clonePictureObject,
  arePictureObjectsEqual,
  normalizePictureObjectCollection,
  type FramedFloatingImage,
} from "../../picture-object.js";
import {
  createSheet,
  normalizeFloatingImageForSheet,
  type LegacyFloatingImage,
} from "../../workbook.js";
import { createSetFloatingImageCommand } from "../../commands/index.js";
import { serializeSheet, deserializeSheet } from "../../serialization.js";
function framed(): FramedFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 12, y: 16, size: { width: 360, height: 240 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 37,
    },
    transform: {
      annotations: [{ kind: "pen", color: "#FF0000", width: 0.01, points: [{ x: 0.2, y: 0.3 }] }],
    },
  };
}
function legacy(): LegacyFloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Synthetic",
    anchor: { row: 2, column: 2 },
    offsetX: 400,
    offsetY: 2,
    width: 360,
    height: 240,
    transform: { rotation: 90 },
  };
}
describe("prepared picture object contract", () => {
  test("separates tagged geometry from appearance and detaches nested content", () => {
    const original = framed(),
      copy = clonePictureObject(original);
    copy.frame.source.offsetXRatio = 0.5;
    copy.transform!.annotations![0]!.points[0]!.x = 0.9;
    expect(original.frame.source.offsetXRatio).toBe(0);
    expect(original.transform!.annotations![0]!.points[0]!.x).toBe(0.2);
    expect(arePictureObjectsEqual(original, clonePictureObject(original))).toBe(true);
    expect(arePictureObjectsEqual(original, copy)).toBe(false);
    expect(arePictureObjectsEqual(original, legacy())).toBe(false);
  });
  test.each(["width", "height", "offsetX", "offsetY", "anchor", "unknown"])(
    "rejects conflicting/unknown %s",
    (field) => {
      const value = { ...framed(), [field]: field === "anchor" ? { row: 0, column: 0 } : 0 };
      expect(() => normalizePictureObject(value)).toThrow();
    },
  );
  test.each(["rotation", "crop", "flipHorizontal", "flipVertical", "unknown"])(
    "rejects duplicate transform geometry %s",
    (field) => {
      const value = { ...framed(), transform: { [field]: 0 } };
      expect(() => normalizePictureObject(value as FramedFloatingImage)).toThrow();
    },
  );
  test("normalizes a complete collection before returning and rejects duplicate identity", () => {
    const first = framed(),
      bad = { ...framed(), id: "second", frame: { ...framed().frame, angleDeg: NaN } };
    const original = structuredClone(first);
    expect(() => normalizePictureObjectCollection([first, bad])).toThrow();
    expect(first).toEqual(original);
    expect(() => normalizePictureObjectCollection([first, first])).toThrow(/Duplicate/);
    const valid = normalizePictureObjectCollection([legacy(), { ...first, id: "other" }]);
    expect(valid).toHaveLength(2);
  });
  test("legacy geometry remains unchanged", () => {
    const image = legacy();
    expect(normalizePictureObject(image)).toEqual(image);
    expect(clonePictureObject(image)).toEqual(image);
    expect(arePictureObjectsEqual(image, clonePictureObject(image))).toBe(true);
  });
  test("strict commands and internal snapshots preserve framed geometry but reject dual truth", () => {
    const conflict = { ...legacy(), frame: framed().frame };
    expect(() => normalizeFloatingImageForSheet(conflict)).toThrow(/conflicting/);
    expect(createSetFloatingImageCommand("sheet", framed()).image).toEqual(framed());
    const sheet = createSheet("Synthetic", "sheet");
    sheet.floatingImages = [legacy(), { ...framed(), id: "frame" }];
    const raw = serializeSheet(sheet);
    const bad = structuredClone(raw);
    Object.assign(bad.floatingImages[0]!, { frame: framed().frame });
    expect(() => deserializeSheet(bad)).toThrow(/conflicting/);
    expect(deserializeSheet(raw).floatingImages).toEqual(sheet.floatingImages);
  });
});
