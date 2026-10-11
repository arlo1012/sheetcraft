import { describe, expect, test, vi } from "vitest";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { type FloatingImage } from "@sheetcraft/core/workbook";
import {
  FLOATING_IMAGE_CLIPBOARD_TYPE,
  readFloatingImageTransfer,
  writeFloatingImageClipboard,
} from "../../../modules/sheet-images/imageClipboard";
import { useFloatingImageClipboard } from "../../../modules/sheet-images/useFloatingImageClipboard";
import { fixture, group, picture } from "./group-source-guard-fixture";

describe("source-only group clipboard guards", () => {
  test("a container or mixed payload is rejected before native clipboard writes", () => {
    const f = fixture();
    const setData = vi.fn();
    for (const [image, images] of [
      [f.container, undefined],
      [f.image, [f.image, f.container]],
    ] as const) {
      expect(() => writeFloatingImageClipboard({ setData }, image, images)).toThrow();
      expect(setData).not.toHaveBeenCalled();
      const payload = { ...image, ...(images ? { clipboardImages: images } : {}) };
      expect(
        readFloatingImageTransfer({
          getData: (type) =>
            type === FLOATING_IMAGE_CLIPBOARD_TYPE ? JSON.stringify(payload) : "",
        }),
      ).toEqual({ invalidFloatingImage: true, unsupportedFloatingImage: true });
    }
  });
  test.each(["single", "mixed", "changed-cut-member"] as const)(
    "%s rejection preserves a locally retained cut and makes no external write",
    async (kind) => {
      const f = fixture();
      const second = picture("second");
      second.offsetX = 220;
      f.sheet.floatingImages.push(second);
      let selected: FloatingImage[] = kind === "changed-cut-member" ? [f.image, second] : [f.image];
      const write = vi.fn(async () => {
        throw new Error("Native clipboard denied");
      });
      const writeNativeRich = vi.fn(async () => {});
      const onCopy = vi.fn();
      const onMove = vi.fn(() => true);
      const onMoveMany = vi.fn(() => true);
      const onPaste = vi.fn();
      const onFeedback = vi.fn();
      const clipboard = useFloatingImageClipboard({
        getSheet: () => f.sheet,
        getRevision: () => f.session.history.revision,
        getSelectedImages: () => selected,
        clipboardPort: { write, writeNativeRich, read: vi.fn(async () => ({})) },
        onCopy,
        onMove,
        onMoveMany,
        onPaste,
        onFeedback,
      });
      await clipboard.copy(f.image, "cut");
      const operation = clipboard.getOperation();
      const before = serializeWorkbook(f.session.workbook);
      const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer() });
      const setData = vi.spyOn(event.clipboardData!, "setData");
      selected = kind === "single" ? [f.container] : [f.image, f.container];
      await clipboard.copy(kind === "single" ? f.container : f.image, "copy", event);
      clipboard.observeTransfer({ floatingImage: f.container });
      clipboard.paste(f.image, "floating", { row: 3, column: 4 }, [f.image, f.container]);
      expect(clipboard.getOperation()).toBe(operation);
      expect(clipboard.hasPending()).toBe(true);
      expect(write).toHaveBeenCalledTimes(1);
      expect(writeNativeRich).not.toHaveBeenCalled();
      expect(setData).not.toHaveBeenCalled();
      expect(onCopy).toHaveBeenCalledTimes(1);
      expect(onPaste).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      if (kind === "changed-cut-member") {
        f.sheet.floatingImages[2] = group(second.id);
        clipboard.pastePending({ row: 3, column: 4 });
        expect(onMoveMany).not.toHaveBeenCalled();
        expect(clipboard.hasPending()).toBe(true);
        f.sheet.floatingImages[2] = second;
      } else {
        f.sheet.floatingImages[0] = group(f.image.id);
        clipboard.pastePending({ row: 3, column: 4 });
        expect(onMove).not.toHaveBeenCalled();
        expect(clipboard.hasPending()).toBe(true);
        f.sheet.floatingImages[0] = f.image;
      }
      expect(onFeedback).toHaveBeenCalledWith("clipboard.pasteRejected");
      clipboard.pastePending({ row: 3, column: 4 });
      expect(clipboard.hasPending()).toBe(false);
      expect(kind === "changed-cut-member" ? onMoveMany : onMove).toHaveBeenCalledTimes(1);
    },
  );
});
