import { describe, expect, test, vi } from "vitest";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { CellImage, FramedCellImage } from "@sheetcraft/core/cell-picture-frame";
import {
  createSheet,
  createSheetSparseState,
  createWorkbook,
  getActiveSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { serializeSheet, serializeWorkbook } from "@sheetcraft/core/serialization";
import { cloneWorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  assertExternalPictureGroupSupport,
  assertPictureCommandSupport,
  assertWorkbookPictureSupport,
} from "../../../modules/sheet-images/picture-document-support";
import { UnsupportedPicturePaintError } from "../../../modules/sheet-images/picture-paint-effects";
import {
  downloadWorkbookBundle,
  downloadWorkbookJson,
  parseWorkbookJson,
  readWorkbookBundleFile,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import {
  assertXlsxPictureGeometrySupport,
  prepareXlsxImages,
} from "../../../modules/workbook-xlsx/prepareXlsxImages";
import { framedCellPicture } from "./cell-picture-fixture";
import { framedPicture } from "./framed-picture-fixture";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet", sheetName: "Synthetic" });
  return { workbook, sheet: getActiveSheet(workbook) };
}

function unsupported(): FramedCellImage {
  const image = framedCellPicture();
  image.transform = { appearance: { reflection: true } };
  return image;
}

describe("source-bearing cell internal content admission", () => {
  test("internal recovery accepts genuine cell geometry and preserves the complete snapshot", () => {
    const { workbook, sheet } = fixture();
    const image = framedCellPicture();
    image.frame.cropShape = { preset: "ellipse" };
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image });
    const before = serializeWorkbook(workbook);
    expect(before.version).toBe(53);
    expect(() => assertWorkbookPictureSupport(workbook)).not.toThrow();
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("nonprinting unsupported cell content still fails before workbook mutation", () => {
    const { workbook, sheet } = fixture();
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image: unsupported() });
    const before = serializeWorkbook(workbook);
    expect(() => assertWorkbookPictureSupport(workbook)).toThrow(UnsupportedPicturePaintError);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("set contents and style-history ingress validate every proposed cell image", () => {
    const { workbook, sheet } = fixture();
    const before = serializeWorkbook(workbook);
    const content = { kind: "image" as const, image: unsupported() };
    const commands: WorkbookCommand[] = [
      {
        type: "setCellContents",
        changes: [
          {
            sheetId: sheet.id,
            address: { row: 0, column: 0 },
            content: { kind: "literal", value: 1 },
          },
          { sheetId: sheet.id, address: { row: 3, column: 2 }, content },
        ],
      },
      {
        type: "restoreCellStyles",
        sheetId: sheet.id,
        changes: [{ address: { row: 3, column: 2 }, style: null, content }],
      },
    ];
    for (const command of commands)
      expect(() => assertPictureCommandSupport(command, workbook)).toThrow(
        UnsupportedPicturePaintError,
      );
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("sparse restores preflight their own cell contents", () => {
    const { workbook, sheet } = fixture();
    const state = createSheetSparseState(sheet);
    state.cells.push({
      address: { row: 3, column: 2 },
      content: { kind: "image", image: unsupported() },
    });
    const commands: WorkbookCommand[] = [
      { type: "restoreSheetState", sheetId: sheet.id, state },
      {
        type: "restoreCellShift",
        sheetId: sheet.id,
        state,
        direction: "right",
        operation: "insert",
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        workbookFormulaSources: [],
        definedNames: [],
      },
      { type: "restoreTableTransaction", states: [{ sheetId: sheet.id, state }], tableStyles: [] },
    ];
    const before = serializeWorkbook(workbook);
    for (const command of commands)
      expect(() => assertPictureCommandSupport(command, workbook)).toThrow(
        UnsupportedPicturePaintError,
      );
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("new sheets and theme candidates use the source presentation preflight", () => {
    const { workbook, sheet } = fixture();
    const added = createSheet("Added", "added");
    setCellContent(added, { row: 3, column: 2 }, { kind: "image", image: unsupported() });
    const before = serializeWorkbook(workbook);
    expect(() =>
      assertPictureCommandSupport(
        { type: "addSheet", sheet: serializeSheet(added), index: 1, activeSheetId: added.id },
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image: framedCellPicture() });
    const theme = cloneWorkbookTheme(workbook.theme);
    theme.effects.outlineWidth = Number.NaN;
    expect(() =>
      assertPictureCommandSupport({ type: "setWorkbookTheme", theme }, workbook),
    ).toThrow(TypeError);
    expect(workbook.sheets.has(added.id)).toBe(false);
    expect(serializeWorkbook(workbook).sheets).toHaveLength(before.sheets.length);
  });

  test("both conversion directions and their exact restore are projected on a detached workbook", () => {
    const { workbook, sheet } = fixture();
    const picture = framedPicture();
    picture.transform = { appearance: { reflection: true } };
    sheet.floatingImages = [picture];
    const before = serializeWorkbook(workbook);
    expect(() =>
      assertPictureCommandSupport(
        { type: "convertFloatingImageToCell", sheetId: sheet.id, id: picture.id },
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
    expect(serializeWorkbook(workbook)).toEqual(before);
    sheet.floatingImages = [];
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image: unsupported() });
    const cellBefore = serializeWorkbook(workbook);
    expect(() =>
      assertPictureCommandSupport(
        {
          type: "convertCellImageToFloating",
          sheetId: sheet.id,
          address: { row: 3, column: 2 },
          imageId: "new",
          size: { width: 200, height: 100 },
        },
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
    expect(() =>
      assertPictureCommandSupport(
        {
          type: "restorePictureCellConversion",
          sheetId: sheet.id,
          address: { row: 3, column: 2 },
          images: [],
          content: { kind: "image", image: unsupported() },
        },
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
    expect(serializeWorkbook(workbook)).toEqual(cellBefore);
  });

  test("supported framed cell set and exact restore remain admitted", () => {
    const { workbook, sheet } = fixture();
    const content = { kind: "image" as const, image: framedCellPicture() };
    expect(() =>
      assertPictureCommandSupport(
        {
          type: "setCellContents",
          changes: [{ sheetId: sheet.id, address: { row: 3, column: 2 }, content }],
        },
        workbook,
      ),
    ).not.toThrow();
    expect(() =>
      assertPictureCommandSupport(
        {
          type: "restorePictureCellConversion",
          sheetId: sheet.id,
          address: { row: 3, column: 2 },
          images: [],
          content,
        },
        workbook,
      ),
    ).not.toThrow();
    expect(sheet.cells.size).toBe(0);
  });
});

describe("paused source-bearing cell external consumers", () => {
  test("portable JSON and XLSX refuse before asset reads, writes, decoding or download targets", async () => {
    const { workbook, sheet } = fixture();
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "image", image: framedCellPicture() });
    const before = serializeWorkbook(workbook);
    const get = vi.fn(async () => undefined);
    const put = vi.fn(async () => {});
    const store = { get, put };
    const createUrl = vi.spyOn(URL, "createObjectURL");
    expect(() => downloadWorkbookJson(workbook)).toThrow(/does not support/);
    expect(() => parseWorkbookJson(JSON.stringify(before))).toThrow(
      expect.objectContaining({ code: "unsupported-picture-frame" }),
    );
    await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow(/does not support/);
    await expect(
      readWorkbookBundleFile(
        {
          text: async () =>
            JSON.stringify({
              format: "sheetcraft-workbook",
              version: 1,
              snapshot: before,
              images: [{ id: "cell-source", data: "bad" }],
            }),
        },
        store,
      ),
    ).rejects.toMatchObject({ code: "unsupported-picture-frame" });
    await expect(prepareXlsxImages(before, store)).rejects.toMatchObject({
      report: {
        issues: [{ code: "feature-omitted", severity: "block", locations: ["Synthetic!C4.frame"] }],
      },
    });
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    createUrl.mockRestore();
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each([undefined, null, {}, { kind: "future-cell-frame" }])(
    "own malformed frame presence is explicitly blocked: %j",
    (frame) => {
      const { workbook, sheet } = fixture();
      sheet.cells.set("3:2", {
        content: {
          kind: "image",
          image: { assetId: "source", altText: "Framed", frame } as CellImage,
        },
      });
      expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(
        expect.objectContaining({ code: "unsupported-picture-frame", imageIds: ["cell:3:2"] }),
      );
      expect(() => assertXlsxPictureGeometrySupport(workbook)).toThrow(
        expect.objectContaining({
          report: {
            issues: [
              {
                code: "feature-omitted",
                severity: "block",
                count: 1,
                locations: ["Synthetic!C4.frame"],
              },
            ],
          },
        }),
      );
    },
  );

  test("external gates check frame presence without invoking its getter", () => {
    const { workbook, sheet } = fixture();
    const getter = vi.fn(() => {
      throw new Error("Must not inspect frame data.");
    });
    const image = Object.defineProperty({ assetId: "source", altText: "Framed" }, "frame", {
      get: getter,
    }) as CellImage;
    sheet.cells.set("3:2", { content: { kind: "image", image } });
    expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/does not support/);
    expect(() => assertXlsxPictureGeometrySupport(workbook)).toThrow(/not yet supported/);
    expect(getter).not.toHaveBeenCalled();
  });

  test("legacy cell geometry retains the existing external admission path", () => {
    const { workbook, sheet } = fixture();
    setCellContent(
      sheet,
      { row: 3, column: 2 },
      {
        kind: "image",
        image: { assetId: "source", altText: "Legacy", transform: { rotation: 90 } },
      },
    );
    expect(() => assertExternalPictureGroupSupport(workbook)).not.toThrow();
    expect(() => assertXlsxPictureGeometrySupport(workbook)).not.toThrow();
    const snapshot = serializeWorkbook(workbook);
    expect(serializeWorkbook(parseWorkbookJson(JSON.stringify(snapshot)))).toEqual(snapshot);
  });
});
