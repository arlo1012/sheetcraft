import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetFloatingImagesCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { FLOATING_IMAGE_CLIPBOARD_TYPE } from "../../../../../modules/sheet-images/imageClipboard";
import { createTestClipboardEvent } from "./clipboard-fixture";
import { mountSheetGrid } from "./fixture";

const images: FloatingImage[] = [0, 3].map((index) => ({
  id: `picture-${index}`,
  assetId: `asset-${index}`,
  groupId: "group",
  altText: "Synthetic",
  anchor: { row: index, column: index },
  offsetX: 5,
  offsetY: 7,
  width: 100,
  height: 50,
}));
describe("SheetGrid complete picture clipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  test("deferred old paste cannot clear or paste over a newer copy on the same sheet", async () => {
    let finish!: (value: unknown[]) => void;
    const read = vi.fn(
      () =>
        new Promise<unknown[]>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("navigator", {
      clipboard: { read, readText: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    const f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = images.map((image) => ({ ...image, groupId: undefined }));
      },
    });
    const layer = f.wrapper.getComponent(SheetFloatingImageLayer);
    layer.vm.$emit("select", images[0]!.id);
    await f.wrapper.vm.$nextTick();
    const cut = createTestClipboardEvent("cut");
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    f.wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(
        createTestClipboardEvent("paste", new Map([["text/plain", "Synthetic"]])).event,
      );
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    layer.vm.$emit("select", images[1]!.id);
    await f.wrapper.vm.$nextTick();
    const copy = createTestClipboardEvent("copy");
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(copy.event);
    finish([
      {
        types: [
          "text/plain",
          "web application/x-sheetcraft-cells",
          `web ${FLOATING_IMAGE_CLIPBOARD_TYPE}`,
        ],
        getType: async (type: string) =>
          new Blob(
            [
              type === "text/plain"
                ? "Synthetic"
                : type === "web application/x-sheetcraft-cells"
                  ? cut.data.get("application/x-sheetcraft-cells")!
                  : cut.data.get(FLOATING_IMAGE_CLIPBOARD_TYPE)!,
            ],
            { type: "text/plain" },
          ),
      },
    ]);
    await flushPromises();
    expect(f.wrapper.emitted("pasteFloatingImage")).toBeUndefined();
    read.mockRejectedValue(new Error("Denied"));
    layer.vm.$emit("paste", images[1]!.id);
    await vi.waitFor(() => expect(f.wrapper.emitted("pasteFloatingImage")).toHaveLength(1));
    expect(f.wrapper.emitted("pasteFloatingImage")?.[0]?.[0]).toMatchObject({ id: images[1]!.id });
    f.wrapper.unmount();
  });
  test("a known malformed replacement clipboard invalidates older cut authority", async () => {
    const f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = structuredClone(images);
      },
    });
    const apply = vi.fn(() => true);
    await f.wrapper.setProps({ applyFloatingImageMove: apply });
    f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("select", images[0]!.id);
    await f.wrapper.vm.$nextTick();
    const cut = createTestClipboardEvent("cut");
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    f.wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(
        createTestClipboardEvent("paste", new Map([[FLOATING_IMAGE_CLIPBOARD_TYPE, "{"]])).event,
      );
    f.wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", cut.data).event);
    expect(apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("pasteFloatingImages")).toHaveLength(1);
    f.wrapper.unmount();
  });
  test("native token reaches the authoritative group handler and rejected cut can retry", async () => {
    const f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = structuredClone(images);
      },
    });
    let accept = false;
    const apply = vi.fn(
      (next: readonly FloatingImage[]) =>
        accept &&
        executeWorkbookCommand(f.session, createSetSheetFloatingImagesCommand(f.sheet.id, next)),
    );
    await f.wrapper.setProps({ applyFloatingImageMove: apply });
    f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("select", images[0]!.id);
    await f.wrapper.vm.$nextTick();
    const cut = createTestClipboardEvent("cut");
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(cut.event);
    const captured = JSON.parse(cut.data.get(FLOATING_IMAGE_CLIPBOARD_TYPE)!);
    expect(cut.data.get("application/x-sheetcraft-cells")).toBeTruthy();
    expect(captured.clipboardImages).toHaveLength(2);
    const before = serializeWorkbook(f.session.workbook);
    f.wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", cut.data).event);
    expect(apply).toHaveBeenCalledOnce();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["clipboard.pasteRejected"]);
    accept = true;
    f.wrapper
      .get("textarea.cell-editor")
      .element.dispatchEvent(createTestClipboardEvent("paste", cut.data).event);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(f.wrapper.emitted("updateFloatingImages")).toBeUndefined();
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.session.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(after);
    f.wrapper.unmount();
  });
  test("a selected hidden-anchor member does not disappear from a group copy", async () => {
    const f = mountSheetGrid({
      beforeMount: (sheet) => {
        sheet.floatingImages = structuredClone(images);
        sheet.hiddenRows = new Set([3]);
      },
    });
    f.wrapper.getComponent(SheetFloatingImageLayer).vm.$emit("select", images[0]!.id);
    await f.wrapper.vm.$nextTick();
    const copy = createTestClipboardEvent("copy");
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(copy.event);
    expect(copy.event.defaultPrevented).toBe(true);
    expect(copy.data.size).toBe(0);
    expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["image.copyFailed"]);
    f.wrapper.unmount();
  });
  test("malformed group data cannot paste only one member or replace a cell with its caption", async () => {
    const f = mountSheetGrid();
    const paste = createTestClipboardEvent(
      "paste",
      new Map([
        ["text/plain", "Do not paste"],
        [
          FLOATING_IMAGE_CLIPBOARD_TYPE,
          JSON.stringify({ ...images[0], clipboardImages: [images[0], images[0]] }),
        ],
      ]),
    );
    const before = serializeWorkbook(f.session.workbook);
    f.wrapper.get("textarea.cell-editor").element.dispatchEvent(paste.event);
    expect(paste.event.defaultPrevented).toBe(true);
    expect(f.wrapper.emitted("pasteFloatingImage")).toBeUndefined();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.wrapper.emitted("imageFeedback")?.at(-1)).toEqual(["clipboard.pasteRejected"]);
    f.wrapper.unmount();
  });
});
