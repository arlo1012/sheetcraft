// @vitest-environment node
import { expect, test, vi } from "vitest";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
const fixtures = vi.hoisted(() => ({
  raster: vi.fn(),
  canvas: { width: 32, height: 24, toDataURL: vi.fn(() => "data:image/png;base64,c2FtcGxl") },
}));
vi.mock("../../../../shared/images/picture-detailed-compositor", () => ({
  createDetailedPictureRaster: fixtures.raster,
}));
import { picturePresetPreview } from "../../../../modules/sheet-images/picture-preset-preview";
test("preview adapter uses a bounded own sample and disposes its canvas after encoding", () => {
  fixtures.raster.mockReturnValue({ kind: "ready", canvas: fixtures.canvas });
  const result = picturePresetPreview({ fill: { kind: "none" } });
  expect(result).toBe("data:image/png;base64,c2FtcGxl");
  expect(fixtures.raster).toHaveBeenLastCalledWith(
    expect.objectContaining({
      widthPx: 32,
      heightPx: 24,
      pixelDensity: 2,
      limits: { side: 512, pixels: 262144, memoryBytes: 16 * 1024 * 1024 },
      sourcePainter: expect.any(Function),
    }),
  );
  expect(fixtures.canvas.width).toBe(0);
  expect(fixtures.canvas.height).toBe(0);
  fixtures.raster.mockClear();
  picturePresetPreview({ fill: { kind: "none" } });
  expect(fixtures.raster).not.toHaveBeenCalled();
});
test("cache identity includes the live workbook theme", () => {
  fixtures.raster.mockReturnValue({ kind: "ready", canvas: fixtures.canvas });
  fixtures.raster.mockClear();
  picturePresetPreview(
    { fill: { kind: "none" } },
    { ...DEFAULT_WORKBOOK_THEME, name: "Other theme" },
  );
  expect(fixtures.raster).toHaveBeenCalledTimes(1);
});
test("unavailable resources and bad encoding reject instead of displaying a false successful sample", () => {
  fixtures.raster.mockReturnValue({ kind: "unavailable" });
  expect(() => picturePresetPreview({ line: { kind: "none" } })).toThrow();
  fixtures.raster.mockReturnValue({ kind: "ready", canvas: fixtures.canvas });
  fixtures.canvas.toDataURL.mockReturnValueOnce("data:,invalid");
  expect(() => picturePresetPreview({ shadow: { kind: "none" } })).toThrow();
  expect(fixtures.canvas.width).toBe(0);
  fixtures.canvas.toDataURL.mockImplementationOnce(() => {
    throw Error("encoding failed");
  });
  expect(() => picturePresetPreview({ reflection: { kind: "none" } })).toThrow("encoding failed");
  expect(fixtures.canvas.height).toBe(0);
});
