import { describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { framedPicture } from "./framed-picture-fixture";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  assertWorkbookPictureSupport,
  requireLegacyPictures,
} from "../../../modules/sheet-images/picture-document-support";
import {
  readFloatingImageTransfer,
  serializeFloatingImageClipboard,
  FLOATING_IMAGE_CLIPBOARD_TYPE,
} from "../../../modules/sheet-images/imageClipboard";
import { useFloatingImageClipboard } from "../../../modules/sheet-images/useFloatingImageClipboard";
import { getFloatingImageViewportFragmentsForPaint } from "../../../modules/sheet-images/floating-image-painter";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
const legacy: LegacyFloatingImage = {
  id: "legacy",
  assetId: "asset",
  altText: "Synthetic",
  anchor: { row: 1, column: 2 },
  offsetX: 2,
  offsetY: 3,
  width: 120,
  height: 80,
};
describe("internal frame and legacy consumer boundaries", () => {
  test("a mixed document is supported internally while legacy consumers reject it unchanged", () => {
    const workbook = createWorkbook({ id: "w", sheetId: "s" });
    const sheet = getActiveSheet(workbook);
    sheet.floatingImages = [legacy, framedPicture()];
    const before = serializeWorkbook(workbook);
    expect(() => assertWorkbookPictureSupport(workbook)).not.toThrow();
    expect(() => requireLegacyPictures(sheet.floatingImages)).toThrow(/does not support/);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("legacy clipboard geometry cannot encode or silently consume a framed payload", () => {
    expect(() => serializeFloatingImageClipboard(framedPicture())).toThrow(/does not support/);
    expect(() => serializeFloatingImageClipboard(legacy, [legacy, framedPicture()])).toThrow(
      /does not support/,
    );
    const data = {
      getData: (type: string) =>
        type === FLOATING_IMAGE_CLIPBOARD_TYPE ? JSON.stringify(framedPicture()) : "",
    };
    expect(readFloatingImageTransfer(data)).toEqual({
      invalidFloatingImage: true,
      unsupportedFloatingImage: true,
    });
  });
  test("a rejected copy or paste preserves a previous cut and writes no partial native payload", async () => {
    const sheet = getActiveSheet(createWorkbook({ id: "w", sheetId: "s" }));
    sheet.floatingImages = [legacy];
    const write = vi.fn(async () => ({ localTokenWritten: true })),
      move = vi.fn(() => true),
      feedback = vi.fn();
    const clipboard = useFloatingImageClipboard({
      getSheet: () => sheet,
      getRevision: () => 0,
      clipboardPort: { write, read: vi.fn(async () => ({})) },
      onCopy: vi.fn(),
      onFeedback: feedback,
      onPaste: vi.fn(),
      onMove: move,
    });
    await clipboard.copy(legacy, "cut");
    expect(write).toHaveBeenCalledTimes(1);
    await clipboard.copy(framedPicture(), "copy");
    expect(write).toHaveBeenCalledTimes(1);
    expect(clipboard.hasPending()).toBe(true);
    clipboard.observeTransfer(
      readFloatingImageTransfer({ getData: () => JSON.stringify(framedPicture()) }),
    );
    expect(clipboard.hasPending()).toBe(true);
    clipboard.paste(framedPicture(), "floating", { row: 3, column: 4 });
    expect(move).not.toHaveBeenCalled();
    expect(clipboard.hasPending()).toBe(true);
    clipboard.pastePending({ row: 3, column: 4 });
    expect(move).toHaveBeenCalledOnce();
    expect(clipboard.hasPending()).toBe(false);
  });
  test("the legacy consumer refuses a frame-bearing member before reading its frame geometry", () => {
    const payload = {
      ...legacy,
      clipboardImages: [legacy, { ...framedPicture(), frame: null }],
      clipboardCoordinateSpace: "group-relative-sheet-pixels-v1",
    };
    expect(readFloatingImageTransfer({ getData: () => JSON.stringify(payload) })).toEqual({
      invalidFloatingImage: true,
      unsupportedFloatingImage: true,
    });
  });
  test("a framed primary is refused before any malformed group envelope can be consumed", () => {
    const primary = framedPicture();
    for (const envelope of [
      { clipboardImages: "broken" },
      { clipboardImages: [primary, legacy], clipboardCoordinateSpace: "unknown" },
      {
        clipboardImages: [primary, primary],
        clipboardCoordinateSpace: "group-relative-sheet-pixels-v1",
      },
      {
        clipboardImages: [legacy, { ...legacy, id: "other" }],
        clipboardCoordinateSpace: "group-relative-sheet-pixels-v1",
      },
    ]) {
      expect(
        readFloatingImageTransfer({ getData: () => JSON.stringify({ ...primary, ...envelope }) }),
      ).toEqual({ invalidFloatingImage: true, unsupportedFloatingImage: true });
    }
    expect(
      readFloatingImageTransfer({
        getData: () =>
          JSON.stringify({
            ...primary,
            clipboardImages: [primary, legacy],
            clipboardCoordinateSpace: "group-relative-sheet-pixels-v1",
          }),
      }),
    ).toEqual({ invalidFloatingImage: true, unsupportedFloatingImage: true });
  });
  test("legacy painter preflights the complete collection rather than drawing its supported prefix", () => {
    const layout = createSheetViewportLayout({
      geometry: createSheetGeometry({ rowCount: 20, columnCount: 20 }),
      rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 }),
      viewportSize: { width: 400, height: 300 },
    });
    expect(() =>
      getFloatingImageViewportFragmentsForPaint([legacy, framedPicture()], layout),
    ).toThrow(/does not support/);
  });
});
