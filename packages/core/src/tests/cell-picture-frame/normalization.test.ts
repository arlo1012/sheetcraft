import { describe, expect, test } from "vitest";
import {
  normalizeCellPictureFrame,
  cloneCellPictureFrame,
  normalizeCellImage,
  cloneCellImage,
  areCellImagesEqual,
  areCellPictureFramesEqual,
  isFramedCellImage,
  type CellImage,
  type CellPictureFrame,
} from "../../cell-picture-frame.js";
import { framedCellImage } from "./fixture.js";

describe("local cell picture frame", () => {
  test("keeps precise local geometry and normalizes default flips, rect and angle", () => {
    const original = framedCellImage().frame;
    const normalized = normalizeCellPictureFrame({
      ...original,
      angleDeg: -37.125,
      flipHorizontal: false,
      flipVertical: false,
      cropShape: { preset: "rect" },
    });
    expect(normalized).toEqual({
      kind: "cell-picture-frame-v1",
      size: original.size,
      source: original.source,
      angleDeg: 322.875,
    });
    expect(
      areCellPictureFramesEqual(normalized, {
        ...normalized,
        angleDeg: 682.875,
        flipVertical: false,
        cropShape: { preset: "rect" },
      }),
    ).toBe(true);
    expect(cloneCellPictureFrame(original).size).not.toBe(original.size);
  });
  test("detaches geometry, appearance and annotation data and preserves aspect ratio lock", () => {
    const original = framedCellImage(),
      copy = cloneCellImage(original);
    expect(isFramedCellImage(copy)).toBe(true);
    expect(areCellImagesEqual(original, copy)).toBe(true);
    copy.frame.source.offsetXRatio = 0.5;
    copy.frame.size.width = 99.5;
    copy.transform!.annotations![0]!.points[0]!.x = 0.9;
    copy.transform!.appearance!.brightness = 0.5;
    expect(original).toEqual(framedCellImage());
    expect(areCellImagesEqual(original, copy)).toBe(false);
    for (const lockAspectRatio of [true, false, undefined]) {
      const normalized = normalizeCellImage({ ...original, lockAspectRatio });
      expect(normalized.lockAspectRatio).toBe(lockAspectRatio);
      expect(Object.hasOwn(normalized, "lockAspectRatio")).toBe(lockAspectRatio !== undefined);
    }
  });
  test("legacy image normalization keeps existing canonical semantics", () => {
    const legacy: CellImage = {
      assetId: "asset",
      altText: "",
      transform: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 }, flipHorizontal: false },
      locked: true,
      altTitle: "",
    };
    expect(normalizeCellImage(legacy)).toEqual({
      assetId: "asset",
      altText: "",
      transform: { rotation: 90 },
    });
    expect(isFramedCellImage(legacy)).toBe(false);
    expect(areCellImagesEqual(legacy, cloneCellImage(legacy))).toBe(true);
    expect(areCellImagesEqual(legacy, framedCellImage())).toBe(false);
  });
  test.each(["anchor", "offsetX", "offsetY", "width", "height", "unknown"])(
    "rejects cell-image worksheet/conflicting field %s",
    (field) => {
      expect(() => normalizeCellImage({ ...framedCellImage(), [field]: 0 })).toThrow(
        /Unknown|conflicting/,
      );
    },
  );
  test.each(["crop", "rotation", "flipHorizontal", "flipVertical", "unknown"])(
    "rejects second geometry source %s even with a default value",
    (field) => {
      expect(() =>
        normalizeCellImage({
          ...framedCellImage(),
          transform: { [field]: undefined },
        } as CellImage),
      ).toThrow(/Unknown|conflicting/);
    },
  );
  test.each(["anchor", "x", "y", "unknown"])("rejects nonlocal frame field %s", (field) => {
    expect(() => normalizeCellPictureFrame({ ...framedCellImage().frame, [field]: 0 })).toThrow(
      /Unknown|conflicting/,
    );
  });
  test("retains fractional and expanded derived reference dimensions without clamping", () => {
    for (const width of [0.001, 10000.001, 10000000])
      expect(
        normalizeCellPictureFrame({ ...framedCellImage().frame, size: { width, height: 20 } }).size
          .width,
      ).toBe(width);
  });
  test.each([0, -1, 1000000001, NaN, Infinity])("rejects invalid local dimension %s", (width) => {
    expect(() =>
      normalizeCellPictureFrame({ ...framedCellImage().frame, size: { width, height: 1 } }),
    ).toThrow();
  });
  test.each(["frame", "size", "source", "angleDeg", "cropShape", "transform", "lockAspectRatio"])(
    "rejects accessor %s without calling it",
    (field) => {
      const original = framedCellImage();
      let reads = 0;
      const target = ["frame", "transform", "lockAspectRatio"].includes(field)
        ? original
        : original.frame;
      Object.defineProperty(target, field, {
        enumerable: true,
        get: () => {
          reads++;
          return undefined;
        },
      });
      expect(() => normalizeCellImage(original)).toThrow(/accessor/);
      expect(reads).toBe(0);
    },
  );
  test("rejects nonordinary records, inherited frames, unknown symbols and nested accessors", () => {
    expect(() =>
      normalizeCellPictureFrame(
        Object.assign(Object.create({}), framedCellImage().frame) as CellPictureFrame,
      ),
    ).toThrow(/ordinary/);
    expect(() =>
      normalizeCellImage(
        Object.assign(Object.create({ frame: framedCellImage().frame }), {
          assetId: "asset",
          altText: "",
        }) as CellImage,
      ),
    ).toThrow(/own local frame/);
    const value = framedCellImage();
    Object.defineProperty(value.frame.source, "unknown", { value: 1 });
    expect(() => normalizeCellImage(value)).toThrow(/Unknown/);
    const symbol = framedCellImage();
    Object.defineProperty(symbol.frame, Symbol("secret"), { value: 1 });
    expect(() => normalizeCellImage(symbol)).toThrow(/Unknown/);
    const accessor = framedCellImage();
    let reads = 0;
    Object.defineProperty(accessor.transform!.annotations![0]!.points[0]!, "x", {
      get: () => {
        reads++;
        return 0;
      },
    });
    expect(() => normalizeCellImage(accessor)).toThrow(/accessor/);
    expect(reads).toBe(0);
  });
  test("rejects invalid shape fields and normalizes shape defaults", () => {
    for (const cropShape of [
      { preset: "unknown" },
      { preset: "line" },
      { preset: "ellipse", unknown: 1 },
      { preset: "ellipse", adjustments: { unknown: 1 } },
    ])
      expect(() =>
        normalizeCellPictureFrame({ ...framedCellImage().frame, cropShape } as CellPictureFrame),
      ).toThrow();
    const value = framedCellImage().frame;
    Object.defineProperty(value.cropShape!, "adjustments", {
      get: () => {
        throw new Error("getter ran");
      },
    });
    expect(() => normalizeCellPictureFrame(value)).toThrow(/accessor/);
  });
  test("bounds data-tree depth and node count before appearance normalization", () => {
    let deep: Record<string, unknown> = {};
    for (let index = 0; index < 33; index++) deep = { next: deep };
    const broad = Array.from({ length: 10000 }, () => ({}));
    for (const unknown of [deep, broad])
      expect(() =>
        normalizeCellImage({
          ...framedCellImage(),
          transform: { appearance: { unknown } },
        } as unknown as CellImage),
      ).toThrow(/budget/);
    const cycle: Record<string, unknown> = {};
    cycle.next = cycle;
    expect(() =>
      normalizeCellImage({
        ...framedCellImage(),
        transform: { appearance: { unknown: cycle } },
      } as unknown as CellImage),
    ).toThrow(/Cyclic/);
    for (const unknown of [() => 1, Symbol("value")])
      expect(() =>
        normalizeCellImage({
          ...framedCellImage(),
          transform: { appearance: { unknown } },
        } as unknown as CellImage),
      ).toThrow(/functions or symbols/);
  });
  test("requires ordinary dense arrays and detaches legitimately shared point data", () => {
    const sparse: unknown[] = [];
    sparse.length = 2;
    const extra = [1];
    Object.defineProperty(extra, "unknown", { value: 1 });
    const inherited = [1];
    Object.setPrototypeOf(inherited, Object.create(Array.prototype));
    for (const unknown of [sparse, extra, inherited])
      expect(() =>
        normalizeCellImage({
          ...framedCellImage(),
          transform: { appearance: { unknown } },
        } as unknown as CellImage),
      ).toThrow(/dense|array|ordinary/);
    const image = framedCellImage(),
      point = { x: 0.2, y: 0.3 };
    image.transform!.annotations![0]!.points = [point, point];
    const copy = cloneCellImage(image);
    expect(copy.transform!.annotations![0]!.points[0]).not.toBe(point);
    expect(copy.transform!.annotations![0]!.points[0]).not.toBe(
      copy.transform!.annotations![0]!.points[1],
    );
  });
});
