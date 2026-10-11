import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { isPictureGroup } from "@sheetcraft/core/picture-group";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  cloneFloatingImage,
  createSheet,
  getCellContent,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import type { GridClipboardTransfer } from "../../../../../modules/sheet-grid/gridClipboardPort";
import { SHEETCRAFT_CLIPBOARD_TYPE } from "../../../../../modules/sheet-grid/gridClipboardPort";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { FLOATING_IMAGE_CLIPBOARD_TYPE } from "../../../../../modules/sheet-images/imageClipboard";
import { framedPicture } from "../../../sheet-images/framed-picture-fixture";
import { legacyPicture } from "../../../sheet-images/owned-picture-clipboard/fixture";
import { pictureGroup } from "../../../sheet-images/picture-group-fixture";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid, triggerCell } from "./fixture";

const port = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  writeNativeRich: vi.fn(),
}));
vi.mock("../../../../../modules/sheet-grid/gridClipboardPort", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../modules/sheet-grid/gridClipboardPort")>()),
  createBrowserGridClipboardPort: () => port,
}));

async function fixture() {
  const group = pictureGroup();
  const f = mountSheetGrid({
    beforeMount: (sheet) => (sheet.floatingImages = [group, legacyPicture()]),
  });
  const apply = vi.fn((roots: readonly FloatingImage[]) =>
    executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, roots)),
  );
  await f.wrapper.setProps({ applyPictureCollectionChange: apply });
  (
    f.wrapper.vm as unknown as { selectFloatingImages: (ids: string[]) => void }
  ).selectFloatingImages([group.id]);
  await f.wrapper.vm.$nextTick();
  return { ...f, group, apply };
}

function dispatch(
  f: Awaited<ReturnType<typeof fixture>>,
  type: "copy" | "cut" | "paste",
  data?: Map<string, string>,
) {
  const transfer = createTestClipboardEvent(type, data);
  f.wrapper.get("textarea.cell-editor").element.dispatchEvent(transfer.event);
  return transfer;
}

describe("SheetGrid owned picture clipboard", () => {
  beforeEach(() => {
    port.read.mockReset().mockResolvedValue({});
    port.write.mockReset().mockResolvedValue({ localTokenWritten: true });
    port.writeNativeRich.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  test("native owned copy transfers a local token and pastes one full-forest Core transaction", async () => {
    const f = await fixture();
    try {
      const before = serializeWorkbook(f.session.workbook);
      const copy = dispatch(f, "copy");
      expect(copy.event.defaultPrevented).toBe(true);
      expect(copy.data.get(SHEETCRAFT_CLIPBOARD_TYPE)).toBeTruthy();
      expect(copy.data.get(FLOATING_IMAGE_CLIPBOARD_TYPE)).toBeUndefined();
      expect(copy.data.get("text/plain")).toBe(f.group.altText);
      await triggerCell(f.wrapper, { row: 6, column: 4 }, "mousedown", { button: 0 });
      dispatch(f, "paste", copy.data);
      await flushPromises();
      expect(f.apply).toHaveBeenCalledOnce();
      const next = f.apply.mock.calls[0]![0];
      expect(next).toHaveLength(3);
      expect(next.slice(0, 2)).toEqual([f.group, legacyPicture()]);
      const pasted = next[2]!;
      expect(isPictureGroup(pasted)).toBe(true);
      if (!isPictureGroup(pasted)) throw new Error("Expected an owned group.");
      expect(pasted.id).not.toBe(f.group.id);
      expect(pasted.members[0]!.id).not.toBe(f.group.members[0]!.id);
      expect(pasted.members[0]).toMatchObject({ assetId: "synthetic-asset" });
      expect(getCellContent(f.sheet, { row: 6, column: 4 })).toBeNull();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.wrapper.emitted("pasteFloatingImage")).toBeUndefined();
      expect(f.wrapper.emitted("pasteFloatingImages")).toBeUndefined();
      const after = serializeWorkbook(f.session.workbook);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("tokenless native paste waits for the exact Async Clipboard lease before group insertion", async () => {
    const f = await fixture();
    let finish!: (transfer: GridClipboardTransfer) => void;
    port.read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    try {
      const copy = dispatch(f, "copy");
      const before = serializeWorkbook(f.session.workbook);
      const paste = dispatch(f, "paste", new Map([["text/plain", f.group.altText]]));
      expect(paste.event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(port.read).toHaveBeenCalledWith({ preferAsync: true }));
      expect(f.apply).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      finish({ text: f.group.altText, localToken: copy.data.get(SHEETCRAFT_CLIPBOARD_TYPE) });
      await flushPromises();
      expect(f.apply).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages).toHaveLength(3);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(getCellContent(f.sheet, { row: 0, column: 0 })).toBeNull();
    } finally {
      f.wrapper.unmount();
    }
  });

  test.each([undefined, "foreign-owned-token"])(
    "matching alt text with async token %s never claims owned picture authority",
    async (localToken) => {
      const f = await fixture();
      try {
        dispatch(f, "cut");
        port.read.mockResolvedValueOnce({ text: f.group.altText, localToken });
        dispatch(f, "paste", new Map([["text/plain", f.group.altText]]));
        await flushPromises();
        expect(f.apply).not.toHaveBeenCalled();
        expect(f.sheet.floatingImages).toHaveLength(2);
        expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
          kind: "literal",
          value: f.group.altText,
        });
        expect(f.wrapper.emitted("pasteFloatingImage")).toBeUndefined();
        expect(f.wrapper.emitted("pasteFloatingImages")).toBeUndefined();
      } finally {
        f.wrapper.unmount();
      }
    },
  );

  test("a deferred owned read cannot insert after its same-ID document owner is replaced", async () => {
    const f = await fixture();
    let finish!: (transfer: GridClipboardTransfer) => void;
    port.read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    try {
      const cut = dispatch(f, "cut");
      dispatch(f, "paste", new Map([["text/plain", f.group.altText]]));
      await vi.waitFor(() => expect(port.read).toHaveBeenCalledOnce());
      const replacement = createSheet(f.sheet.name, f.sheet.id);
      replacement.floatingImages = f.sheet.floatingImages.map(cloneFloatingImage);
      await f.wrapper.setProps({ sheet: replacement, pictureOwnerGeneration: 1 });
      const before = serializeWorkbook(f.session.workbook);
      finish({ text: f.group.altText, localToken: cut.data.get(SHEETCRAFT_CLIPBOARD_TYPE) });
      await flushPromises();
      expect(f.apply).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(replacement.floatingImages).toHaveLength(2);
      expect(getCellContent(replacement, { row: 0, column: 0 })).toBeNull();
      expect(f.session.history.undoStack).toHaveLength(0);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("a denied async native read never grants a previous owned cut authority from matching alt text", async () => {
    const f = await fixture();
    try {
      dispatch(f, "cut");
      port.read.mockRejectedValueOnce(new DOMException("Read denied", "NotAllowedError"));
      dispatch(f, "paste", new Map([["text/plain", f.group.altText]]));
      await flushPromises();
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.sheet.floatingImages).toHaveLength(2);
      expect(getCellContent(f.sheet, { row: 0, column: 0 })).toEqual({
        kind: "literal",
        value: f.group.altText,
      });
    } finally {
      f.wrapper.unmount();
    }
  });

  test("a native bitmap with an older owned lease takes the existing image-file route", async () => {
    const f = await fixture();
    try {
      dispatch(f, "copy");
      const file = new File(["Synthetic bitmap"], "pasted.png", { type: "image/png" });
      const paste = createTestClipboardEvent("paste", new Map([["text/plain", f.group.altText]]));
      Object.defineProperty(paste.event.clipboardData, "files", { value: [file] });
      f.wrapper.get("textarea.cell-editor").element.dispatchEvent(paste.event);
      expect(paste.event.defaultPrevented).toBe(true);
      expect(f.wrapper.emitted("pasteImageFile")).toEqual([[file, "floating"]]);
      expect(f.apply).not.toHaveBeenCalled();
      expect(port.read).not.toHaveBeenCalled();
      expect(getCellContent(f.sheet, { row: 0, column: 0 })).toBeNull();
      expect(f.session.history.undoStack).toHaveLength(0);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("an old deferred owned paste cannot invalidate or paste a newer owned copy", async () => {
    const f = await fixture();
    let finish!: (transfer: GridClipboardTransfer) => void;
    port.read.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    try {
      const old = dispatch(f, "cut");
      dispatch(f, "paste", new Map([["text/plain", f.group.altText]]));
      await vi.waitFor(() => expect(port.read).toHaveBeenCalledOnce());
      const newer = dispatch(f, "copy");
      expect(newer.data.get(SHEETCRAFT_CLIPBOARD_TYPE)).not.toBe(
        old.data.get(SHEETCRAFT_CLIPBOARD_TYPE),
      );
      finish({ text: f.group.altText, localToken: old.data.get(SHEETCRAFT_CLIPBOARD_TYPE) });
      await flushPromises();
      expect(f.apply).not.toHaveBeenCalled();
      dispatch(f, "paste", newer.data);
      expect(f.apply).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages).toHaveLength(3);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("unsupported native rich geometry is refused without losing an earlier owned cut lease", async () => {
    const f = await fixture();
    try {
      const cut = dispatch(f, "cut");
      const before = serializeWorkbook(f.session.workbook);
      dispatch(
        f,
        "paste",
        new Map([
          ["text/plain", f.group.altText],
          [SHEETCRAFT_CLIPBOARD_TYPE, cut.data.get(SHEETCRAFT_CLIPBOARD_TYPE)!],
          [FLOATING_IMAGE_CLIPBOARD_TYPE, JSON.stringify(framedPicture())],
        ]),
      );
      await flushPromises();
      expect(f.apply).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["clipboard.pasteRejected"]);
      await triggerCell(f.wrapper, { row: 5, column: 4 }, "mousedown", { button: 0 });
      dispatch(f, "paste", cut.data);
      expect(f.apply).toHaveBeenCalledOnce();
      expect(f.sheet.floatingImages).toHaveLength(2);
      expect(f.session.history.undoStack).toHaveLength(1);
    } finally {
      f.wrapper.unmount();
    }
  });

  test("ordinary legacy pictures retain their rich native route and never use the owned command", async () => {
    const legacy = legacyPicture();
    const f = mountSheetGrid({ beforeMount: (sheet) => (sheet.floatingImages = [legacy]) });
    try {
      const apply = vi.fn(() => true);
      await f.wrapper.setProps({ applyPictureCollectionChange: apply });
      f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("select", legacy.id);
      await f.wrapper.vm.$nextTick();
      const copy = createTestClipboardEvent("copy");
      f.wrapper.get("textarea.cell-editor").element.dispatchEvent(copy.event);
      expect(copy.data.get(FLOATING_IMAGE_CLIPBOARD_TYPE)).toBeTruthy();
      f.wrapper
        .get("textarea.cell-editor")
        .element.dispatchEvent(createTestClipboardEvent("paste", copy.data).event);
      expect(f.wrapper.emitted("pasteFloatingImage")?.[0]?.[0]).toMatchObject({
        id: legacy.id,
        assetId: legacy.assetId,
      });
      expect(apply).not.toHaveBeenCalled();
      expect(getCellContent(f.sheet, { row: 0, column: 0 })).toBeNull();
    } finally {
      f.wrapper.unmount();
    }
  });
});
