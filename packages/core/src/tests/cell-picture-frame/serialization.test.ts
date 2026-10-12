import type { CellImage } from "../../cell-picture-frame.js";
import { describe, expect, test } from "vitest";
import { getActiveSheet, getCellContent, setCellContent } from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "./fixture.js";

describe("cell picture snapshot v53", () => {
  test("writes 53 only for real local geometry, round trips and deep detaches input", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    expect(serializeWorkbook(session.workbook).version).toBe(43);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "image", image: { assetId: "asset", altText: "", transform: { rotation: 90 } } },
    );
    expect(serializeWorkbook(session.workbook).version).toBe(43);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "image", image: framedCellImage() });
    const snapshot = serializeWorkbook(session.workbook),
      restored = deserializeWorkbook(snapshot);
    expect(snapshot.version).toBe(53);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    const input = snapshot.sheets[0]!.cells.find(
      (cell) => cell.content?.kind === "image" && cell.content.image.frame,
    )?.content;
    if (input?.kind === "image" && input.image.frame) input.image.frame.size.width = 99;
    expect(getCellContent(getActiveSheet(restored), { row: 1, column: 1 })).toEqual({
      kind: "image",
      image: framedCellImage(),
    });
  });
  test.each([1, 2, 3, 4, 5, 24, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52])(
    "rejects a cell frame before old version %s can skip image parsing",
    (version) => {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "image", image: framedCellImage() });
      const { dateSystem, ...snapshot } = serializeWorkbook(session.workbook);
      expect(() =>
        deserializeWorkbook({ ...snapshot, ...(version >= 3 ? { dateSystem } : {}), version }),
      ).toThrow(/version 53/);
    },
  );
  test.each(["frame", "lockAspectRatio"])(
    "old snapshot rejects presence of new %s even when default or an accessor",
    (field) => {
      const session = createTestWorkbookSession(),
        raw = serializeWorkbook(session.workbook);
      const image = { assetId: "asset", altText: "", [field]: undefined };
      raw.sheets[0]!.cells = [
        { address: { row: 0, column: 0 }, content: { kind: "image", image } },
      ];
      expect(() => deserializeWorkbook({ ...raw, version: 52 })).toThrow(/version 53/);
      let reads = 0;
      Object.defineProperty(image, field, {
        get: () => {
          reads++;
          return undefined;
        },
      });
      expect(() => deserializeWorkbook({ ...raw, version: 52 })).toThrow(/version 53/);
      expect(() => deserializeWorkbook({ ...raw, version: 53 })).toThrow(
        /accessor|own local frame/,
      );
      expect(reads).toBe(0);
    },
  );
  test("independent sheet inference ends at 53 despite older rich content and floating masks", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "ab", fontRuns: [{ start: 0, end: 1, fontFamily: "Noto Sans" }] },
    );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "image", image: framedCellImage() });
    sheet.floatingImages = [
      {
        id: "float",
        assetId: "asset",
        altText: "",
        frame: {
          kind: "object-frame-v1",
          anchor: { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 100 } },
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
          cropShape: { preset: "ellipse" },
        },
      },
    ];
    expect(serializeWorkbook(session.workbook).version).toBe(53);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    setCellContent(sheet, { row: 1, column: 1 }, null);
    expect(serializeWorkbook(session.workbook).version).toBe(52);
  });
  test("legacy protocols remain readable without a frame and cannot save a floating aspect lock as cell data", () => {
    const session = createTestWorkbookSession(),
      raw = serializeWorkbook(session.workbook);
    raw.sheets[0]!.cells = [
      {
        address: { row: 0, column: 0 },
        content: {
          kind: "image",
          image: { assetId: "asset", altText: "", transform: { rotation: 90 } },
        },
      },
    ];
    for (const version of [5, 24, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53]) {
      const restored = deserializeWorkbook({ ...raw, version });
      expect(getCellContent(getActiveSheet(restored), { row: 0, column: 0 })).toEqual(
        raw.sheets[0]!.cells[0]!.content,
      );
      expect(serializeWorkbook(restored).version).toBe(43);
    }
    const image = { assetId: "asset", altText: "", lockAspectRatio: true };
    raw.sheets[0]!.cells[0]!.content = { kind: "image", image: image as unknown as CellImage };
    expect(() => deserializeWorkbook({ ...raw, version: 53 })).toThrow(/own local frame/);
  });
});
