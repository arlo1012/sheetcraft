import { expect, test } from "vitest";
import { assertNativePictureSourceOrientation as check } from "../../picture-source-orientation.js";

function tiff(value: number | null = 1, little = true, duplicate = false): Uint8Array {
  const count = value === null ? 0 : duplicate ? 2 : 1;
  const bytes = new Uint8Array(8 + 2 + count * 12 + 4),
    view = new DataView(bytes.buffer);
  bytes.set(little ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, count, little);
  for (let i = 0; i < count; i++) {
    const o = 10 + i * 12;
    view.setUint16(o, 0x112, little);
    view.setUint16(o + 2, 3, little);
    view.setUint32(o + 4, 1, little);
    view.setUint16(o + 8, value!, little);
  }
  return bytes;
}
const segment = (marker: number, payload: Uint8Array) =>
  new Uint8Array([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
const exif = (data: Uint8Array) =>
  segment(0xe1, new Uint8Array([69, 120, 105, 102, 0, 0, ...data]));
const jpeg = (...segments: Uint8Array[]) =>
  new Uint8Array([255, 216, ...segments.flatMap((s) => [...s]), 255, 217]);
const scan = () => segment(0xda, new Uint8Array([1, 1, 0, 0, 63, 0]));
function png(...chunks: { kind: string; data: Uint8Array }[]) {
  const chunk = ({ kind, data }: { kind: string; data: Uint8Array }) => {
    const b = new Uint8Array(data.length + 12);
    new DataView(b.buffer).setUint32(0, data.length);
    b.set(
      [...kind].map((c) => c.charCodeAt(0)),
      4,
    );
    b.set(data, 8);
    return [...b];
  };
  return new Uint8Array([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk({ kind: "IHDR", data: new Uint8Array(13) }),
    ...chunks.flatMap(chunk),
    ...chunk({ kind: "IEND", data: new Uint8Array() }),
  ]);
}
test.each([true, false])("accepts primary EXIF orientation1/absent, endian %s", (little) => {
  for (const orientation of [1, null])
    expect(() => check(jpeg(exif(tiff(orientation, little))), "jpeg")).not.toThrow();
});
test.each([0, 2, 3, 4, 5, 6, 7, 8, 9])("rejects nonidentity/invalid orientation %s", (value) => {
  expect(() => check(jpeg(exif(tiff(value))), "jpeg")).toThrow(/orientation metadata/);
});
test("rejects duplicates, unknown APP1, offsets, counts, types and truncation", () => {
  const badOffset = tiff();
  new DataView(badOffset.buffer).setUint32(4, 0xffffffff, true);
  const badCount = tiff();
  new DataView(badCount.buffer).setUint16(8, 65535, true);
  const badType = tiff();
  new DataView(badType.buffer).setUint16(12, 4, true);
  for (const value of [tiff(1, true, true), badOffset, badCount, badType, tiff().subarray(0, 12)])
    expect(() => check(jpeg(exif(value)), "jpeg")).toThrow();
  expect(() => check(jpeg(exif(tiff()), exif(tiff())), "jpeg")).toThrow();
  expect(() => check(jpeg(segment(0xe1, new Uint8Array([88, 77, 80]))), "jpeg")).toThrow();
});
test("scans progressive/multiscan metadata beyond SOS without treating FF00/RST as segments", () => {
  const entropy = new Uint8Array([1, 2, 255, 0, 225, 3, 255, 208, 4]);
  expect(() => check(jpeg(scan(), entropy, scan(), entropy), "jpeg")).not.toThrow();
  expect(() => check(jpeg(scan(), entropy, exif(tiff(6)), scan(), entropy), "jpeg")).toThrow();
  expect(() => check(jpeg(scan(), entropy, exif(tiff(1)), scan(), entropy), "jpeg")).not.toThrow();
  expect(() => check(new Uint8Array([255, 216, ...scan(), 1, 2, 255]), "jpeg")).toThrow();
});
test("PNG eXIf has the same bounded orientation contract", () => {
  expect(() => check(png(), "png")).not.toThrow();
  expect(() => check(png({ kind: "eXIf", data: tiff(1, false) }), "png")).not.toThrow();
  expect(() => check(png({ kind: "eXIf", data: tiff(6) }), "png")).toThrow();
  expect(() =>
    check(png({ kind: "eXIf", data: tiff() }, { kind: "eXIf", data: tiff() }), "png"),
  ).toThrow();
  expect(() => check(png({ kind: "eXIf", data: tiff().subarray(0, 4) }), "png")).toThrow();
  const bad = png();
  new DataView(bad.buffer).setUint32(8, 0xffffffff);
  expect(() => check(bad, "png")).toThrow();
});
