import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate/browser";
import { describe, expect, test } from "vitest";
import { getActiveSheet, getDefaultRowHeight } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import {
  resolvePictureAnchorRect,
  type PictureFrame,
  type PictureFrameAnchor,
} from "@sheetcraft/core/picture-frame";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { decodeXlsx, encodeXlsx } from "../../index.js";
import { attr, child, nodes, parseXml, type XmlNode } from "../../pivot-xml.js";

const EMU = 9525;
const mediaSHA256 = "1365d2c8fd84751798e081d490d7dd8bc7ec7c090295455a76010cb7223a19b3";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type Marker = readonly [number, number, number, number];
type ProducerRecord = {
  kind: "oneCellAnchor" | "twoCellAnchor" | "absoluteAnchor";
  altText: string;
  mode: "fixed" | "move-only" | "move-and-size";
  start: Marker | null;
  end: Marker | null;
  size: readonly [number, number] | null;
  physical: readonly [number, number, number, number];
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  crop: readonly [number, number, number, number];
};
type Producer = { file: string; sha256: string; records: readonly ProducerRecord[] };
/**
 * Independently audited, byte-pinned WPS producer originals.
 * These are public-codec regressions; they do not claim Excel/WPS GUI acceptance.
 * The 12-object re-save retains oneCell anchors and 37.5/322.5-degree rotations;
 * the three independently rotated producer files use exactly 37 degrees.
 */
const producers: readonly Producer[] = [
  {
    file: "b2-wps-desktop-untouched.xlsx",
    sha256: "b2ad51aa05adc79dd4c4499922cffa0c0a34ed18b74e948b446d08d8379b56e1",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "fixed none",
        mode: "fixed",
        start: [0, 1050131, 1, 58341],
        end: [1, 1213961, 5, 58341],
        size: null,
        physical: [1049655, 286385, 1524000, 914400],
        rotation: 2250000,
        flipH: false,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "fixed horizontal",
        mode: "fixed",
        start: [0, 1050131, 6, 153591],
        end: [1, 1213961, 10, 153591],
        size: null,
        physical: [1049655, 1524635, 1524000, 914400],
        rotation: 19350000,
        flipH: true,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "fixed vertical",
        mode: "fixed",
        start: [0, 1050131, 12, 20241],
        end: [1, 1213961, 16, 20241],
        size: null,
        physical: [1049655, 2762885, 1524000, 914400],
        rotation: 19350000,
        flipH: false,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "fixed both",
        mode: "fixed",
        start: [0, 1050131, 17, 115491],
        end: [1, 1213961, 21, 115491],
        size: null,
        physical: [1049655, 4001135, 1524000, 914400],
        rotation: 2250000,
        flipH: true,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "oneCellAnchor",
        altText: "move-only none",
        mode: "move-only",
        start: [1, 97631, 22, 210741],
        end: null,
        size: [1524000, 914400],
        physical: [1457325, 5239385, 1524000, 914400],
        rotation: 2250000,
        flipH: false,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "oneCellAnchor",
        altText: "move-only horizontal",
        mode: "move-only",
        start: [1, 97631, 28, 77391],
        end: null,
        size: [1524000, 914400],
        physical: [1457325, 6477635, 1524000, 914400],
        rotation: 19350000,
        flipH: true,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "oneCellAnchor",
        altText: "move-only vertical",
        mode: "move-only",
        start: [1, 97631, 33, 172641],
        end: null,
        size: [1524000, 914400],
        physical: [1457325, 7715885, 1524000, 914400],
        rotation: 19350000,
        flipH: false,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "oneCellAnchor",
        altText: "move-only both",
        mode: "move-only",
        start: [1, 97631, 39, 39291],
        end: null,
        size: [1524000, 914400],
        physical: [1457325, 8954135, 1524000, 914400],
        rotation: 2250000,
        flipH: true,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "move-and-size none",
        mode: "move-and-size",
        start: [1, 97631, 44, 134541],
        end: [2, 669131, 48, 134541],
        size: null,
        physical: [1457325, 10192385, 1931670, 914400],
        rotation: 2250000,
        flipH: false,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "move-and-size horizontal",
        mode: "move-and-size",
        start: [1, 97631, 50, 1191],
        end: [2, 669131, 54, 1191],
        size: null,
        physical: [1457325, 11430635, 1931670, 914400],
        rotation: 19350000,
        flipH: true,
        flipV: false,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "move-and-size vertical",
        mode: "move-and-size",
        start: [1, 97631, 55, 96441],
        end: [2, 669131, 59, 96441],
        size: null,
        physical: [1457325, 12668885, 1931670, 914400],
        rotation: 19350000,
        flipH: false,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
      {
        kind: "twoCellAnchor",
        altText: "move-and-size both",
        mode: "move-and-size",
        start: [1, 97631, 60, 191691],
        end: [2, 669131, 64, 191691],
        size: null,
        physical: [1457325, 13907135, 1931670, 914400],
        rotation: 2250000,
        flipH: true,
        flipV: true,
        crop: [10000, 25000, 23333, 15000],
      },
    ],
  },
  {
    file: "b2-wps-producer-crop-none.xlsx",
    sha256: "cf056930cdc09fbde7e43e5747700ed6b7734081e18204d5cdee247a28cdf3db",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "asymmetric-native-source",
        mode: "move-only",
        start: [0, 9525, 0, 9525],
        end: [1, 695325, 4, 161925],
        size: null,
        physical: [9525, 9525, 1524000, 914400],
        rotation: 0,
        flipH: false,
        flipV: false,
        crop: [12667, 21875, 20667, 15625],
      },
    ],
  },
  {
    file: "b2-wps-producer-crop-horizontal.xlsx",
    sha256: "ff0aace3f894aaa4bbdc2ec9df2641a28dee800916ea5580871da9cf1a3c9270",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "asymmetric-native-source",
        mode: "move-only",
        start: [0, 9525, 0, 9525],
        end: [1, 695325, 4, 161925],
        size: null,
        physical: [9525, 9525, 1524000, 914400],
        rotation: 0,
        flipH: true,
        flipV: false,
        crop: [12667, 21875, 20667, 15625],
      },
    ],
  },
  {
    file: "b2-wps-producer-crop-v-rotate-move-only.xlsx",
    sha256: "12e7e3624f01a30d78d031b1dc40ff8889372c6080f465ce756fb8551b3a4435",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "asymmetric-native-source",
        mode: "move-only",
        start: [2, 238125, 10, 9525],
        end: [4, 85725, 14, 161925],
        size: null,
        physical: [1914525, 1914525, 1524000, 914400],
        rotation: 2220000,
        flipH: false,
        flipV: true,
        crop: [12667, 21875, 20667, 15625],
      },
    ],
  },
  {
    file: "b2-wps-producer-crop-v-rotate-fixed.xlsx",
    sha256: "1f190f403c5d2504b670e633a4bc28eec416dd0d2b8086e9ddf28876a9a50005",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "asymmetric-native-source",
        mode: "fixed",
        start: [2, 238125, 10, 9525],
        end: [4, 85725, 14, 161925],
        size: null,
        physical: [1914525, 1914525, 1524000, 914400],
        rotation: 2220000,
        flipH: false,
        flipV: true,
        crop: [12667, 21875, 20667, 15625],
      },
    ],
  },
  {
    file: "b2-wps-producer-crop-v-rotate-move-size.xlsx",
    sha256: "8b787ff590db1b093f65f81107b99233f15348a7d8468a803e53cab0a8406d64",
    records: [
      {
        kind: "twoCellAnchor",
        altText: "asymmetric-native-source",
        mode: "move-and-size",
        start: [2, 238125, 10, 9525],
        end: [4, 85725, 14, 161925],
        size: null,
        physical: [1914525, 1914525, 1524000, 914400],
        rotation: 2220000,
        flipH: false,
        flipV: true,
        crop: [12667, 21875, 20667, 15625],
      },
    ],
  },
];

const point = ([column, columnOffset, row, rowOffset]: Marker) => ({
  column: { index: column, offset: columnOffset / EMU },
  row: { index: row, offset: rowOffset / EMU },
});
function expectedAnchor(record: ProducerRecord): PictureFrameAnchor {
  if (record.mode === "fixed") {
    const [x, y, width, height] = record.physical;
    return {
      mode: "fixed",
      x: x / EMU,
      y: y / EMU,
      size: { width: width / EMU, height: height / EMU },
    };
  }
  if (!record.start) throw Error("Missing producer from marker.");
  const start = point(record.start);
  if (record.mode === "move-and-size") {
    if (!record.end) throw Error("Missing producer to marker.");
    return { mode: "move-and-size", offsetMode: "free-pixels", start, end: point(record.end) };
  }
  // Actual oneCellAnchor retains its anchor extent. The audited WPS twoCell /
  // editAs=oneCell producers use the physical xfrm extent under our move-only
  // compatibility policy; marker projection was 134px / 108px on Core's grid.
  const extent = record.size ?? [record.physical[2], record.physical[3]];
  const size = { width: extent[0] / EMU, height: extent[1] / EMU };
  return { mode: "move-only", offsetMode: "free-pixels", origin: start, size };
}
function expectSource(frame: PictureFrame, record: ProducerRecord) {
  let [left, top, right, bottom] = record.crop;
  if (record.flipH) [left, right] = [right, left];
  if (record.flipV) [top, bottom] = [bottom, top];
  const horizontal = 100000 - left - right;
  const vertical = 100000 - top - bottom;
  expect(frame.angleDeg).toBe(record.rotation / 60000);
  expect(!!frame.flipHorizontal).toBe(record.flipH);
  expect(!!frame.flipVertical).toBe(record.flipV);
  expect(frame.source.widthRatio).toBeCloseTo(100000 / horizontal, 12);
  expect(frame.source.heightRatio).toBeCloseTo(100000 / vertical, 12);
  expect(frame.source.offsetXRatio).toBeCloseTo((right - left) / (2 * horizontal), 12);
  expect(frame.source.offsetYRatio).toBeCloseTo((bottom - top) / (2 * vertical), 12);
}
function nativePictures(entries: Record<string, Uint8Array>) {
  const drawing = child(parseXml(entries["xl/drawings/drawing1.xml"]), "wsDr");
  return (["absoluteAnchor", "oneCellAnchor", "twoCellAnchor"] as const).flatMap((kind) =>
    nodes(drawing[kind]).map((anchor) => ({
      kind,
      anchor,
      pic: child(anchor, "pic"),
      altText: attr(child(child(child(anchor, "pic"), "nvPicPr"), "cNvPr"), "descr"),
    })),
  );
}
function rawMarker(anchor: XmlNode, tag: string): Marker {
  const marker = child(anchor, tag);
  return [Number(marker.col), Number(marker.colOff), Number(marker.row), Number(marker.rowOff)];
}

describe("byte-pinned actual WPS free-pixel producers", () => {
  test.each(producers)("decodes, snapshots and natively re-exports $file", async (producer) => {
    const bytes = readFileSync(new URL(`./fixtures/${producer.file}`, import.meta.url));
    expect(digest(bytes)).toBe(producer.sha256);
    const originalEntries = unzipSync(bytes);
    const sourcePictures = nativePictures(originalEntries);
    expect(sourcePictures).toHaveLength(producer.records.length);
    for (const record of producer.records) {
      const source = sourcePictures.find((item) => item.altText === record.altText)!;
      expect(source.kind).toBe(record.kind);
      if (record.start) expect(rawMarker(source.anchor, "from")).toEqual(record.start);
      if (record.end) expect(rawMarker(source.anchor, "to")).toEqual(record.end);
      const extent = child(child(child(source.pic, "spPr"), "xfrm"), "ext");
      expect([Number(attr(extent, "cx")), Number(attr(extent, "cy"))]).toEqual(
        record.physical.slice(2),
      );
    }
    const decoded = await decodeXlsx(bytes);
    const sheet = getActiveSheet(decoded.workbook);
    const sparse20 = producer.file !== "b2-wps-desktop-untouched.xlsx";
    if (sparse20) {
      expect(strFromU8(originalEntries["xl/worksheets/sheet1.xml"]!)).toContain(
        'defaultRowHeight="15"',
      );
      expect(getDefaultRowHeight(sheet)).toBe(20);
      expect([...sheet.rowHeights]).toEqual([]);
      expect(
        decoded.report.issues.some(
          (issue) =>
            issue.code === "dimension-approximated" &&
            issue.locations.includes(`${sheet.name}.defaultRowHeight`),
        ),
      ).toBe(false);
    }
    expect(sheet.floatingImages.map((image) => image.altText)).toEqual(
      producer.records.map((record) => record.altText),
    );
    expect(decoded.images).toHaveLength(1);
    expect(digest(decoded.images![0]!.bytes)).toBe(mediaSHA256);
    for (const [index, record] of producer.records.entries()) {
      const image = sheet.floatingImages[index]!;
      if (!isFramedPictureObject(image)) throw Error("Expected editable native picture.");
      expect(image.frame.anchor).toEqual(expectedAnchor(record));
      expectSource(image.frame, record);
      if (sparse20) {
        const rect = resolvePictureAnchorRect(image.frame.anchor, createPictureSheetMetrics(sheet));
        // Audited physical Y/height, independent of the implementation's metrics.
        expect(rect.y).toBe(producer.file.includes("-v-rotate-") ? 201 : 1);
        expect(rect.height).toBe(96);
      }
    }
    expect(decoded.report.issues.some((issue) => issue.severity === "block")).toBe(false);
    const geometryIssues = decoded.report.issues.filter(
      (issue) => issue.code === "picture-geometry-approximated",
    );
    expect(geometryIssues).toHaveLength(producer.records.length);
    expect(geometryIssues.every((issue) => issue.count === 1 && issue.locations.length === 1)).toBe(
      true,
    );
    expect(geometryIssues.map((issue) => issue.locations[0])).toEqual(
      sheet.floatingImages.map(
        (picture) => `${sheet.name}.floatingImages[${JSON.stringify(picture.id)}].anchor`,
      ),
    );
    const snapshot = serializeWorkbook(decoded.workbook);
    if (sparse20) expect(snapshot.version).toBe(87);
    else if (producer.records.some((record) => record.mode !== "fixed"))
      expect(snapshot.version).toBe(86);
    else expect(snapshot.version).toBeLessThan(86);
    const restored = deserializeWorkbook(JSON.parse(JSON.stringify(snapshot)));
    const restoredSnapshot = serializeWorkbook(restored);
    expect(restoredSnapshot.version).toBe(snapshot.version);
    // WPS also contributes unrelated preset-style catalogs whose hex casing is
    // canonicalized by snapshot parsing. Assert the entire picture collection,
    // including its new offset policy, without changing that existing behavior.
    expect(restoredSnapshot.sheets.map((value) => value.floatingImages)).toEqual(
      snapshot.sheets.map((value) => value.floatingImages),
    );
    const encoded = await encodeXlsx(restored, {
      images: decoded.images!.map((image) => ({ ...image, width: 160, height: 96 })),
    });
    const outputEntries = unzipSync(encoded.bytes);
    if (sparse20) {
      const xml = strFromU8(outputEntries["xl/worksheets/sheet1.xml"]!);
      expect(xml).toContain('defaultRowHeight="15"');
      expect(xml.match(/<row\b/g) ?? []).toEqual([]);
    }
    const media = Object.entries(outputEntries).filter(([path]) => path.endsWith(".png"));
    expect(media).toHaveLength(1);
    expect(digest(media[0]![1])).toBe(mediaSHA256);
    const outputPictures = nativePictures(outputEntries);
    expect(outputPictures).toHaveLength(producer.records.length);
    for (const record of producer.records) {
      const output = outputPictures.find((item) => item.altText === record.altText)!;
      expect(output.kind).toBe(
        record.mode === "fixed"
          ? "absoluteAnchor"
          : record.mode === "move-only"
            ? "oneCellAnchor"
            : "twoCellAnchor",
      );
      if (record.mode !== "fixed") expect(rawMarker(output.anchor, "from")).toEqual(record.start);
      if (record.mode === "move-and-size")
        expect(rawMarker(output.anchor, "to")).toEqual(record.end);
      if (record.mode === "fixed") {
        const position = child(output.anchor, "pos"),
          extent = child(output.anchor, "ext");
        expect([
          Number(attr(position, "x")),
          Number(attr(position, "y")),
          Number(attr(extent, "cx")),
          Number(attr(extent, "cy")),
        ]).toEqual(record.physical);
      }
      const crop = child(child(output.pic, "blipFill"), "srcRect");
      expect(["l", "t", "r", "b"].map((key) => Number(attr(crop, key)))).toEqual(record.crop);
      const transform = child(child(output.pic, "spPr"), "xfrm");
      if (sparse20) {
        expect(Number(attr(child(transform, "off"), "y"))).toBe(
          producer.file.includes("-v-rotate-") ? 1914525 : 9525,
        );
        expect(Number(attr(child(transform, "ext"), "cy"))).toBe(914400);
      }
      expect(Number(attr(transform, "rot", "0"))).toBe(record.rotation);
      expect(["1", "true"].includes(attr(transform, "flipH"))).toBe(record.flipH);
      expect(["1", "true"].includes(attr(transform, "flipV"))).toBe(record.flipV);
    }
    const again = await decodeXlsx(encoded.bytes);
    const nextSheet = getActiveSheet(again.workbook);
    if (sparse20) {
      expect(getDefaultRowHeight(nextSheet)).toBe(20);
      expect([...nextSheet.rowHeights]).toEqual([]);
    }
    expect(nextSheet.floatingImages.map((image) => image.altText)).toEqual(
      producer.records.map((record) => record.altText),
    );
    expect(digest(again.images![0]!.bytes)).toBe(mediaSHA256);
    for (const [index, record] of producer.records.entries()) {
      const image = nextSheet.floatingImages[index]!;
      const before = sheet.floatingImages[index]!;
      if (!isFramedPictureObject(image) || !isFramedPictureObject(before))
        throw Error("Expected native frame.");
      expectSource(image.frame, record);
      if (image.frame.anchor.mode === "move-only" && before.frame.anchor.mode === "move-only") {
        expect(image.frame.anchor.origin).toEqual(before.frame.anchor.origin);
        expect(image.frame.anchor.offsetMode).toBe("free-pixels");
      } else expect(image.frame.anchor).toEqual(before.frame.anchor);
      const previousRect = resolvePictureAnchorRect(
        before.frame.anchor,
        createPictureSheetMetrics(sheet),
      );
      const nextRect = resolvePictureAnchorRect(
        image.frame.anchor,
        createPictureSheetMetrics(nextSheet),
      );
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(nextRect[key] - previousRect[key])).toBeLessThanOrEqual(0.01);
      }
      if (sparse20) {
        expect(nextRect.y).toBe(producer.file.includes("-v-rotate-") ? 201 : 1);
        expect(nextRect.height).toBe(96);
      }
    }
    if (sparse20) {
      const twice = await encodeXlsx(again.workbook, {
        images: again.images!.map((image) => ({ ...image, width: 160, height: 96 })),
      });
      const twiceEntries = unzipSync(twice.bytes);
      expect(strFromU8(twiceEntries["xl/worksheets/sheet1.xml"]!)).toContain(
        'defaultRowHeight="15"',
      );
      expect(nativePictures(twiceEntries)).toEqual(outputPictures);
      expect(digest(Object.entries(twiceEntries).find(([path]) => path.endsWith(".png"))![1])).toBe(
        mediaSHA256,
      );
      const finalSheet = getActiveSheet((await decodeXlsx(twice.bytes)).workbook);
      expect(getDefaultRowHeight(finalSheet)).toBe(20);
      expect([...finalSheet.rowHeights]).toEqual([]);
      for (const image of finalSheet.floatingImages) {
        if (!isFramedPictureObject(image)) throw Error("Expected native frame after two exports.");
        const rect = resolvePictureAnchorRect(
          image.frame.anchor,
          createPictureSheetMetrics(finalSheet),
        );
        expect(rect.y).toBe(producer.file.includes("-v-rotate-") ? 201 : 1);
        expect(rect.height).toBe(96);
      }
    }
  });
});
