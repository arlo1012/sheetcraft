import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureFrame } from "@sheetcraft/core/picture-frame";
import { encodeXlsx, decodeXlsx } from "@sheetcraft/xlsx-io";
import { paintFramedPictureContent } from "../../../modules/sheet-images/framed-picture-painter";
import {
  resolvePictureThemeEffects,
  hasVisibleDrawingThemeEffects,
} from "../../../shared/images/picture-inherited-effects";
import {
  prepareXlsxImages,
  assertXlsxPictureGeometrySupport,
} from "../../../modules/workbook-xlsx/prepareXlsxImages";

const bytes = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    fillText: vi.fn(),
    globalAlpha: 1,
  };
}

test("default source really renders inherited effects; plain native import renders none and reexports without baking", async () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const sheet = getActiveSheet(workbook);
  const picture: FramedFloatingImage = {
    id: "plain",
    assetId: "source",
    altText: "Plain",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 120, height: 80 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  };
  sheet.floatingImages.push(picture);
  const source = { naturalWidth: 32, naturalHeight: 32 } as HTMLImageElement;
  const paint = (image: FramedFloatingImage, effects = DEFAULT_WORKBOOK_THEME.effects) => {
    const ctx = context();
    paintFramedPictureContent(
      ctx as unknown as CanvasRenderingContext2D,
      source,
      image,
      resolvePictureFrame(image.frame, createPictureSheetMetrics(sheet)),
      effects,
    );
    return ctx;
  };
  expect(
    hasVisibleDrawingThemeEffects(resolvePictureThemeEffects(undefined, workbook.theme.effects)),
  ).toBe(true);
  const originalPaint = paint(picture);
  expect(originalPaint).toHaveProperty("shadowBlur", 8);
  expect(originalPaint.strokeRect).toHaveBeenCalled();
  const before = serializeWorkbook(workbook);
  const encoded = await encodeXlsx(workbook, {
    images: [{ assetId: "source", bytes, extension: "png", width: 32, height: 32 }],
  });
  expect(encoded.report.issues).toContainEqual({
    code: "style-omitted",
    severity: "warning",
    count: 1,
    locations: ['Pictures.floatingImages["plain"].inheritedThemeEffects'],
  });
  expect(serializeWorkbook(workbook)).toEqual(before);
  const decoded = await decodeXlsx(encoded.bytes);
  const imported = getActiveSheet(decoded.workbook).floatingImages[0] as FramedFloatingImage;
  const futureTheme = { ...DEFAULT_WORKBOOK_THEME.effects, reflection: true, bevel: true };
  expect(
    hasVisibleDrawingThemeEffects(
      resolvePictureThemeEffects(imported.transform?.appearance, futureTheme),
    ),
  ).toBe(false);
  const importedPaint = paint(imported, futureTheme);
  expect(importedPaint.drawImage).toHaveBeenCalledOnce();
  expect(importedPaint.strokeRect).not.toHaveBeenCalled();
  expect(importedPaint.stroke).not.toHaveBeenCalled();
  expect(importedPaint).not.toHaveProperty("shadowBlur");
  const decodeImage = vi.fn();
  vi.stubGlobal("Image", decodeImage);
  try {
    const importedAsset = decoded.images![0]!;
    const prepared = await prepareXlsxImages(serializeWorkbook(decoded.workbook), {
      get: async () => ({
        id: importedAsset.assetId,
        mimeType: "image/png",
        width: 32,
        height: 32,
        blob: new Blob([bytes], { type: "image/png" }),
      }),
      put: async () => {},
    });
    expect(decodeImage).not.toHaveBeenCalled();
    expect(prepared[0]?.transform).toBeUndefined();
    expect(new Uint8Array(prepared[0]!.bytes)).toEqual(bytes);
    expect(
      (
        await encodeXlsx(decoded.workbook, {
          images: prepared.map((asset) => ({ ...asset, bytes: new Uint8Array(asset.bytes) })),
        })
      ).report.issues,
    ).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("Web preflight rejects suppression plus other transforms before normalization", () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const sheet = getActiveSheet(workbook);
  const flags = { shadow: true, outline: true, reflection: true, bevel: true } as const;
  for (const transform of [
    { appearance: { suppressThemeEffects: { shadow: true } } },
    { appearance: { suppressThemeEffects: flags, opacity: 1 } },
    { appearance: { suppressThemeEffects: flags }, rotation: 0 },
  ]) {
    sheet.floatingImages = [
      {
        id: "plain",
        assetId: "source",
        altText: "Plain",
        transform: transform as FramedFloatingImage["transform"],
        frame: {
          kind: "object-frame-v1",
          anchor: { mode: "fixed", x: 20, y: 30, size: { width: 120, height: 80 } },
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
        },
      },
    ];
    expect(() => assertXlsxPictureGeometrySupport(workbook)).toThrow();
  }
});
