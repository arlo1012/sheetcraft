import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { pictureGroup } from "./picture-group-fixture";
import { getPictureViewportFragments } from "../../../modules/sheet-images/picture-viewport-fragments";
import {
  getPictureViewRect,
  movePictureViewBy,
  resizePictureViewBy,
  rotatePictureViewBy,
  flipPictureView,
} from "../../../modules/sheet-images/picture-view-operations";
import {
  assertWorkbookPictureSupport,
  requireStandalonePictures,
  assertExternalPictureGroupSupport,
} from "../../../modules/sheet-images/picture-document-support";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";
import {
  downloadWorkbookJson,
  downloadWorkbookBundle,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { prepareXlsxImages } from "../../../modules/workbook-xlsx/prepareXlsxImages";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.floatingImages = [pictureGroup()];
  const layout = createSheetViewportLayout({
    geometry: createSheetGeometry({ rowCount: 20, columnCount: 20 }),
    rows: createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 }),
    viewportSize: { width: 400, height: 300 },
  });
  return { workbook, sheet, layout };
}

describe("owned group prepared-consumer safety", () => {
  test("whole live and standalone collections reject even a hidden container without changing snapshot48", () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages[0]!.hidden = true;
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(48);
    expect(() => assertWorkbookPictureSupport(workbook)).toThrow(/not yet enabled/);
    expect(() => requireStandalonePictures(sheet.floatingImages)).toThrow(/not yet enabled/);
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/not yet enabled/);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
  test("prepared projection and root operations require actual worksheet frame context", () => {
    const { sheet, layout } = fixture();
    const group = sheet.floatingImages[0]!;
    expect(() => getPictureViewportFragments(sheet.floatingImages, layout)).toThrow(
      /require a frame context/,
    );
    for (const operation of [
      () => getPictureViewRect(group, layout),
      () => movePictureViewBy(group, { x: 1, y: 1 }, layout),
      () => resizePictureViewBy(group, "e", { x: 1, y: 1 }, layout, 1, 10000),
      () => rotatePictureViewBy(group, 1, layout),
      () => flipPictureView(group, "horizontal", layout),
    ])
      expect(operation).toThrow(/current worksheet frame geometry/);
  });
  test("paused external packaging and print refuse before fetching or opening a download target", async () => {
    const { workbook, sheet } = fixture();
    const get = vi.fn(async () => undefined),
      put = vi.fn(async () => {}),
      store = { get, put };
    const before = serializeWorkbook(workbook);
    expect(() => downloadWorkbookJson(workbook)).toThrow(/not yet enabled/);
    await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow(/not yet enabled/);
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              snapshot: before,
              images: [],
            }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "unsupported-picture-frame" });
    await expect(prepareXlsxImages(before, store)).rejects.toThrow(/not yet supported/);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(() =>
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }),
    ).toThrow(/not yet enabled/);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
