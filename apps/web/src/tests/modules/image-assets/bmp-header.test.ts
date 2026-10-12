import { expect, test } from "vitest";
import { bitmap } from "./bmp-header-fixtures";
import { inspectBmpImageHeader } from "../../../modules/image-assets/inspectBmpImageHeader";
import { ImageAssetError } from "../../../modules/image-assets/imageAssetValidation";

function expectCode(bytes: Uint8Array, code: ImageAssetError["code"]) {
  expect(() => inspectBmpImageHeader(bytes)).toThrowError(expect.objectContaining({ code }));
}

test.each([1, 4, 8, 16, 24, 32])("preflights uncompressed INFO BMP depth %s", (depth) => {
  expect(inspectBmpImageHeader(bitmap({ depth }))).toEqual({
    width: 3,
    height: 2,
    mimeType: "image/bmp",
  });
});
test.each([1, 4, 8, 24])("preflights CORE BMP depth %s", (depth) => {
  expect(inspectBmpImageHeader(bitmap({ header: 12, depth }))).toMatchObject({
    width: 3,
    height: 2,
  });
});
test.each([40, 108, 124])("preflights 16/32-bit BITFIELDS BMP header %s", (header) => {
  for (const depth of [16, 32])
    expect(inspectBmpImageHeader(bitmap({ header, depth }))).toMatchObject({ width: 3, height: 2 });
  for (const depth of [16, 32])
    expect(inspectBmpImageHeader(bitmap({ header, depth, compression: 3 }))).toMatchObject({
      width: 3,
      height: 2,
    });
});
test("top-down and nonzero Uint8Array offsets retain declared dimensions", () => {
  const source = bitmap({ height: -2 }),
    container = new Uint8Array(source.length + 6);
  container.set(source, 3);
  expect(inspectBmpImageHeader(container.subarray(3, -3))).toMatchObject({ width: 3, height: 2 });
});
test("uncompressed pixel byte count may be zero but not inconsistent", () => {
  const bytes = bitmap(),
    view = new DataView(bytes.buffer);
  view.setUint32(34, 0, true);
  expect(inspectBmpImageHeader(bytes)).toMatchObject({ width: 3, height: 2 });
  view.setUint32(34, 1, true);
  expectCode(bytes, "invalid-image");
});
test("partial palette is accepted only for covered pixel indices", () => {
  const bytes = bitmap({ depth: 8, colors: 2 }),
    view = new DataView(bytes.buffer);
  const offset = view.getUint32(10, true);
  bytes[offset] = 1;
  expect(inspectBmpImageHeader(bytes)).toMatchObject({ width: 3, height: 2 });
  bytes[offset] = 2;
  expectCode(bytes, "invalid-image");
});
test.each([1, 2, 4, 5, 6, 99])("does not pass compression mode %s to a decoder", (compression) => {
  expectCode(bitmap({ compression }), "unsupported-type");
});
test("rejects truncated headers, metadata overlap and pixel data before decode", () => {
  const source = bitmap();
  for (const length of [0, 1, 14, 17, 30, source.length - 1])
    expectCode(source.subarray(0, length), "invalid-image");
  const view = new DataView(source.buffer);
  view.setUint32(10, 15, true);
  expectCode(source, "invalid-image");
});
test("rejects invalid dimensions, planes, depth and oversized declarations", () => {
  for (const [offset, value, code] of [
    [18, 0, "invalid-image"],
    [18, 0xffffffff, "invalid-image"],
    [22, 0, "invalid-image"],
    [18, 16385, "pixel-limit"],
    [22, 0x80000000, "pixel-limit"],
  ] as const) {
    const source = bitmap();
    new DataView(source.buffer).setUint32(offset, value, true);
    expectCode(source, code);
  }
  const source = bitmap(),
    view = new DataView(source.buffer);
  view.setUint16(26, 2, true);
  expectCode(source, "invalid-image");
  view.setUint16(26, 1, true);
  view.setUint16(28, 7, true);
  expectCode(source, "invalid-image");
});
test("rejects unsafe or contradictory color masks", () => {
  for (const mask of [0, 0x7c00, 0xf400, 0x10000]) {
    const source = bitmap({ depth: 16, compression: 3 });
    new DataView(source.buffer).setUint32(54, mask, true);
    expectCode(source, "invalid-image");
  }
  const source = bitmap({ header: 108, depth: 32, compression: 3 });
  new DataView(source.buffer).setUint32(66, 0xff0000, true);
  expectCode(source, "invalid-image");
});
test("refuses linked and embedded profile modes rather than decoding external metadata", () => {
  for (const colorSpace of [0x4c494e4b, 0x4d424544, 123]) {
    const source = bitmap({ header: 124 });
    new DataView(source.buffer).setUint32(70, colorSpace, true);
    expectCode(source, "unsupported-type");
  }
  const source = bitmap({ header: 124 });
  new DataView(source.buffer).setUint32(126, 1, true);
  expectCode(source, "unsupported-type");
});
