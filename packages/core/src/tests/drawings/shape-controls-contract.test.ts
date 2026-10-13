import { describe, expect, test } from "vitest";
import {
  isSheetDrawingVisible,
  normalizeSheetDrawing,
  type DrawingShape,
  type SheetDrawing,
} from "../../sheet-drawings.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
import { framedShapeDrawing } from "./shape-frame-fixture.js";

const legacyShapes: DrawingShape[] = [
  "rectangle",
  "roundedRectangle",
  "ellipse",
  "triangle",
  "diamond",
  "arrow",
  "line",
  "star",
  "heart",
];

describe("legacy shape and text-box controls contract", () => {
  test("both flips and sparse hidden apply to all nine legacy shapes and text boxes without inventing geometry", () => {
    for (const kind of ["shape", "textBox"] as const)
      for (const shape of legacyShapes)
        for (const framed of [false, true]) {
          const input = {
            ...(framed ? framedShapeDrawing() : legacyShapeDrawing()),
            kind,
            shape,
            shapeFlipX: true as const,
            shapeFlipY: true as const,
            hidden: true as const,
          };
          const normalized = normalizeSheetDrawing(input);
          expect(normalized).toEqual(input);
          expect(normalized).not.toHaveProperty("shapeGeometry");
          expect(normalized).not.toHaveProperty("shapePath");
          expect(isSheetDrawingVisible(normalized)).toBe(false);
        }
  });

  test("explicit false data canonicalizes away, including nonenumerable own data", () => {
    for (const kind of ["shape", "textBox"] as const) {
      const input = { ...legacyShapeDrawing(), kind };
      for (const key of ["hidden", "shapeFlipX", "shapeFlipY"])
        Object.defineProperty(input, key, { value: false });
      expect(normalizeSheetDrawing(input)).toEqual({ ...legacyShapeDrawing(), kind });
      expect(isSheetDrawingVisible(input)).toBe(true);
    }
    const input = legacyShapeDrawing();
    Object.defineProperty(input, "hidden", { value: true });
    expect(normalizeSheetDrawing(input)).toHaveProperty("hidden", true);
  });

  test("unrelated graphic kinds reject presence, including false", () => {
    for (const kind of ["wordArt", "icon", "equation"] as const)
      for (const key of ["hidden", "shapeFlipX", "shapeFlipY"])
        for (const value of [true, false])
          expect(() =>
            normalizeSheetDrawing({ ...legacyShapeDrawing(), kind, [key]: value } as SheetDrawing),
          ).toThrow();
  });

  test("new fields are strict booleans and reject unknown records and symbols", () => {
    for (const key of ["hidden", "shapeFlipX", "shapeFlipY"])
      for (const value of [undefined, null, 0, 1, "true", {}, []])
        expect(() =>
          normalizeSheetDrawing({ ...legacyShapeDrawing(), [key]: value } as SheetDrawing),
        ).toThrow(/boolean/);
    for (const extra of [{ visible: true }, { unknown: 1 }, { [Symbol("unknown")]: true }])
      expect(() =>
        normalizeSheetDrawing({ ...legacyShapeDrawing(), hidden: true, ...extra }),
      ).toThrow(/Unknown/);
  });

  test("own, inherited and unrelated accessors never execute during new-control admission", () => {
    let reads = 0;
    const get = () => {
      reads++;
      throw Error("Accessor executed");
    };
    for (const key of ["hidden", "shapeFlipX", "shapeFlipY", "kind", "name", "anchor"])
      for (const placement of ["legacy", "framed"] as const) {
        const input = {
          ...(placement === "legacy" ? legacyShapeDrawing() : framedShapeDrawing()),
          hidden: true as const,
        };
        Object.defineProperty(input, key, { enumerable: true, get });
        expect(() => normalizeSheetDrawing(input)).toThrow(/data|accessor|frame|Unknown/);
      }
    for (const key of ["hidden", "shapeFlipX", "shapeFlipY"]) {
      const inherited = Object.assign(
        Object.create({
          get [key]() {
            return get();
          },
        }),
        legacyShapeDrawing(),
      );
      expect(() => normalizeSheetDrawing(inherited)).toThrow(/own data/);
    }
    expect(reads).toBe(0);
  });
});
