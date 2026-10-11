import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import type { GridClipboardTransfer } from "../../../../../modules/sheet-grid/gridClipboardPort";
import SheetPictureCropOverlay from "../../../../../modules/sheet-images/components/SheetPictureCropOverlay.vue";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { triggerCell } from "./fixture";
import { fixture, keyboardSourceMove } from "./picture-crop-fixture";

const port = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), writeNativeRich: vi.fn() }));
vi.mock("../../../../../modules/sheet-grid/gridClipboardPort", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../modules/sheet-grid/gridClipboardPort")>()),
  createBrowserGridClipboardPort: () => port,
}));

async function openCropMenu(f: Awaited<ReturnType<typeof fixture>>) {
  f.api.cropImage();
  await f.wrapper.vm.$nextTick();
  await keyboardSourceMove(f);
  await f.wrapper.getComponent(SheetPictureCropOverlay).trigger("contextmenu", {
    button: 2,
    clientX: 100,
    clientY: 90,
  });
  await f.wrapper.vm.$nextTick();
  return document.querySelector<HTMLElement>("[data-floating-image-context-menu]")!;
}

describe("interactive crop object-menu command boundary", () => {
  beforeEach(() => {
    port.read.mockReset().mockResolvedValue({});
    port.write.mockReset().mockResolvedValue({ localTokenWritten: true });
    port.writeNativeRich.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  test.each(["pointer", "keyboard"])(
    "%s Copy applies the draft first and pastes its updated source",
    async (route) => {
      const f = await fixture();
      try {
        const menu = await openCropMenu(f);
        expect(menu).not.toBeNull();
        expect(f.execute).not.toHaveBeenCalled();
        if (route === "pointer") {
          const button = menu.querySelector<HTMLElement>('[data-floating-image-action="copy"]')!;
          button.dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
          );
          // Outside-click handling must not unmount the menu before its actual click.
          expect(f.execute).not.toHaveBeenCalled();
          expect(document.querySelector("[data-floating-image-context-menu]")).toBe(menu);
          button.click();
        } else {
          menu.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "c",
              ctrlKey: true,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
        await flushPromises();
        expect(f.execute).toHaveBeenCalledOnce();
        expect(port.write).toHaveBeenCalledOnce();
        expect(f.execute.mock.invocationCallOrder[0]).toBeLessThan(
          port.write.mock.invocationCallOrder[0]!,
        );
        expect(f.api.hasPendingEdit()).toBe(false);
        const applied = f.sheet.floatingImages[0]!;
        expect(isFramedPictureObject(applied)).toBe(true);
        if (!isFramedPictureObject(applied)) throw new Error("Expected applied crop.");
        const transfer = port.write.mock.calls[0]![0] as GridClipboardTransfer;
        expect(transfer.localToken).toBeTruthy();
        port.read.mockResolvedValueOnce(transfer);
        await triggerCell(f.wrapper, { row: 6, column: 4 }, "mousedown", { button: 0 });
        const paste = createTestClipboardEvent(
          "paste",
          new Map([["text/plain", transfer.text ?? ""]]),
        );
        f.wrapper.get("textarea.cell-editor").element.dispatchEvent(paste.event);
        await flushPromises();
        expect(f.execute).toHaveBeenCalledTimes(2);
        expect(f.sheet.floatingImages).toHaveLength(2);
        const pasted = f.sheet.floatingImages[1]!;
        expect(isFramedPictureObject(pasted)).toBe(true);
        if (!isFramedPictureObject(pasted)) throw new Error("Expected a copied framed picture.");
        expect(pasted.frame.source).toEqual(applied.frame.source);
        expect(pasted.id).not.toBe(applied.id);
        expect(pasted.assetId).toBe(applied.assetId);
      } finally {
        f.wrapper.unmount();
      }
    },
  );

  test("rejected crop apply does not copy stale geometry or consume the draft", async () => {
    const f = await fixture();
    try {
      await f.wrapper.setProps({ applyPictureCollectionChange: vi.fn(() => false) });
      const menu = await openCropMenu(f);
      menu.dispatchEvent(
        new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await flushPromises();
      expect(port.write).not.toHaveBeenCalled();
      expect(port.writeNativeRich).not.toHaveBeenCalled();
      expect(f.api.hasPendingEdit()).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.findComponent(SheetPictureCropOverlay).exists()).toBe(true);
    } finally {
      f.wrapper.unmount();
    }
  });
});
