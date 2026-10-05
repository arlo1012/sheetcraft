import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createDeleteFloatingImageCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createConvertFloatingImageToCellCommand,
  createConvertCellImageToFloatingCommand,
  createMergeCellsCommand,
  createSetCellContentCommand,
  createSetFloatingImageCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createResizeSheetDimensionCommand,
  createSortSheetRangeCommand,
  tryApplyWorkbookCommand,
} from "../../commands/index.js";
import { translateCellContentForCopy } from "../../clipboard.js";
import { formatCellContentForInput } from "../../input.js";
import { createFormulaError } from "../../formula/types.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createSheetSparseState,
  getActiveSheet,
  getCellComputedValue,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const image = {
  id: "floating-image-1",
  assetId: "asset-1",
  altText: "Chart",
  anchor: { row: 3, column: 2 },
  offsetX: 12,
  offsetY: 8,
  width: 160,
  height: 90,
};

describe("sheet images", () => {
  test("stores an image-exclusive cell, projects it as a value error, and restores overwrite", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Revenue chart" },
        },
      ),
    );
    expect(formatCellContentForInput(getCellContent(sheet, { row: 1, column: 1 }))).toBe("");
    expect(getCellComputedValue(sheet, { row: 1, column: 1 })).toEqual({
      kind: "formula-error",
      code: "VALUE",
    });

    const inverse = applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 1 },
        { kind: "literal", value: "text" },
      ),
    );
    expect(inverse).not.toBeNull();
    applyWorkbookCommand(session.workbook, inverse!);
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "image",
      image: { assetId: "asset-cell", altText: "Revenue chart" },
    });
  });

  test("validates, updates, deletes, and restores a floating image with serialized inverses", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const inverse = applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, image),
    );
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);
    expect(sheet.floatingImages).toEqual([image]);
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, {
        ...image,
        id: "floating-image-2",
      }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, {
        ...image,
        id: "floating-image-3",
      }),
    );
    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteFloatingImageCommand(sheet.id, "floating-image-2"),
    );
    expect(sheet.floatingImages.map((item) => item.id)).toEqual([
      "floating-image-1",
      "floating-image-3",
    ]);
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(sheet.floatingImages.map((item) => item.id)).toEqual([
      "floating-image-1",
      "floating-image-2",
      "floating-image-3",
    ]);
    expect(() => createSetFloatingImageCommand(sheet.id, { ...image, width: 0 })).toThrow();
    expect(() => createSetFloatingImageCommand(sheet.id, { ...image, offsetX: -1 })).toThrow();
  });

  test("converts a floating image into a blank cell and produces a transport-safe inverse", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));

    const inverse = applyWorkbookCommand(
      session.workbook,
      createConvertFloatingImageToCellCommand(sheet.id, image.id),
    );

    expect(sheet.floatingImages).toEqual([]);
    expect(getCellContent(sheet, image.anchor)).toEqual({
      kind: "image",
      image: { assetId: image.assetId, altText: image.altText },
    });
    expect(JSON.parse(JSON.stringify(inverse))).toEqual(inverse);
    expect(
      applyWorkbookCommand(
        session.workbook,
        createConvertFloatingImageToCellCommand(sheet.id, "missing-image"),
      ),
    ).toBeNull();
  });

  test("preserves normalized image transforms through copy, conversion, and V5 snapshots", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const transform = {
      crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      rotation: 90 as const,
    };
    const floating = { ...image, transform };
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, floating));
    const copied = translateCellContentForCopy(
      {
        kind: "image",
        image: { assetId: "asset-cell", altText: "Cell chart", transform },
      },
      { row: 0, column: 0 },
      { row: 1, column: 1 },
    );
    expect(copied).toEqual({
      kind: "image",
      image: { assetId: "asset-cell", altText: "Cell chart", transform },
    });
    const undo = applyWorkbookCommand(
      session.workbook,
      createConvertFloatingImageToCellCommand(sheet.id, floating.id),
    );
    expect(getCellContent(sheet, floating.anchor)).toEqual({
      kind: "image",
      image: {
        assetId: floating.assetId,
        altText: floating.altText,
        transform,
      },
    });
    applyWorkbookCommand(session.workbook, undo!);
    expect(sheet.floatingImages).toEqual([floating]);
    expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(session.workbook)))).toEqual(
      serializeWorkbook(session.workbook),
    );
    const legacyV4 = structuredClone(serializeWorkbook(session.workbook));
    legacyV4.version = 4 as never;
    delete legacyV4.sheets[0]?.floatingImages[0]?.transform;
    const migrated = serializeWorkbook(deserializeWorkbook(legacyV4));
    expect(migrated.version).toBe(32);
    expect(migrated.sheets[0]?.floatingImages[0]?.transform).toBeUndefined();
    const v5WithFlips = structuredClone(serializeWorkbook(session.workbook));
    v5WithFlips.version = 5 as never;
    expect(
      serializeWorkbook(deserializeWorkbook(v5WithFlips)).sheets[0]?.floatingImages[0]?.transform,
    ).toEqual(transform);
    expect(() =>
      createSetFloatingImageCommand(sheet.id, {
        ...image,
        transform: { flipHorizontal: "yes" as never },
      }),
    ).toThrow();
  });

  test("restores occupied merged targets and floating-image z-order through undo and redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const front = { ...image, id: "front", anchor: { row: 0, column: 0 } };
    const mergedImage = {
      ...image,
      id: "merged",
      anchor: { row: 3, column: 2 },
    };
    const rear = { ...image, id: "rear", anchor: { row: 6, column: 6 } };
    const target = { row: 2, column: 1 };
    applyWorkbookCommand(
      session.workbook,
      createMergeCellsCommand(sheet.id, {
        start: target,
        end: { row: 3, column: 2 },
      }),
    );
    setCellContent(sheet, target, { kind: "literal", value: "replace me" });
    setCellStyle(sheet, target, { fillColor: "#ff00ff" });
    for (const floatingImage of [front, mergedImage, rear]) {
      applyWorkbookCommand(
        session.workbook,
        createSetFloatingImageCommand(sheet.id, floatingImage),
      );
    }

    const undo = applyWorkbookCommand(
      session.workbook,
      createConvertFloatingImageToCellCommand(sheet.id, mergedImage.id),
    );
    expect(sheet.floatingImages.map((item) => item.id)).toEqual(["front", "rear"]);
    expect(getCellContent(sheet, target)).toEqual({
      kind: "image",
      image: { assetId: mergedImage.assetId, altText: mergedImage.altText },
    });
    expect(getCellStyle(sheet, target)).toEqual({ fillColor: "#ff00ff" });

    const redo = applyWorkbookCommand(session.workbook, undo!);
    expect(sheet.floatingImages.map((item) => item.id)).toEqual(["front", "merged", "rear"]);
    expect(getCellContent(sheet, target)).toEqual({
      kind: "literal",
      value: "replace me",
    });
    expect(getCellStyle(sheet, target)).toEqual({ fillColor: "#ff00ff" });

    applyWorkbookCommand(session.workbook, redo!);
    expect(sheet.floatingImages.map((item) => item.id)).toEqual(["front", "rear"]);
    expect(getCellContent(sheet, target)).toEqual({
      kind: "image",
      image: { assetId: mergedImage.assetId, altText: mergedImage.altText },
    });
  });

  test("converts a merged cell image into a floating image and restores its geometry on redo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const target = { row: 4, column: 3 };
    const innerAddress = { row: 5, column: 4 };
    applyWorkbookCommand(
      session.workbook,
      createMergeCellsCommand(sheet.id, { start: target, end: innerAddress }),
    );
    setCellContent(sheet, target, {
      kind: "image",
      image: { assetId: "asset-cell", altText: "Cell chart" },
    });
    setCellStyle(sheet, target, { fillColor: "#ff00ff" });
    applyWorkbookCommand(
      session.workbook,
      createSetFloatingImageCommand(sheet.id, { ...image, id: "front" }),
    );

    const undo = applyWorkbookCommand(
      session.workbook,
      createConvertCellImageToFloatingCommand(sheet.id, innerAddress, "from-cell", {
        width: 240,
        height: 120,
      }),
    );
    expect(sheet.floatingImages).toEqual([
      { ...image, id: "front" },
      {
        id: "from-cell",
        assetId: "asset-cell",
        altText: "Cell chart",
        anchor: target,
        offsetX: 0,
        offsetY: 0,
        width: 240,
        height: 120,
      },
    ]);
    expect(getCellContent(sheet, target)).toBeNull();
    expect(getCellStyle(sheet, target)).toEqual({ fillColor: "#ff00ff" });

    const redo = applyWorkbookCommand(session.workbook, undo!);
    expect(sheet.floatingImages.map((item) => item.id)).toEqual(["front"]);
    expect(getCellContent(sheet, target)).toEqual({
      kind: "image",
      image: { assetId: "asset-cell", altText: "Cell chart" },
    });
    expect(getCellStyle(sheet, target)).toEqual({ fillColor: "#ff00ff" });

    applyWorkbookCommand(session.workbook, redo!);
    expect(sheet.floatingImages).toEqual([
      { ...image, id: "front" },
      {
        id: "from-cell",
        assetId: "asset-cell",
        altText: "Cell chart",
        anchor: target,
        offsetX: 0,
        offsetY: 0,
        width: 240,
        height: 120,
      },
    ]);
  });

  test("rejects invalid floating geometry and leaves non-image cells unchanged", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 1, column: 1 };
    setCellContent(sheet, address, {
      kind: "image",
      image: { assetId: "asset-cell", altText: "Cell chart" },
    });
    const before = createSheetSparseState(sheet);
    const invalid = tryApplyWorkbookCommand(session.workbook, {
      type: "convertCellImageToFloating",
      sheetId: sheet.id,
      address,
      imageId: "from-cell",
      size: { width: 0, height: 120 },
    });
    expect(invalid.ok).toBe(false);
    expect(createSheetSparseState(sheet)).toEqual(before);

    setCellContent(sheet, address, { kind: "literal", value: "not an image" });
    const beforeNoImage = createSheetSparseState(sheet);
    expect(
      applyWorkbookCommand(
        session.workbook,
        createConvertCellImageToFloatingCommand(sheet.id, address, "from-cell", {
          width: 120,
          height: 120,
        }),
      ),
    ).toBeNull();
    expect(createSheetSparseState(sheet)).toEqual(beforeNoImage);
  });

  test("moves anchors for insert, removes deleted anchors, and restores the exact sparse state", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    const before = createSheetSparseState(sheet);
    const insertInverse = applyWorkbookCommand(
      session.workbook,
      createInsertSheetAxisCommand(sheet.id, "row", 2),
    );
    expect(sheet.floatingImages[0]?.anchor).toEqual({ row: 4, column: 2 });
    applyWorkbookCommand(session.workbook, insertInverse!);
    expect(createSheetSparseState(sheet)).toEqual(before);

    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteSheetAxisCommand(sheet.id, "column", 2),
    );
    expect(sheet.floatingImages).toEqual([]);
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(createSheetSparseState(sheet)).toEqual(before);
  });

  test("round trips V4 image references without binary data", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 0, column: 0 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Cell chart" },
        },
      ),
    );
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(32);
    expect(JSON.stringify(snapshot)).not.toContain("data:");
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
  });

  test("copies in-cell images, preserves floating dimensions on resize, and sorts image cells", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const cellImage = {
      kind: "image" as const,
      image: { assetId: "asset-cell", altText: "Cell chart" },
    };
    expect(
      translateCellContentForCopy(cellImage, { row: 0, column: 0 }, { row: 4, column: 5 }),
    ).toEqual(cellImage);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    applyWorkbookCommand(
      session.workbook,
      createResizeSheetDimensionCommand(sheet.id, "row", image.anchor.row, 40),
    );
    expect(sheet.floatingImages[0]).toMatchObject({ width: 160, height: 90 });
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 0, column: 0 }, { kind: "literal", value: 2 }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 1 }),
    );
    applyWorkbookCommand(
      session.workbook,
      createSetCellContentCommand(sheet.id, { row: 0, column: 1 }, cellImage),
    );
    applyWorkbookCommand(
      session.workbook,
      createSortSheetRangeCommand(
        sheet.id,
        { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        0,
        "ascending",
      ),
    );
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual(cellImage);
  });

  test("preserves floating images when duplicating a sheet and restoring a deleted sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    applyWorkbookCommand(session.workbook, createSetFloatingImageCommand(sheet.id, image));
    const duplicate = createDuplicateSheetCommand(session.workbook, sheet.id, {
      id: "sheet-copy",
    });
    applyWorkbookCommand(session.workbook, duplicate);
    expect(session.workbook.sheets.get("sheet-copy")?.floatingImages).toEqual([image]);

    const deleteInverse = applyWorkbookCommand(
      session.workbook,
      createDeleteSheetCommand(session.workbook, sheet.id),
    );
    applyWorkbookCommand(session.workbook, deleteInverse!);
    expect(session.workbook.sheets.get(sheet.id)?.floatingImages).toEqual([image]);
  });

  test("migrates a V3 formula snapshot to V4 while retaining formula semantics and image references", () => {
    const workbook = deserializeWorkbook({
      version: 3,
      id: "formula-v3",
      activeSheetId: "sheet-1",
      dateSystem: "1904",
      sheets: [
        {
          id: "sheet-1",
          name: "Sheet1",
          cells: [
            {
              address: { row: 0, column: 0 },
              content: { kind: "error", error: createFormulaError("NA") },
            },
            {
              address: { row: 0, column: 1 },
              content: { kind: "formula", formula: { source: "=A1" } },
            },
          ],
          rowHeights: [],
          columnWidths: [],
          freezePanes: { rows: 0, columns: 0 },
          filter: null,
          mergedCells: [],
        },
      ],
    });
    const sheet = getActiveSheet(workbook);
    applyWorkbookCommand(
      workbook,
      createSetCellContentCommand(
        sheet.id,
        { row: 1, column: 0 },
        {
          kind: "image",
          image: { assetId: "asset-cell", altText: "Cell chart" },
        },
      ),
    );
    applyWorkbookCommand(workbook, createSetFloatingImageCommand(sheet.id, image));

    expect(serializeWorkbook(workbook)).toMatchObject({
      version: 32,
      dateSystem: "1904",
      sheets: [
        {
          floatingImages: [image],
          cells: expect.arrayContaining([
            {
              address: { row: 0, column: 0 },
              content: { kind: "error", error: createFormulaError("NA") },
            },
            {
              address: { row: 0, column: 1 },
              content: { kind: "formula", formula: { source: "=A1" } },
            },
            {
              address: { row: 1, column: 0 },
              content: {
                kind: "image",
                image: { assetId: "asset-cell", altText: "Cell chart" },
              },
            },
          ]),
        },
      ],
    });
  });
});
