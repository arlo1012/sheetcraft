import { describe, expect, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { createTestWorkbook } from "../helpers.js";
import { getActiveSheet, getDefaultRowHeight, setRowHeight } from "../../workbook.js";
import type { PictureFrame } from "../../picture-frame.js";

function book(height?: number) {
  const workbook = createTestWorkbook();
  const sheet = getActiveSheet(workbook);
  if (height !== undefined) sheet.defaultRowHeight = height;
  return { workbook, sheet };
}
function freeFrame(): PictureFrame {
  return {
    kind: "object-frame-v1",
    anchor: {
      mode: "move-only",
      offsetMode: "free-pixels",
      origin: { column: { index: 0, offset: 130 }, row: { index: 0, offset: 45 } },
      size: { width: 30, height: 40 },
    },
    source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    angleDeg: 0,
  };
}

describe("conditional V87 default row heights", () => {
  test("omits absent and explicit24, preserving the legacy envelope", () => {
    const { workbook, sheet } = book();
    const before = serializeWorkbook(workbook);
    sheet.defaultRowHeight = 24;
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(serializeSheet(sheet)).not.toHaveProperty("defaultRowHeight");
  });

  test("writes87 only when needed and roundtrips standalone sheets including explicit24 overrides", () => {
    const { workbook, sheet } = book(20);
    setRowHeight(sheet, 5, 24);
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(87);
    expect(snapshot.sheets[0]).toMatchObject({
      defaultRowHeight: 20,
      rowHeights: [{ index: 5, size: 24 }],
    });
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
  });

  test.each([1, 3, 43, 47, 48, 85, 86])(
    "rejects the new own field on explicitV%s even when redundant or undefined",
    (version) => {
      for (const value of [20, 24, undefined, null]) {
        const snapshot = {
          version,
          id: "legacy",
          activeSheetId: "rows",
          ...(version >= 3 ? { dateSystem: "1900" } : {}),
          ...(version >= 8 ? { definedNames: [] } : {}),
          ...(version >= 9
            ? {
                calculation: {
                  mode: "automatic",
                  iterative: false,
                  maxIterations: 100,
                  maxChange: 0.001,
                },
              }
            : {}),
          sheets: [
            {
              id: "rows",
              name: "Rows",
              cells: [],
              rowHeights: [],
              columnWidths: [],
              ...(version >= 4 ? { floatingImages: [] } : {}),
              ...(version >= 7
                ? { properties: { pinned: false, hidden: false, protected: false } }
                : {}),
              defaultRowHeight: value,
            },
          ],
        };
        expect(() => deserializeWorkbook(snapshot)).toThrow(/version 87/);
      }
    },
  );

  test.each([0, 15, 513, 20.5, NaN, Infinity, undefined, null, "20"])(
    "rejects malformed V87 default %s",
    (height) => {
      const { workbook } = book();
      const snapshot = structuredClone(serializeWorkbook(workbook)) as unknown as {
        version: number;
        sheets: Array<Record<string, unknown>>;
      };
      snapshot.version = 87;
      snapshot.sheets[0]!.defaultRowHeight = height;
      expect(() => deserializeWorkbook(snapshot)).toThrow();
    },
  );

  test("rejects accessor defaults without invoking them and inherited defaults", () => {
    const { sheet } = book();
    const standalone = serializeSheet(sheet);
    let called = false;
    Object.defineProperty(standalone, "defaultRowHeight", {
      enumerable: true,
      get() {
        called = true;
        return 20;
      },
    });
    expect(() => deserializeSheet(standalone)).toThrow(/data fields/);
    expect(called).toBe(false);
    const inherited = Object.assign(Object.create({ defaultRowHeight: 20 }), serializeSheet(sheet));
    expect(() => deserializeSheet(inherited)).toThrow(/own data fields/);
  });

  test("preserves own non-enumerable defaults and validates every supplied value", () => {
    const { workbook, sheet } = book();
    const standalone = serializeSheet(sheet);
    Object.defineProperty(standalone, "defaultRowHeight", { value: 20, enumerable: false });
    expect(getDefaultRowHeight(deserializeSheet(standalone))).toBe(20);
    const snapshot = { ...serializeWorkbook(workbook), version: 87 };
    Object.defineProperty(snapshot.sheets[0]!, "defaultRowHeight", {
      value: 20,
      enumerable: false,
    });
    expect(getDefaultRowHeight(getActiveSheet(deserializeWorkbook(snapshot)))).toBe(20);
    for (const value of [undefined, null, 0, 20.5]) {
      const malformed = serializeSheet(sheet);
      Object.defineProperty(malformed, "defaultRowHeight", { value, enumerable: false });
      expect(() => deserializeSheet(malformed)).toThrow();
    }
  });

  test("allows an absent field at87 with the original baseline", () => {
    const { workbook } = book();
    const snapshot = { ...serializeWorkbook(workbook), version: 87 };
    expect(getDefaultRowHeight(getActiveSheet(deserializeWorkbook(snapshot)))).toBe(24);
  });

  test("preserves free-only86 and selects87 for mixed semantics without altering anchors", () => {
    const { workbook, sheet } = book();
    sheet.floatingImages = [{ id: "free", assetId: "asset", altText: "free", frame: freeFrame() }];
    expect(serializeWorkbook(workbook).version).toBe(86);
    sheet.defaultRowHeight = 20;
    const mixed = serializeWorkbook(workbook);
    expect(mixed.version).toBe(87);
    expect(serializeWorkbook(deserializeWorkbook(mixed))).toEqual(mixed);
  });
});
