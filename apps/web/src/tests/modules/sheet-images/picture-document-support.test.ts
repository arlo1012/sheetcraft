import { describe, expect, test } from "vitest";
import {
  createSetFloatingImageCommand,
  createSetSheetFloatingImagesCommand,
  createSetWorkbookThemeCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  createSheet,
  createSheetSparseState,
  createWorkbook,
  getActiveSheet,
} from "@sheetcraft/core/workbook";
import {
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "@sheetcraft/core/serialization";
import { cloneWorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  assertPictureCommandSupport,
  assertWorkbookPictureSupport,
} from "../../../modules/sheet-images/picture-document-support";
import { UnsupportedPicturePaintError } from "../../../modules/sheet-images/picture-paint-effects";
import { framedPicture } from "./framed-picture-fixture";
import { pictureGroup } from "./picture-group-fixture";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  return { workbook, sheet: getActiveSheet(workbook) };
}

function reflectedGroup() {
  const group = pictureGroup();
  group.hidden = true;
  const leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected source-bearing fixture.");
  leaf.hidden = true;
  leaf.transform = { appearance: { reflection: true } };
  return group;
}

describe("internal picture document support preflight", () => {
  test("preflights proposed row baselines in sparse and dimension restore shadows", () => {
    const { workbook, sheet } = fixture();
    const state = createSheetSparseState(sheet);
    state.defaultRowHeight = 20;
    state.rowHeights = [{ index: 1, size: 24 }];
    state.floatingImages = [framedPicture()];
    const sparse: WorkbookCommand = { type: "restoreSheetState", sheetId: sheet.id, state };
    const dimensions: WorkbookCommand = {
      type: "restoreSheetDimensionState",
      sheetId: sheet.id,
      axis: "row",
      defaultRowHeight: 20,
      dimensions: state.rowHeights,
      hiddenIndexes: [2],
      floatingImageState: state.floatingImages,
    };
    const before = serializeWorkbook(workbook);
    expect(() => assertPictureCommandSupport(sparse, workbook)).not.toThrow();
    expect(() => assertPictureCommandSupport(dimensions, workbook)).not.toThrow();
    state.defaultRowHeight = Number.NaN;
    expect(() => assertPictureCommandSupport(sparse, workbook)).toThrow(/default axis size/);
    expect(() =>
      assertPictureCommandSupport({ ...dimensions, defaultRowHeight: Number.NaN }, workbook),
    ).toThrow(/default axis size/);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test.each([
    { image: framedPicture(), version: 47 },
    { image: pictureGroup(), version: 48 },
  ])(
    "accepts and preserves genuine snapshot$version with default Office effects",
    ({ image, version }) => {
      const { workbook, sheet } = fixture();
      image.hidden = true;
      sheet.floatingImages = [image];
      const before = serializeWorkbook(workbook);
      expect(before.version).toBe(version);
      expect(workbook.theme.effects).toMatchObject({ shadow: "soft", outlineWidth: 1 });
      const recovered = deserializeWorkbook(before);
      expect(() => assertWorkbookPictureSupport(recovered)).not.toThrow();
      expect(serializeWorkbook(recovered)).toEqual(before);
      expect(serializeWorkbook(workbook)).toEqual(before);
    },
  );

  test("hidden invalid and unsupported leaves are preflighted without changing the document", () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages = [reflectedGroup()];
    const before = serializeWorkbook(workbook);
    expect(() => assertWorkbookPictureSupport(workbook)).toThrow(UnsupportedPicturePaintError);
    expect(serializeWorkbook(workbook)).toEqual(before);
    const invalid = pictureGroup();
    invalid.hidden = true;
    invalid.members[0]!.frame.rect.widthRatio = 0;
    sheet.floatingImages = [invalid];
    expect(() => assertWorkbookPictureSupport(workbook)).toThrow();
    expect(invalid.members[0]!.frame.rect.widthRatio).toBe(0);
  });

  test("single-image ingress validates the entire proposed collection and owned identities", () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages = [pictureGroup()];
    const before = serializeWorkbook(workbook);
    const command = createSetFloatingImageCommand(sheet.id, {
      ...framedPicture(),
      id: "owned-leaf",
    });
    expect(() => assertPictureCommandSupport(command, workbook)).toThrow(/identity|duplicate/i);
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(() =>
      assertPictureCommandSupport(
        createSetSheetFloatingImagesCommand(sheet.id, [reflectedGroup()]),
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
  });

  test("theme candidates validate inherited effects against all hidden owned content", () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages = [pictureGroup(), framedPicture()];
    sheet.floatingImages.forEach((image) => {
      image.hidden = true;
    });
    const before = serializeWorkbook(workbook);
    const theme = cloneWorkbookTheme(workbook.theme);
    theme.effects.reflection = true;
    expect(() =>
      assertPictureCommandSupport(createSetWorkbookThemeCommand(theme), workbook),
    ).not.toThrow();
    const invalid = { ...theme, effects: { ...theme.effects, outlineWidth: Number.NaN } };
    expect(() =>
      assertPictureCommandSupport({ type: "setWorkbookTheme", theme: invalid }, workbook),
    ).toThrow(TypeError);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("restoration candidates use their own complete image and worksheet dimension state", () => {
    const { workbook, sheet } = fixture();
    const state = createSheetSparseState(sheet);
    state.floatingImages = [pictureGroup()];
    state.rowHeights = [{ index: 0, size: -1 }];
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
      {
        type: "restoreSheetDimensionState",
        sheetId: sheet.id,
        axis: "row",
        dimensions: state.rowHeights,
        hiddenIndexes: [],
        floatingImageState: state.floatingImages,
      },
    ];
    const before = serializeWorkbook(workbook);
    for (const command of commands)
      expect(() => assertPictureCommandSupport(command, workbook)).toThrow(/axis size/);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });

  test("new-sheet snapshot ingress uses the added sheet's metrics and rejects hidden reflection", () => {
    const { workbook } = fixture();
    const added = createSheet("Added", "added");
    added.floatingImages = [reflectedGroup()];
    const before = serializeWorkbook(workbook);
    expect(() =>
      assertPictureCommandSupport(
        {
          type: "addSheet",
          sheet: serializeSheet(added),
          index: 1,
          activeSheetId: added.id,
        },
        workbook,
      ),
    ).toThrow(UnsupportedPicturePaintError);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
