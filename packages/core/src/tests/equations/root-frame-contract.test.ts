import { describe, expect, expectTypeOf, test } from "vitest";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { isSheetGroupedGraphicDrawing, normalizeShapeGroup } from "../../shape-group.js";
import { groupShapeRoots, isShapeGroupEligibleRoot } from "../../shape-group-planning.js";
import {
  hasShapeObjectFrame,
  isFramedEquationDrawing,
  isFramedShapeDrawing,
  isSheetDrawingVisible,
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  requireLegacySheetDrawing,
  type SheetDrawing,
  type SheetFramedEquationDrawing,
  type SheetFramedGraphicDrawing,
} from "../../sheet-drawings.js";
import { getShapeObjectProperties } from "../../shape-object-properties.js";
import { createSheet } from "../../workbook.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { equationDocument, equationDrawing } from "./fixtures.js";
import { framedEquationDrawing, opaqueEquationSource } from "./root-frame-fixtures.js";

describe("canonical Equation root placement contract", () => {
  test("Equation placement is separate from shape bodies and legacy physical fields", () => {
    expectTypeOf<SheetFramedEquationDrawing>().toExtend<SheetDrawing>();
    expectTypeOf<SheetFramedEquationDrawing>().not.toExtend<SheetFramedGraphicDrawing>();
    const input = framedEquationDrawing();
    expect(isFramedEquationDrawing(input)).toBe(true);
    expect(isFramedShapeDrawing(input)).toBe(false);
    expect(hasShapeObjectFrame(input)).toBe(true);
    expect(isShapeGroupEligibleRoot(input)).toBe(true);
    expect(isFramedEquationDrawing(equationDrawing())).toBe(false);
    expect(isFramedEquationDrawing(framedShapeDrawing())).toBe(false);
    expect(() => requireLegacySheetDrawing(input)).toThrow(/canonical shape frames/);
    const result = normalizeSheetDrawing(input);
    expect(result).toEqual(input);
    for (const key of ["anchor", "offsetX", "offsetY", "width", "height"])
      expect(key in result).toBe(false);
  });

  test("strict semantic source/mirror, frame and sparse properties are detached without changing source", () => {
    const input = framedEquationDrawing();
    input.hidden = true;
    input.shapeProperties = {
      locked: false,
      printObject: false,
      lockAspectRatio: true,
      altTitle: "Equation title",
      altDescription: "Equation description",
    };
    const normalized = normalizeSheetDrawing(input);
    expect(normalized).toEqual(input);
    expect(normalized.equationDocument).not.toBe(input.equationDocument);
    expect(normalized.shapeFrame).not.toBe(input.shapeFrame);
    expect(normalized.shapeProperties).not.toBe(input.shapeProperties);
    normalized.equationDocument!.body.children = [];
    if (normalized.shapeFrame.anchor.mode === "move-only")
      normalized.shapeFrame.anchor.origin.row.index = 90;
    normalized.shapeProperties!.altTitle = "Other";
    expect(input.equationDocument).toEqual(equationDocument());
    expect(input.shapeProperties.altTitle).toBe("Equation title");
    expect(isSheetDrawingVisible(input)).toBe(false);
    expect(isSheetDrawingVisible(framedEquationDrawing())).toBe(true);
    expect(getShapeObjectProperties()).toMatchObject({ locked: true, printObject: true });
    const opaque = framedEquationDrawing(undefined, true);
    expect(normalizeSheetDrawing(opaque).text).toBe(opaqueEquationSource);
    expect("equationDocument" in normalizeSheetDrawing(opaque)).toBe(false);
    expect(
      normalizeSheetDrawing({ ...input, hidden: false } as unknown as SheetDrawing),
    ).not.toHaveProperty("hidden");
    const legacy = equationDrawing();
    expect(() => normalizeSheetDrawing({ ...legacy, hidden: true } as SheetDrawing)).toThrow();
    expect(() => isSheetDrawingVisible({ ...legacy, hidden: true } as SheetDrawing)).toThrow();
  });

  test.each([
    "anchor",
    "offsetX",
    "offsetY",
    "width",
    "height",
    "frame",
    "source",
    "shapeGeometry",
    "shapePath",
    "shapeLineEnds",
    "shapeConnector",
    "shapeFlipX",
    "shapeFlipY",
    "shapeText",
    "shapeStyle",
    "wordArt",
    "textDirection",
    "textReference",
    "groupFrame",
    "group3d",
    "groupEffects",
    "members",
    "chart",
    "camera",
    "attachment",
    "control",
  ])("rejects foreign or deferred field %s, including empty markers", (key) => {
    for (const value of [undefined, {}])
      expect(() =>
        normalizeSheetDrawing({ ...framedEquationDrawing(), [key]: value } as SheetDrawing),
      ).toThrow(/conflicting/);
  });

  test("mandatory source fields, symbols, undefined choices, mirror mismatch and malformed trees fail", () => {
    for (const key of [
      "id",
      "name",
      "text",
      "shape",
      "fill",
      "stroke",
      "strokeWidth",
      "color",
      "fontSize",
      "bold",
      "italic",
      "rotation",
      "shapeFrame",
    ]) {
      const missing = { ...framedEquationDrawing() } as Record<string, unknown>;
      delete missing[key];
      expect(() => normalizeSheetDrawing(missing as SheetDrawing)).toThrow();
    }
    for (const input of [
      { ...framedEquationDrawing(), text: "stale" },
      { ...framedEquationDrawing(), equationDocument: undefined },
      {
        ...framedEquationDrawing(),
        equationDocument: { kind: "equation-document-v1", body: null },
      },
      { ...framedEquationDrawing(), hidden: undefined },
      { ...framedEquationDrawing(), shapeProperties: undefined },
      { ...framedEquationDrawing(), shapeFrame: undefined },
      { ...framedEquationDrawing(), [Symbol("unknown")]: true },
      { ...framedEquationDrawing(), shapeProperties: { locked: 0 } },
      { ...framedEquationDrawing(), shapeFrame: { kind: "shape-frame-v1", anchor: null } },
    ])
      expect(() => normalizeSheetDrawing(input as SheetDrawing)).toThrow();
    expect(() =>
      normalizeSheetDrawings([framedEquationDrawing(), framedEquationDrawing()]),
    ).toThrow(/Duplicate/);
  });

  test("root and nested accessors/inherited fields are never evaluated by guards or normalization", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const key of [
      "kind",
      "text",
      "shapeFrame",
      "equationDocument",
      "shapeProperties",
      "hidden",
    ])
      expect(() =>
        normalizeSheetDrawing(Object.defineProperty(framedEquationDrawing(), key, getter)),
      ).toThrow();
    const accessorKind = Object.defineProperty(framedEquationDrawing(), "kind", getter);
    expect(isFramedEquationDrawing(accessorKind)).toBe(false);
    expect(isFramedShapeDrawing(accessorKind)).toBe(false);
    expect(hasShapeObjectFrame(accessorKind)).toBe(false);
    for (const key of ["shapeFrame", "equationDocument", "shapeProperties", "text"] as const) {
      const input = framedEquationDrawing();
      const fields = { ...input } as Record<string, unknown>;
      delete fields[key];
      expect(() =>
        normalizeSheetDrawing(Object.assign(Object.create({ [key]: input[key] }), fields)),
      ).toThrow();
    }
    for (const input of [
      { ...framedEquationDrawing(), shapeFrame: Object.defineProperty({}, "kind", getter) },
      { ...framedEquationDrawing(), shapeProperties: Object.defineProperty({}, "locked", getter) },
      { ...framedEquationDrawing(), equationDocument: Object.defineProperty({}, "body", getter) },
    ])
      expect(() => normalizeSheetDrawing(input as SheetDrawing)).toThrow();
    expect(reads).toBe(0);
  });

  test("generic command clone keeps Equation data and grouping uses a dedicated math child", () => {
    const input = framedEquationDrawing(),
      expected = structuredClone(input);
    const command = createSetSheetDrawingsCommand("sheet", [input]);
    input.equationDocument!.body.children = [];
    expect(command.drawings).toEqual([expected]);
    const shape = { ...framedShapeDrawing(), id: "shape" };
    const grouped = groupShapeRoots(
      [expected, shape],
      [expected.id, shape.id],
      { id: "group", name: "Group" },
      createPictureSheetMetrics(createSheet("Sheet", "sheet")),
    );
    expect(grouped[0]).toMatchObject({
      kind: "shapeGroup",
      members: [{ kind: "equation" }, { kind: "shape" }],
    });
    const { shapeFrame: _frame, ...appearance } = expected;
    const child = {
      ...appearance,
      groupFrame: {
        kind: "shape-group-local-v1",
        rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      },
    };
    expect(isSheetGroupedGraphicDrawing(child)).toBe(false);
    expect(
      normalizeShapeGroup({
        id: "group",
        kind: "shapeGroup",
        name: "Group",
        shapeFrame: expected.shapeFrame,
        rotation: 0,
        members: [child],
      } as unknown as Parameters<typeof normalizeShapeGroup>[0]).members[0],
    ).toEqual(child);
  });
});
