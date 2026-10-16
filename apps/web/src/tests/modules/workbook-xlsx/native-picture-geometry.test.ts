import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { getActiveSheet, type Workbook } from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame, pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { encodeXlsx, decodeXlsx } from "@sheetcraft/xlsx-io";
import {
  prepareXlsxImages,
  assertXlsxPictureGeometrySupport,
} from "../../../modules/workbook-xlsx/prepareXlsxImages";
import { createUiNativeGeometryFixture } from "./fixtures/native-geometry-fixture";

const bytes = new Uint8Array(
  readFileSync("src/tests/modules/workbook-xlsx/fixtures/asymmetric-native-source.png"),
);
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
function store(mimeType = "image/png") {
  return {
    get: vi.fn(async () => ({
      id: "original-asymmetric",
      mimeType,
      width: 160,
      height: 96,
      blob: new Blob([bytes], { type: mimeType }),
    })),
    put: vi.fn(),
  };
}
function corners(workbook: Workbook, picture: FramedFloatingImage) {
  const geometry = resolvePictureFrame(
    picture.frame,
    createPictureSheetMetrics(getActiveSheet(workbook)),
  );
  return geometry.corners;
}
function sample(workbook: Workbook, picture: FramedFloatingImage, u: number, v: number) {
  const { rect, sourceRect } = resolvePictureFrame(
    picture.frame,
    createPictureSheetMetrics(getActiveSheet(workbook)),
  );
  const x = sourceRect!.x - rect.x + (picture.frame.flipHorizontal ? 1 - u : u) * sourceRect!.width;
  const y = sourceRect!.y - rect.y + (picture.frame.flipVertical ? 1 - v : v) * sourceRect!.height;
  return pictureFrameLocalToWorld(rect, picture.frame.angleDeg, { x, y });
}
test.each([100, 83])(
  "real UI crop/rotate/flip commands roundtrip three native anchors, column px=%s",
  async (columnWidth) => {
    const f = createUiNativeGeometryFixture({ columnWidth });
    const before = serializeWorkbook(f.workbook),
      assets = store(),
      canvas = vi.spyOn(document, "createElement");
    assertXlsxPictureGeometrySupport(f.workbook);
    const prepared = await prepareXlsxImages(before, assets);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]!.transform).toBeUndefined();
    expect(sha(new Uint8Array(prepared[0]!.bytes))).toBe(sha(bytes));
    expect(canvas.mock.calls.some(([name]) => name === "canvas")).toBe(false);
    canvas.mockRestore();
    expect(assets.put).not.toHaveBeenCalled();
    const result = await encodeXlsx(f.workbook, {
      images: prepared.map((p) => ({ ...p, bytes: new Uint8Array(p.bytes) })),
    });
    expect(
      result.report.issues
        .filter((i) => i.code === "style-omitted")
        .reduce((n, i) => n + i.count, 0),
    ).toBe(12);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    const zip = unzipSync(result.bytes),
      xml = strFromU8(zip["xl/drawings/drawing1.xml"]!);
    expect((xml.match(/<a:srcRect/g) ?? []).length).toBe(12);
    expect((xml.match(/<xdr:absoluteAnchor>/g) ?? []).length).toBe(4);
    expect((xml.match(/<xdr:oneCellAnchor>/g) ?? []).length).toBe(4);
    expect((xml.match(/<xdr:twoCellAnchor>/g) ?? []).length).toBe(4);
    expect(Object.keys(zip).filter((k) => k.startsWith("xl/media/"))).toHaveLength(1);
    const imported = await decodeXlsx(result.bytes);
    expect(imported.images).toHaveLength(1);
    expect(sha(imported.images![0]!.bytes)).toBe(sha(bytes));
    const images = getActiveSheet(imported.workbook).floatingImages as FramedFloatingImage[];
    for (let i = 0; i < images.length; i++) {
      const original = f.pictures[i]!,
        next = images[i]!;
      expect(next.frame.anchor.mode).toBe(original.frame.anchor.mode);
      expect(next.frame.angleDeg).toBe(original.frame.angleDeg);
      expect(!!next.frame.flipHorizontal).toBe(!!original.frame.flipHorizontal);
      expect(!!next.frame.flipVertical).toBe(!!original.frame.flipVertical);
      expect(next.transform?.appearance?.suppressThemeEffects).toEqual({
        shadow: true,
        outline: true,
        reflection: true,
        bevel: true,
      });
      corners(f.workbook, original).forEach((point, index) => {
        const actual = corners(imported.workbook, next)[index]!;
        expect(Math.hypot(actual.x - point.x, actual.y - point.y)).toBeLessThanOrEqual(0.01);
      });
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [0.2, 0.7],
      ]) {
        const a = sample(f.workbook, original, u!, v!),
          b = sample(imported.workbook, next, u!, v!);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(0.01);
      }
    }
    const again = await encodeXlsx(imported.workbook, {
      images: imported.images!.map((a) => ({ ...a, width: 160, height: 96 })),
    });
    expect(again.report.issues).toEqual([]);
    expect(sha((await decodeXlsx(again.bytes)).images![0]!.bytes)).toBe(sha(bytes));
  },
);
test("native frames never fall back to rasterization for unsupported source MIME", async () => {
  const f = createUiNativeGeometryFixture(),
    snapshot = serializeWorkbook(f.workbook),
    assets = store("image/webp");
  const canvas = vi.spyOn(document, "createElement");
  await expect(prepareXlsxImages(snapshot, assets)).rejects.toMatchObject({
    name: "XlsxWorkerFailure",
    report: { issues: [{ severity: "block" }] },
  });
  expect(canvas.mock.calls.some(([name]) => name === "canvas")).toBe(false);
  canvas.mockRestore();
  expect(assets.put).not.toHaveBeenCalled();
  expect(serializeWorkbook(f.workbook)).toEqual(snapshot);
});
test("padding and dormant styling fail before asset lookup", async () => {
  for (const mode of ["padding", "dormant"]) {
    const f = createUiNativeGeometryFixture(),
      picture = f.pictures[0]!;
    if (mode === "padding") picture.frame.source.widthRatio = 0.5;
    else picture.transform = { appearance: { detailedStyle: { shadow: { kind: "none" } } } };
    const assets = store();
    await expect(prepareXlsxImages(serializeWorkbook(f.workbook), assets)).rejects.toThrow();
    expect(assets.get).not.toHaveBeenCalled();
    expect(assets.put).not.toHaveBeenCalled();
  }
});
