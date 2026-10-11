import { describe, expect, test } from "vitest";
import { inspectEncodedImageHeader } from "../../../modules/image-assets/inspectEncodedImageHeader";
import {
  assertImagePixelBudget,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  ImageAssetError,
} from "../../../modules/image-assets/imageAssetValidation";
import {
  actualGif,
  actualPng,
  actualWebp,
  concat,
  png,
  pngChunk,
  jpeg,
  gif,
  uint32,
  vp8,
  vp8l,
  vp8x,
  webp,
  webpChunk,
  webpFrame,
} from "./image-header-fixtures";
const expectError = (bytes: Uint8Array, code = "invalid-image") => {
  try {
    inspectEncodedImageHeader(bytes);
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(ImageAssetError);
    expect(error).toMatchObject({ code });
  }
};
describe("encoded picture budget before platform decoding", () => {
  test.each([
    [8192, 4096],
    [MAX_IMAGE_SIDE, 2048],
    [1, 1],
    [6000, 4000],
  ])("accepts product budget boundary %s×%s", (width, height) => {
    expect(assertImagePixelBudget(width, height)).toEqual({ width, height });
  });
  test.each([
    [8192, 4097],
    [MAX_IMAGE_SIDE + 1, 1],
    [1, MAX_IMAGE_SIDE + 1],
  ])("rejects over-budget %s×%s", (width, height) => {
    expect(() => assertImagePixelBudget(width, height)).toThrowError(
      expect.objectContaining({ code: "pixel-limit" }),
    );
  });
  test.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [NaN, 1],
    [Infinity, 1],
    [1.5, 2],
    [MAX_IMAGE_PIXELS, MAX_IMAGE_PIXELS],
  ])("rejects invalid or excessive %s×%s", (width, height) => {
    expect(() => assertImagePixelBudget(width, height)).toThrow(ImageAssetError);
  });
  test.each([
    [actualPng, "image/png"],
    [actualGif, "image/gif"],
    [actualWebp, "image/webp"],
    [jpeg(), "image/jpeg"],
    [webp(vp8l()), "image/webp"],
    [webp(vp8()), "image/webp"],
    [webp(vp8x(), webpChunk("EXIF", Uint8Array.of(1)), vp8l()), "image/webp"],
  ] as const)("reads bounded %s format declarations", (bytes, mimeType) => {
    expect(inspectEncodedImageHeader(bytes)).toEqual({ width: 8, height: 4, mimeType });
  });
  test("respects Uint8Array subview offsets", () => {
    const padded = concat(Uint8Array.of(1, 2, 3), actualPng, Uint8Array.of(4));
    expect(inspectEncodedImageHeader(padded.subarray(3, padded.length - 1)).width).toBe(8);
  });
  test.each([
    png(16385, 1),
    jpeg(8192, 4097),
    gif(65535, 1),
    webp(vp8l(8192, 4097)),
    webp(vp8x(20000, 1), vp8l()),
  ])("rejects declared budget before decoding", (bytes) => expectError(bytes, "pixel-limit"));
  test("validates PNG header CRC and allowed depth/color fields", () => {
    const broken = actualPng.slice();
    broken[29] = broken[29]! ^ 1;
    expectError(broken);
    expectError(png(8, 4, [], [4, 6, 0, 0, 0]));
    expectError(png(8, 4, [], [8, 6, 1, 0, 0]));
    expectError(png(0, 4));
  });
  test("checks PNG chunk bounds/end and declared APNG frame dimensions", () => {
    expectError(actualPng.subarray(0, actualPng.length - 1));
    expectError(concat(actualPng, Uint8Array.of(0)));
    const huge = concat(uint32(0), uint32(20000), uint32(1), new Uint8Array(14));
    expectError(png(8, 4, [pngChunk("fcTL", huge)]), "pixel-limit");
    const outside = concat(uint32(0), uint32(9), uint32(4), new Uint8Array(14));
    expectError(png(8, 4, [pngChunk("fcTL", outside)]));
    const corrupt = png();
    corrupt.set(uint32(0xffffffff), 33);
    expectError(corrupt);
  });
  test.each([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])(
    "reads SOF marker %s without mistaking DHT/JPG/DAC for frames",
    (marker) => {
      expect(inspectEncodedImageHeader(jpeg(8, 4, marker)).width).toBe(8);
    },
  );
  test.each([0xc4, 0xc8, 0xcc])("non-SOF %s cannot supply dimensions", (marker) =>
    expectError(jpeg(8, 4, marker)),
  );
  test("rejects JPEG zero/DNL dimensions and malformed segment lengths", () => {
    expectError(jpeg(8, 0));
    const broken = jpeg();
    broken[5] = 1;
    expectError(broken);
    expectError(jpeg().subarray(0, 16));
    expectError(Uint8Array.of(255, 216, 255, 218, 0, 2));
  });
  test("checks GIF declared frame budgets in addition to screen", () => {
    expectError(gif(8, 4, 65535, 1), "pixel-limit");
    expectError(gif().subarray(0, 24));
    const broken = gif();
    broken[24] = 250;
    expectError(broken);
  });
  test("budgets GIF frame offsets that can expand the decoded logical canvas", () => {
    const shifted = gif(1, 1);
    new DataView(shifted.buffer).setUint16(14, 65535, true);
    new DataView(shifted.buffer).setUint16(16, 65535, true);
    expectError(shifted, "pixel-limit");
    const modest = gif(1, 1);
    new DataView(modest.buffer).setUint16(14, 1, true);
    expect(inspectEncodedImageHeader(modest)).toMatchObject({ width: 2, height: 1 });
    expectError(gif(4096, 8192, 8192, 4096), "pixel-limit");
  });
  test("validates RIFF length, chunk bounds, padding and VP8L version", () => {
    const broken = webp(vp8l());
    broken[4] = broken[4]! + 1;
    expectError(broken);
    expectError(webp(vp8l(8, 4, 1)));
    expectError(webp(vp8l()).subarray(0, 25));
    const short = webp(vp8l());
    short.set(uint32(0xffffffff, true), 16);
    expectError(short);
    expectError(webp(vp8x(9, 4), vp8l(8, 4)));
  });
  test("validates animated WebP frame budgets, bounds and actual frame header consistency", () => {
    const anim = webpChunk("ANIM", new Uint8Array(6));
    expect(inspectEncodedImageHeader(webp(vp8x(8, 4, true), anim, webpFrame()))).toEqual({
      width: 8,
      height: 4,
      mimeType: "image/webp",
    });
    expectError(webp(vp8x(8, 4, true), anim, webpFrame(9, 4)));
    expectError(webp(vp8x(8, 4, true), anim, webpFrame(8, 4, vp8l(7, 4))));
    expectError(webp(vp8x(8, 4, true), anim, webpFrame(8, 4, vp8l(), 2, 0)));
    expectError(webp(vp8x(8, 4, true), anim, webpFrame(20000, 1)), "pixel-limit");
  });
  test("all truncated prefixes produce only typed errors or an already verified JPEG SOF", () => {
    for (const bytes of [actualPng, actualGif, actualWebp, jpeg()])
      for (let length = 0; length < bytes.length; length++) {
        try {
          expect(inspectEncodedImageHeader(bytes.subarray(0, length))).toEqual({
            width: 8,
            height: 4,
            mimeType: "image/jpeg",
          });
        } catch (error) {
          expect(error).toBeInstanceOf(ImageAssetError);
        }
      }
  });
  test("unknown magic cannot be promoted by a MIME hint", () =>
    expectError(Uint8Array.of(1, 2, 3, 4), "unsupported-type"));
});
