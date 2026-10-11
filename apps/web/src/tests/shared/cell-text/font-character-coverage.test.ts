import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import coverage from "../../../modules/insert-tools/symbols/assets/font-coverage.json";
import { readFontCharacterCoverage } from "../../../shared/cell-text/font-character-coverage";

function format12(groups: readonly (readonly [number, number, number])[]): Uint8Array {
  const bytes = new Uint8Array(16 + groups.length * 12);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 12);
  view.setUint32(4, bytes.length);
  view.setUint32(12, groups.length);
  groups.forEach(([start, end, glyph], index) => {
    const offset = 16 + index * 12;
    view.setUint32(offset, start);
    view.setUint32(offset + 4, end);
    view.setUint32(offset + 8, glyph);
  });
  return bytes;
}
function format4(): Uint8Array {
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 4);
  view.setUint16(2, bytes.length);
  view.setUint16(6, 6);
  [0x42, 0x61, 0xffff].forEach((value, index) => view.setUint16(14 + index * 2, value));
  [0x41, 0x60, 0xffff].forEach((value, index) => view.setUint16(22 + index * 2, value));
  [-64, 5, 1].forEach((value, index) => view.setInt16(28 + index * 2, value));
  view.setUint16(36, 4);
  view.setUint16(40, 0);
  view.setUint16(42, 2);
  return bytes;
}
function sfnt(
  subtables: readonly Readonly<{ bytes: Uint8Array; platform: number; encoding: number }>[],
  glyphs = 100,
): Uint8Array {
  const cmapLength =
    4 + subtables.length * 8 + subtables.reduce((total, item) => total + item.bytes.length, 0);
  const bytes = new Uint8Array(44 + cmapLength + 6);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 2);
  view.setUint32(12, 0x636d6170);
  view.setUint32(20, 44);
  view.setUint32(24, cmapLength);
  view.setUint32(28, 0x6d617870);
  view.setUint32(36, 44 + cmapLength);
  view.setUint32(40, 6);
  view.setUint16(46, subtables.length);
  let offset = 4 + subtables.length * 8;
  subtables.forEach((item, index) => {
    const record = 48 + index * 8;
    view.setUint16(record, item.platform);
    view.setUint16(record + 2, item.encoding);
    view.setUint32(record + 4, offset);
    bytes.set(item.bytes, 44 + offset);
    offset += item.bytes.length;
  });
  view.setUint32(44 + cmapLength, 0x00010000);
  view.setUint16(48 + cmapLength, glyphs);
  return bytes;
}

describe("bounded SFNT Unicode font coverage", () => {
  test.each(coverage)("matches the independently verified complete $family cmap", async (font) => {
    const bytes = await readFile(resolve("src/shared/cell-text/fonts", font.filename));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(font.sha256);
    const result = readFontCharacterCoverage(bytes);
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.format).toBe(12);
    expect(result.ranges).toEqual(font.ranges);
    expect(result.count).toBe(
      font.ranges.reduce((total, [start, end]) => total + end! - start! + 1, 0),
    );
  });
  test("prefers one full Unicode cmap instead of combining a conflicting BMP table", () => {
    const bytes = sfnt([
      { bytes: format4(), platform: 3, encoding: 1 },
      {
        bytes: format12([
          [0x42, 0x42, 1],
          [0x1f600, 0x1f601, 2],
        ]),
        platform: 3,
        encoding: 10,
      },
    ]);
    expect(readFontCharacterCoverage(bytes)).toEqual({
      status: "supported",
      format: 12,
      count: 3,
      ranges: [
        [0x42, 0x42],
        [0x1f600, 0x1f601],
      ],
    });
  });
  test("handles format4 signed deltas, relative range offsets and zero glyphs", () => {
    const bytes = sfnt([{ bytes: format4(), platform: 3, encoding: 1 }]);
    expect(readFontCharacterCoverage(bytes)).toEqual({
      status: "supported",
      format: 4,
      count: 3,
      ranges: [
        [0x41, 0x42],
        [0x61, 0x61],
      ],
    });
  });
  test("handles sliced Uint8Array inputs, excludes glyph0 and surrogate code points", () => {
    const bytes = sfnt([
      {
        bytes: format12([
          [0x40, 0x42, 0],
          [0xd800, 0xd801, 3],
        ]),
        platform: 0,
        encoding: 4,
      },
    ]);
    const outer = new Uint8Array(bytes.length + 8);
    outer.set(bytes, 4);
    expect(readFontCharacterCoverage(outer.subarray(4, 4 + bytes.length))).toEqual({
      status: "supported",
      format: 12,
      count: 2,
      ranges: [[0x41, 0x42]],
    });
  });
  test("does not call unsupported containers/cmap formats empty or universally supported", () => {
    const woff = new Uint8Array(12);
    new DataView(woff.buffer).setUint32(0, 0x774f4646);
    expect(readFontCharacterCoverage(woff)).toEqual({ status: "unsupported", reason: "container" });
    const lastResort = format12([[0x41, 0x42, 1]]);
    new DataView(lastResort.buffer).setUint16(0, 13);
    expect(
      readFontCharacterCoverage(
        sfnt([
          { bytes: format4(), platform: 3, encoding: 1 },
          { bytes: lastResort, platform: 0, encoding: 6 },
        ]),
      ),
    ).toEqual({ status: "unsupported", reason: "format" });
    expect(
      readFontCharacterCoverage(sfnt([{ bytes: format4(), platform: 3, encoding: 0 }])),
    ).toEqual({
      status: "unsupported",
      reason: "cmap",
    });
  });
  test.each([
    { groups: [[0x42, 0x41, 1]] },
    {
      groups: [
        [0x41, 0x43, 1],
        [0x42, 0x44, 4],
      ],
    },
    { groups: [[0x110000, 0x110000, 1]] },
    { groups: [[0x41, 0x42, 99]] },
  ] as const)("rejects malformed/overlapping/out-of-range format12 groups %#", ({ groups }) => {
    expect(
      readFontCharacterCoverage(sfnt([{ bytes: format12(groups), platform: 3, encoding: 10 }])),
    ).toEqual({
      status: "unsupported",
      reason: "malformed",
    });
  });
  test("rejects truncated records, bad pointers and missing format4 sentinel", () => {
    const bytes = sfnt([{ bytes: format4(), platform: 3, encoding: 1 }]);
    expect(readFontCharacterCoverage(bytes.subarray(0, bytes.length - 1))).toEqual({
      status: "unsupported",
      reason: "malformed",
    });
    const pointer = format4();
    new DataView(pointer.buffer).setUint16(36, 2);
    expect(readFontCharacterCoverage(sfnt([{ bytes: pointer, platform: 3, encoding: 1 }]))).toEqual(
      { status: "unsupported", reason: "malformed" },
    );
    const noSentinel = format4();
    new DataView(noSentinel.buffer).setUint16(18, 0xfffe);
    expect(
      readFontCharacterCoverage(sfnt([{ bytes: noSentinel, platform: 3, encoding: 1 }])),
    ).toEqual({ status: "unsupported", reason: "malformed" });
  });
});
