import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import * as orientation from "../../picture-source-orientation.js";
import { encodeXlsx, decodeXlsx } from "../../index.js";
const bytes = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
afterEach(() => vi.restoreAllMocks());
test("one orientation scan per original source, even when plain reference appears first", async () => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" }),
    sheet = getActiveSheet(workbook);
  sheet.floatingImages = Array.from({ length: 12 }, (_, index): FramedFloatingImage => ({
    id: `p${index}`,
    assetId: "one",
    altText: "",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 20 + index * 100, size: { width: 120, height: 80 } },
      source: { widthRatio: index === 0 ? 1 : 2, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  }));
  const scan = vi.spyOn(orientation, "assertNativePictureSourceOrientation");
  const encoded = await encodeXlsx(workbook, {
    images: [{ assetId: "one", bytes, extension: "png", width: 32, height: 32 }],
  });
  expect(scan).toHaveBeenCalledTimes(1);
  scan.mockClear();
  await decodeXlsx(encoded.bytes);
  // ZIP preflight and codec decode independently inspect newly decoded bytes.
  // Each phase scans once, rather than once per referencing picture.
  expect(scan).toHaveBeenCalledTimes(2);
});
