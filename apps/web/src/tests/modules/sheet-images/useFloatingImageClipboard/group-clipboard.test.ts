import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  type LegacyFloatingImage as FloatingImage,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { useFloatingImageClipboard } from "../../../../modules/sheet-images/useFloatingImageClipboard";

function fixture() {
  const sheet = getActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
  const images: FloatingImage[] = [0, 1].map((index) => ({
    id: `image-${index}`,
    assetId: `asset-${index}`,
    groupId: "group",
    altText: "Group",
    anchor: { row: 0, column: 0 },
    offsetX: index * 80,
    offsetY: index * 40,
    width: 100,
    height: 50,
  }));
  sheet.floatingImages = structuredClone(images);
  let revision = 0;
  const write = vi.fn(async () => ({ localTokenWritten: true }));
  const onPasteMany = vi.fn();
  const onMoveMany = vi.fn(() => true);
  const onPaste = vi.fn();
  const onMove = vi.fn(() => true);
  const onFeedback = vi.fn();
  const clipboard = useFloatingImageClipboard({
    getSheet: () => sheet,
    getRevision: () => revision,
    getSelectedImages: () => images,
    clipboardPort: { write, read: vi.fn(async () => ({})) },
    onCopy: vi.fn(),
    onFeedback,
    onPaste,
    onMove,
    onPasteMany,
    onMoveMany,
  });
  return {
    sheet,
    images,
    clipboard,
    write,
    onPasteMany,
    onMoveMany,
    onPaste,
    onMove,
    onFeedback,
    changeRevision: () => {
      revision += 1;
    },
  };
}

describe("group picture clipboard", () => {
  test("copies the complete group to rich clipboard and pastes captured members together", async () => {
    const f = fixture();
    const captured = structuredClone(f.images);
    await f.clipboard.copy(f.images[0]!, "copy");
    expect(f.write).toHaveBeenCalledWith(
      expect.objectContaining({ floatingImage: captured[0], floatingImages: captured }),
    );
    f.images[1]!.offsetX = 999;
    expect(f.clipboard.pastePending({ row: 5, column: 6 })).toBe(true);
    expect(f.onPasteMany).toHaveBeenCalledExactlyOnceWith(captured, { row: 5, column: 6 });
    expect(f.onPaste).not.toHaveBeenCalled();
    expect(f.onMoveMany).not.toHaveBeenCalled();
  });

  test("cuts all group members together without copying and clears pending state", async () => {
    const f = fixture();
    await f.clipboard.copy(f.images[0]!, "cut");
    expect(f.sheet.floatingImages).toEqual(f.images);
    f.clipboard.pastePending({ row: 7, column: 8 });
    expect(f.onMoveMany).toHaveBeenCalledExactlyOnceWith(
      f.images.map((image) => ({
        ...image,
        anchor: { row: 7, column: 8 },
        offsetX: image.offsetX + 12,
        offsetY: image.offsetY + 12,
      })),
    );
    expect(f.onPasteMany).not.toHaveBeenCalled();
    expect(f.onMove).not.toHaveBeenCalled();
    expect(f.clipboard.hasPending()).toBe(false);
  });

  test.each(["revision", "missing-member"] as const)(
    "rejects group cut paste after %s changes",
    async (change) => {
      const f = fixture();
      await f.clipboard.copy(f.images[0]!, "cut");
      if (change === "revision") f.changeRevision();
      else f.sheet.floatingImages.pop();
      f.clipboard.pastePending({ row: 7, column: 8 });
      expect(f.onMoveMany).not.toHaveBeenCalled();
      expect(f.onPasteMany).not.toHaveBeenCalled();
      expect(f.onPaste).not.toHaveBeenCalled();
      expect(f.onFeedback).toHaveBeenCalledWith("clipboard.documentChanged");
      expect(f.clipboard.hasPending()).toBe(false);
    },
  );
});
