import { describe, expect, test } from "vitest";
import { normalizeImageAppearance, type ImageAppearance } from "../../image-appearance.js";
import { cloneImageTransform } from "../../image-transform.js";
import {
  applyWorkbookCommand,
  createSetFloatingImageCommand,
  createSetSheetFloatingImagesCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  cloneFloatingImage,
  getActiveSheet,
  setCellContent,
  type FloatingImage,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function picture(id = "picture"): FloatingImage {
  return {
    id,
    assetId: "asset",
    altText: "Picture",
    anchor: { row: 1, column: 2 },
    offsetX: 12,
    offsetY: 8,
    width: 180,
    height: 90,
  };
}

describe("picture styling", () => {
  test("validates every picture and duplicate ID before replacing any sheet picture", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.floatingImages = [picture("original")];
    const before = structuredClone(sheet.floatingImages);
    for (const images of [
      [picture("duplicate"), picture("duplicate")],
      [picture("valid"), { ...picture("invalid"), width: 0 }],
    ]) {
      expect(() => createSetSheetFloatingImagesCommand(sheet.id, images)).toThrow();
      expect(() =>
        applyWorkbookCommand(session.workbook, {
          type: "setSheetFloatingImages",
          sheetId: sheet.id,
          images,
        }),
      ).toThrow();
      expect(sheet.floatingImages).toEqual(before);
    }
  });

  test("replaces a picture collection with one history entry and restores it with one undo", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.floatingImages = [picture("a"), picture("b"), picture("c")];
    const before = structuredClone(sheet.floatingImages);
    const after = [
      { ...picture("c"), hidden: true },
      { ...picture("a"), groupId: "group" },
    ];
    expect(
      executeWorkbookCommand(session, createSetSheetFloatingImagesCommand(sheet.id, after)),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(sheet.floatingImages).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual(before);
    expect(undoWorkbookCommand(session)).toBe(false);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(sheet.floatingImages).toEqual(after);
  });

  test("removes default effects and normalizes color values", () => {
    expect(normalizeImageAppearance(undefined)).toBeUndefined();
    expect(
      normalizeImageAppearance({
        opacity: 1,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        grayscale: 0,
        sepia: 0,
        transparentTolerance: 0,
        reflection: false,
        border: { color: "#abcdef", width: 0 },
      }),
    ).toBeUndefined();
    expect(
      normalizeImageAppearance({
        opacity: 0,
        brightness: 2,
        contrast: 0,
        saturation: 2,
        grayscale: 1,
        sepia: 1,
        transparentColor: "#abcdef",
        transparentTolerance: 255,
        border: { color: "#aabbcc", width: 20 },
        shadow: "soft",
        reflection: true,
      }),
    ).toEqual({
      opacity: 0,
      brightness: 2,
      contrast: 0,
      saturation: 2,
      grayscale: 1,
      sepia: 1,
      transparentColor: "#ABCDEF",
      transparentTolerance: 255,
      border: { color: "#AABBCC", width: 20 },
      shadow: "soft",
      reflection: true,
    });
  });

  test.each([
    { opacity: -0.1 },
    { opacity: 1.1 },
    { brightness: Infinity },
    { contrast: NaN },
    { saturation: 2.1 },
    { grayscale: -1 },
    { sepia: 2 },
    { transparentColor: "red" },
    { transparentTolerance: 1 },
    { transparentColor: "#ffffff", transparentTolerance: 256 },
    { border: { color: "#fff", width: 1 } },
    { border: { color: "#ffffff", width: -1 } },
    { border: { color: "#ffffff", width: 21 } },
    { shadow: "unknown" },
    { reflection: "yes" },
    null,
    [],
  ])("rejects invalid appearance %j", (appearance) => {
    expect(() => normalizeImageAppearance(appearance as ImageAppearance)).toThrow();
  });

  test("deep clones appearance, border, crop, and floating anchors", () => {
    const image: FloatingImage = {
      ...picture(),
      transform: {
        appearance: { border: { color: "#abcdef", width: 2 }, brightness: 1.5 },
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
      },
    };
    const cloned = cloneFloatingImage(image);
    const transform = cloneImageTransform(image.transform)!;
    cloned.anchor.row = 9;
    cloned.transform!.appearance!.border!.width = 4;
    transform.appearance!.border!.color = "#000000";
    transform.crop!.x = 0.2;
    expect(image.anchor.row).toBe(1);
    expect(image.transform!.appearance!.border).toEqual({ color: "#abcdef", width: 2 });
    expect(image.transform!.crop!.x).toBe(0.1);
  });

  test("reorders an existing picture and restores geometry and order through undo and redo", () => {
    const { workbook } = createTestWorkbookSession();
    const sheet = getActiveSheet(workbook);
    for (const id of ["rear", "middle", "front"])
      applyWorkbookCommand(workbook, createSetFloatingImageCommand(sheet.id, picture(id)));
    const before = structuredClone(sheet.floatingImages);
    const undo = applyWorkbookCommand(
      workbook,
      createSetFloatingImageCommand(sheet.id, { ...picture("rear"), width: 240 }, 2),
    );
    expect(sheet.floatingImages.map((image) => image.id)).toEqual(["middle", "front", "rear"]);
    expect(sheet.floatingImages[2]?.width).toBe(240);
    const redo = applyWorkbookCommand(workbook, undo!);
    expect(sheet.floatingImages).toEqual(before);
    applyWorkbookCommand(workbook, redo!);
    expect(sheet.floatingImages.map((image) => image.id)).toEqual(["middle", "front", "rear"]);
    expect(sheet.floatingImages[2]?.width).toBe(240);
  });

  test("round trips V24 visibility, grouping, aspect lock and picture styling", () => {
    const { workbook } = createTestWorkbookSession();
    const sheet = getActiveSheet(workbook);
    const image = {
      ...picture(),
      hidden: true,
      groupId: "group-1",
      lockAspectRatio: false,
      transform: {
        appearance: {
          border: { color: "#ABCDEF", width: 2 },
          shadow: "hard" as const,
          reflection: true,
          opacity: 0.5,
        },
      },
    };
    applyWorkbookCommand(workbook, createSetFloatingImageCommand(sheet.id, image));
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "image", image: { assetId: "cell-asset", altText: "", transform: image.transform } },
    );
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(34);
    expect(getActiveSheet(deserializeWorkbook(snapshot)).floatingImages).toEqual([image]);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
  });

  test.each(["hidden", "groupId", "lockAspectRatio", "appearance"] as const)(
    "rejects new floating picture field %s in V23 snapshots",
    (field) => {
      const { workbook } = createTestWorkbookSession();
      const sheet = getActiveSheet(workbook);
      const image = picture();
      if (field === "hidden") image.hidden = false;
      if (field === "groupId") image.groupId = "group";
      if (field === "lockAspectRatio") image.lockAspectRatio = true;
      if (field === "appearance") image.transform = { appearance: { brightness: 1.2 } };
      applyWorkbookCommand(workbook, createSetFloatingImageCommand(sheet.id, image));
      const snapshot = { ...serializeWorkbook(workbook), version: 23 };
      expect(() => deserializeWorkbook(snapshot)).toThrow(/version 24/);
    },
  );

  test("rejects styled cell images in V23 snapshots", () => {
    const { workbook } = createTestWorkbookSession();
    setCellContent(
      getActiveSheet(workbook),
      { row: 0, column: 0 },
      {
        kind: "image",
        image: { assetId: "asset", altText: "", transform: { appearance: { sepia: 0.5 } } },
      },
    );
    expect(() => deserializeWorkbook({ ...serializeWorkbook(workbook), version: 23 })).toThrow(
      /version 24/,
    );
  });
});
