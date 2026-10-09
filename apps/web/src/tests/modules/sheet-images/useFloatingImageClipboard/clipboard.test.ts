import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import type { MessageKey } from "../../../../shared/i18n";
import type { GridClipboardPort } from "../../../../modules/sheet-grid/gridClipboardPort";
import { useFloatingImageClipboard } from "../../../../modules/sheet-images/useFloatingImageClipboard";

const image: FloatingImage = {
  id: "image-1",
  assetId: "asset-1",
  altText: "Chart",
  anchor: { row: 1, column: 2 },
  offsetX: 0,
  offsetY: 0,
  width: 160,
  height: 90,
};

function createFixture() {
  const sheet = getActiveSheet(createWorkbook({ id: "workbook-1", sheetId: "sheet-1" }));
  sheet.floatingImages.push({ ...image, anchor: { ...image.anchor } });
  let currentSheet = sheet;
  let revision = 0;
  const feedback: MessageKey[] = [];
  const pasted: Array<{
    image: FloatingImage;
    mode: "cell" | "floating";
    address: { row: number; column: number };
  }> = [];
  const moved: FloatingImage[] = [];
  const port: GridClipboardPort = {
    write: vi.fn(async () => Promise.reject(new Error("clipboard denied"))),
    read: vi.fn(async () => ({})),
  };
  const clipboard = useFloatingImageClipboard({
    getSheet: () => currentSheet,
    getRevision: () => revision,
    clipboardPort: port,
    onCopy: vi.fn(),
    onFeedback: (key) => feedback.push(key),
    onPaste: (nextImage, mode, address) => pasted.push({ image: nextImage, mode, address }),
    onMove: (nextImage) => moved.push(nextImage),
  });

  return {
    clipboard,
    feedback,
    moved,
    pasted,
    port,
    sheet,
    setRevision(nextRevision: number) {
      revision = nextRevision;
    },
    setSheet(nextSheet: typeof sheet) {
      currentSheet = nextSheet;
    },
  };
}

describe("useFloatingImageClipboard", () => {
  test("keeps menu copy and cut available when browser clipboard writes are denied", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copy(image, "copy");
    expect(fixture.clipboard.pastePending({ row: 7, column: 8 })).toBe(true);
    expect(fixture.pasted).toEqual([
      {
        image,
        mode: "floating",
        address: { row: 7, column: 8 },
      },
    ]);
    expect(fixture.feedback).toContain("image.copied");

    await fixture.clipboard.copy(image, "cut");
    expect(fixture.sheet.floatingImages).toEqual([image]);
    fixture.clipboard.paste(image, "cell", { row: 4, column: 5 });
    expect(fixture.moved).toEqual([
      {
        ...image,
        anchor: { row: 4, column: 5 },
        offsetX: 12,
        offsetY: 12,
      },
    ]);
    expect(fixture.pasted).toHaveLength(1);
    expect(fixture.feedback).toContain("clipboard.readyToMove");
  });

  test("guards cuts against document revisions and retains their source image", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copy(image, "cut");
    fixture.setRevision(1);

    fixture.clipboard.paste(image, "floating", { row: 4, column: 5 });

    expect(fixture.moved).toEqual([]);
    expect(fixture.pasted).toEqual([]);
    expect(fixture.sheet.floatingImages).toEqual([image]);
    expect(fixture.feedback).toContain("clipboard.documentChanged");
  });

  test("uses the requested insertion mode and target after a copy", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copy(image, "copy");

    fixture.clipboard.paste(image, "cell", { row: 9, column: 1 });

    expect(fixture.pasted).toEqual([
      {
        image,
        mode: "cell",
        address: { row: 9, column: 1 },
      },
    ]);
  });

  test("writes native clipboard image data during a copy event", async () => {
    const fixture = createFixture();
    const data = new Map<string, string>();
    fixture.port.writeNativeRich = vi.fn(async () => {});
    const event = new Event("copy", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { setData: (type: string, value: string) => data.set(type, value) },
    });

    await fixture.clipboard.copy(image, "copy", event);

    expect(event.defaultPrevented).toBe(true);
    expect(data.get("text/plain")).toBe("Chart");
    expect(data.get("application/x-sheetcraft-floating-image")).toBe(JSON.stringify(image));
    expect(fixture.port.writeNativeRich).toHaveBeenCalledOnce();
    expect(fixture.port.write).not.toHaveBeenCalled();
  });

  test("clears cut authority when a known external transfer differs or the sheet changes", async () => {
    const fixture = createFixture();
    await fixture.clipboard.copy(image, "cut");
    fixture.clipboard.observeTransfer({});
    fixture.clipboard.paste(image, "floating", { row: 3, column: 3 });
    expect(fixture.moved).toEqual([]);
    expect(fixture.pasted).toHaveLength(1);

    await fixture.clipboard.copy(image, "cut");
    fixture.clipboard.observeTransfer({ floatingImage: { ...image, assetId: "other-asset" } });
    fixture.clipboard.paste(image, "floating", { row: 3, column: 3 });
    expect(fixture.moved).toEqual([]);
    expect(fixture.pasted).toHaveLength(2);

    await fixture.clipboard.copy(image, "cut");
    const otherSheet = getActiveSheet(createWorkbook({ id: "workbook-2", sheetId: "sheet-2" }));
    fixture.setSheet(otherSheet);
    fixture.clipboard.paste(image, "floating", { row: 3, column: 3 });
    expect(fixture.moved).toEqual([]);
    expect(fixture.pasted).toHaveLength(3);
  });
});
