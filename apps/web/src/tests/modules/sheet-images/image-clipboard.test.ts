import { describe, expect, test } from "vitest";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  readFloatingImageTransfer,
  serializeFloatingImageClipboard,
  FLOATING_IMAGE_CLIPBOARD_TYPE,
} from "../../../modules/sheet-images/imageClipboard";

const images: FloatingImage[] = [0, 1].map((index) => ({
  id: `source-${index}`,
  assetId: `asset-${index}`,
  altText: "Synthetic",
  groupId: "group",
  anchor: { row: 0, column: 0 },
  offsetX: 20 + index * 190,
  offsetY: 30 + index * 100,
  width: 100,
  height: 50,
  transform: { rotation: 90 },
}));
const read = (value: string) =>
  readFloatingImageTransfer({
    getData: (type) => (type === FLOATING_IMAGE_CLIPBOARD_TYPE ? value : ""),
  });
describe("complete floating picture clipboard payload", () => {
  test("roundtrips a tagged group without discarding padding or relative gaps", () => {
    const value = serializeFloatingImageClipboard(images[0]!, images);
    expect(JSON.parse(value).clipboardCoordinateSpace).toBe("group-relative-sheet-pixels-v1");
    expect(read(value)).toEqual({ floatingImage: images[0], floatingImages: images });
  });
  test("keeps legacy single images and groups with a provable shared anchor", () => {
    expect(read(JSON.stringify(images[0]))).toEqual({ floatingImage: images[0] });
    const legacy = images.map((image) => ({ ...image, anchor: { row: 4, column: 5 } }));
    expect(read(JSON.stringify({ ...legacy[0], clipboardImages: legacy })).floatingImages).toEqual(
      images,
    );
  });
  test.each([
    { clipboardImages: [images[0], images[0]] },
    { clipboardImages: [images[0], { ...images[1], anchor: { row: 2, column: 3 } }] },
    { clipboardImages: [{ ...images[0], id: "missing-primary" }, images[1]] },
    { clipboardImages: [images[0]] },
    { clipboardImages: "invalid" },
    { clipboardImages: images, clipboardCoordinateSpace: "unknown" },
  ])(
    "rejects an invalid group atomically instead of returning its primary picture: %j",
    (invalid) => {
      expect(read(JSON.stringify({ ...images[0], ...invalid }))).toEqual({
        invalidFloatingImage: true,
      });
    },
  );
  test("bounds payload size and distinguishes missing from malformed image metadata", () => {
    expect(read("")).toEqual({});
    expect(read("{")).toEqual({ invalidFloatingImage: true });
    expect(read("x".repeat(2_000_001))).toEqual({ invalidFloatingImage: true });
  });
});
