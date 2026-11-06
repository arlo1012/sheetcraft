// NOT RUN：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import { createInsertPictureBatchCommand, type WorkbookCommand } from "../../commands/index.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  getActiveSheet,
  getCellContent,
  MAX_ROW_HEIGHT,
  MAX_SHEET_ROWS,
  setCellContent,
  type LegacyFloatingImage,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { fixture as pivotFixture } from "../pivot-tables/fixture.js";

type BatchPayload = Parameters<typeof createInsertPictureBatchCommand>[1];
const imageCell = { row: 1, column: 1 };
const captionCell = { row: 2, column: 1 };

function picture(id: string): LegacyFloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: id,
    anchor: { row: 1, column: 0 },
    offsetX: 12,
    offsetY: 8,
    width: 160,
    height: 90,
  };
}

function payload(sheetId: string): BatchPayload {
  return {
    cells: [
      {
        sheetId,
        address: imageCell,
        content: { kind: "image", image: { assetId: "asset-cell", altText: "Cell picture" } },
      },
      { sheetId, address: captionCell, content: { kind: "literal", value: "Batch caption" } },
    ],
    rowHeights: [
      { index: 1, size: 120 },
      { index: 3, size: 150 },
    ],
    images: [picture("new")],
  };
}

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.rowHeights.set(1, 30);
  sheet.rowHeights.set(7, 35);
  sheet.floatingImages = [picture("existing")];
  setCellContent(sheet, captionCell, { kind: "literal", value: "Old caption" });
  return { session, sheet };
}

function expectAtomicRejection(
  session: ReturnType<typeof createTestWorkbookSession>,
  command: () => WorkbookCommand,
) {
  const before = serializeWorkbook(session.workbook);
  const history = JSON.stringify(session.history);
  expect(() => executeWorkbookCommand(session, command())).toThrow();
  expect(serializeWorkbook(session.workbook)).toEqual(before);
  expect(JSON.stringify(session.history)).toBe(history);
}

describe("atomic picture batch insertion", () => {
  test("commits pictures, captions and row heights in one history entry with exact Undo and Redo", () => {
    const f = fixture();
    const originalPicture = structuredClone(f.sheet.floatingImages[0]);
    const before = serializeWorkbook(f.session.workbook);

    expect(
      executeWorkbookCommand(
        f.session,
        createInsertPictureBatchCommand(f.sheet.id, payload(f.sheet.id)),
      ),
    ).toBe(true);

    expect(getCellContent(f.sheet, imageCell)).toEqual({
      kind: "image",
      image: { assetId: "asset-cell", altText: "Cell picture" },
    });
    expect(getCellContent(f.sheet, captionCell)).toEqual({
      kind: "literal",
      value: "Batch caption",
    });
    expect(f.sheet.rowHeights).toEqual(
      new Map([
        [1, 120],
        [7, 35],
        [3, 150],
      ]),
    );
    expect(f.sheet.floatingImages).toEqual([originalPicture, picture("new")]);
    expect(f.session.history.undoStack).toHaveLength(1);
    const inserted = serializeWorkbook(f.session.workbook);

    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(inserted);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("rejects a locked caption without applying earlier row heights or unlocked picture cells", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = {
      editableRanges: [{ name: "Picture input", range: { start: imageCell, end: imageCell } }],
      formatRows: true,
      editObjects: true,
    };
    expectAtomicRejection(f.session, () =>
      createInsertPictureBatchCommand(f.sheet.id, payload(f.sheet.id)),
    );
  });

  test("requires row resize permission even when picture and caption cells are editable", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = {
      editableRanges: [{ name: "Batch cells", range: { start: imageCell, end: captionCell } }],
      formatRows: false,
      editObjects: true,
    };
    expectAtomicRejection(f.session, () =>
      createInsertPictureBatchCommand(f.sheet.id, payload(f.sheet.id)),
    );
  });

  test("admits a protected-sheet batch when cells, row resizing and object edits are all permitted", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.protection = {
      editableRanges: [{ name: "Batch cells", range: { start: imageCell, end: captionCell } }],
      formatRows: true,
      editObjects: true,
    };
    expect(
      executeWorkbookCommand(
        f.session,
        createInsertPictureBatchCommand(f.sheet.id, payload(f.sheet.id)),
      ),
    ).toBe(true);
    expect(getCellContent(f.sheet, captionCell)).toEqual({
      kind: "literal",
      value: "Batch caption",
    });
    expect(f.sheet.rowHeights.get(1)).toBe(120);
    expect(f.sheet.floatingImages.map(({ id }) => id)).toEqual(["existing", "new"]);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test("rejects a caption that fails stopping data validation before applying any batch changes", () => {
    const f = fixture();
    f.sheet.dataValidations = [
      {
        id: "caption-values",
        range: { start: captionCell, end: captionCell },
        type: "list",
        list: ["Old caption", "Allowed caption"],
        allowBlank: false,
        errorStyle: "stop",
      },
    ];
    expectAtomicRejection(f.session, () =>
      createInsertPictureBatchCommand(f.sheet.id, payload(f.sheet.id)),
    );
  });

  test("rejects a caption in pivot output without first resizing rows, writing other cells or adding images", () => {
    const f = pivotFixture();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const ordinary = { row: 10, column: 0 };
    expectAtomicRejection(f.session, () =>
      createInsertPictureBatchCommand(f.destination.id, {
        cells: [
          {
            sheetId: f.destination.id,
            address: ordinary,
            content: { kind: "image", image: { assetId: "outside-pivot", altText: "Picture" } },
          },
          {
            sheetId: f.destination.id,
            address: { row: 10, column: 1 },
            content: { kind: "literal", value: "Ordinary caption" },
          },
          {
            sheetId: f.destination.id,
            address: { row: 3, column: 3 },
            content: { kind: "literal", value: "Forbidden pivot caption" },
          },
        ],
        rowHeights: [{ index: 10, size: 120 }],
        images: [picture("pivot-batch")],
      }),
    );
  });

  test.each([
    { name: "negative row", row: { index: -1, size: 120 } },
    { name: "row past the sheet", row: { index: MAX_SHEET_ROWS, size: 120 } },
    { name: "fractional row", row: { index: 1.5, size: 120 } },
    { name: "zero height", row: { index: 3, size: 0 } },
    { name: "excessive height", row: { index: 3, size: MAX_ROW_HEIGHT + 1 } },
    { name: "non-finite height", row: { index: 3, size: NaN } },
  ])("rejects $name without partially writing valid cells or pictures", ({ row }) => {
    const f = fixture();
    const batch = payload(f.sheet.id);
    batch.rowHeights = [{ index: 1, size: 120 }, row];
    expectAtomicRejection(f.session, () => createInsertPictureBatchCommand(f.sheet.id, batch));
  });

  test("rejects duplicate row height entries atomically", () => {
    const f = fixture();
    const batch = payload(f.sheet.id);
    batch.rowHeights = [
      { index: 1, size: 120 },
      { index: 1, size: 150 },
    ];
    expectAtomicRejection(f.session, () => createInsertPictureBatchCommand(f.sheet.id, batch));
  });

  test.each([
    { name: "zero image width", image: { ...picture("bad"), width: 0 } },
    { name: "negative image offset", image: { ...picture("bad"), offsetX: -1 } },
    { name: "existing image ID collision", image: picture("existing") },
  ])("rejects $name without writing captions or row heights", ({ image }) => {
    const f = fixture();
    const batch = payload(f.sheet.id);
    batch.images = [image];
    expectAtomicRejection(f.session, () => createInsertPictureBatchCommand(f.sheet.id, batch));
  });

  test("rejects caption changes addressed to a different sheet", () => {
    const f = fixture();
    const batch = payload(f.sheet.id);
    batch.cells[1] = { ...batch.cells[1]!, sheetId: "other-sheet" };
    expectAtomicRejection(f.session, () => createInsertPictureBatchCommand(f.sheet.id, batch));
  });

  test("retains existing floating images through a row-size-only batch and its Undo and Redo", () => {
    const f = fixture();
    const originalPictures = structuredClone(f.sheet.floatingImages);
    const before = serializeWorkbook(f.session.workbook);
    expect(
      executeWorkbookCommand(
        f.session,
        createInsertPictureBatchCommand(f.sheet.id, {
          cells: [],
          rowHeights: [{ index: 1, size: 140 }],
          images: [],
        }),
      ),
    ).toBe(true);
    expect(f.sheet.floatingImages).toEqual(originalPictures);
    const resized = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(resized);
    expect(f.sheet.floatingImages).toEqual(originalPictures);
  });

  test("does not admit the internal batch restoration command as a public edit", () => {
    const f = fixture();
    expectAtomicRejection(f.session, () => ({ type: "restorePictureBatch", commands: [] }));
  });
});
