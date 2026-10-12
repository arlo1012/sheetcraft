import { describe, expect, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import type { ShapeDetailedStyle } from "../../shape-style.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "../cell-picture-frame/fixture.js";
import { fullStyle, gradient } from "../images/detailed-style-fixture.js";
import { freePathDrawing } from "./free-path-fixture.js";
import {
  legacyShapeDrawing,
  styledShapeDrawing,
  textureShapeStyle,
} from "./shape-style-fixture.js";

const geometries = ["legacy", "standard", "open-path", "closed-path"] as const;
function drawingForGeometry(geometry: (typeof geometries)[number]): SheetGraphicDrawing {
  if (geometry === "standard")
    return {
      ...legacyShapeDrawing(),
      shapeGeometry: { preset: "roundRect", adjustments: { adj: 30000 } },
      shapeFlipX: true,
    };
  if (geometry === "open-path")
    return { ...freePathDrawing(), shapeFlipY: true, shapeLineEnds: { end: { kind: "triangle" } } };
  if (geometry === "closed-path") {
    const open = freePathDrawing();
    return {
      ...open,
      shapePath: { ...open.shapePath!, commands: [...open.shapePath!.commands, ["Z"]] },
    };
  }
  return legacyShapeDrawing();
}

describe("V58 typed shape style internal persistence", () => {
  test.each(geometries)(
    "round trips rich effects, auxiliary picture paints and None on %s geometry",
    (geometry) => {
      for (const shapeStyle of [
        fullStyle(),
        textureShapeStyle(),
        { fill: { kind: "none" as const }, shadow: { kind: "none" as const } },
      ]) {
        const session = createTestWorkbookSession(),
          sheet = getActiveSheet(session.workbook);
        sheet.drawings = [{ ...drawingForGeometry(geometry), shapeStyle }];
        const snapshot = serializeWorkbook(session.workbook),
          sheetSnapshot = serializeSheet(sheet);
        expect(snapshot.version).toBe(58);
        expect(snapshot.sheets[0]!.drawings![0]).toMatchObject({ shapeStyle });
        const restored = deserializeWorkbook(snapshot);
        expect(serializeWorkbook(restored)).toEqual(snapshot);
        expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
        (snapshot.sheets[0]!.drawings![0] as SheetGraphicDrawing).shapeStyle!.fill = {
          kind: "none",
        };
        expect((getActiveSheet(restored).drawings![0] as SheetGraphicDrawing).shapeStyle).toEqual(
          shapeStyle,
        );
        expect((sheet.drawings[0] as SheetGraphicDrawing).shapeStyle).toEqual(shapeStyle);
      }
    },
  );

  test("all 1..57 envelopes reject style presence before parsing or removing sparse fields", () => {
    const raw = serializeWorkbook(createTestWorkbookSession().workbook),
      { dateSystem, ...withoutDateSystem } = raw;
    let reads = 0;
    const accessor = legacyShapeDrawing();
    Object.defineProperty(accessor, "shapeStyle", {
      get() {
        reads++;
        return fullStyle();
      },
    });
    const inherited = Object.assign(
      Object.create({
        get shapeStyle() {
          reads++;
          return fullStyle();
        },
      }),
      legacyShapeDrawing(),
    );
    for (let version = 1; version <= 57; version++)
      for (const drawing of [
        styledShapeDrawing(),
        styledShapeDrawing({}),
        { ...legacyShapeDrawing(), shapeStyle: undefined },
        accessor,
        inherited,
      ])
        expect(() =>
          deserializeWorkbook({
            ...withoutDateSystem,
            ...(version >= 3 ? { dateSystem } : {}),
            version,
            sheets: [{ ...raw.sheets[0], drawings: [drawing] }],
          }),
        ).toThrow(/version 58/);
    expect(reads).toBe(0);
  });

  test("nonempty styles alone promote writers to 58 and sparse styles retain established versions", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const cases: [SheetGraphicDrawing, number][] = [
      [legacyShapeDrawing(), 43],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "rect" } }, 54],
      [
        {
          ...legacyShapeDrawing(),
          shapeGeometry: { preset: "line" },
          shapeLineEnds: { end: { kind: "triangle" } },
        },
        55,
      ],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "ellipse" }, shapeFlipX: true }, 56],
      [freePathDrawing(), 57],
    ];
    for (const [drawing, version] of cases) {
      for (const shapeStyle of [{}, undefined]) {
        sheet.drawings = [{ ...drawing, shapeStyle }];
        const snapshot = serializeWorkbook(session.workbook),
          sheetSnapshot = serializeSheet(sheet);
        expect(snapshot.version).toBe(version);
        expect(snapshot.sheets[0]!.drawings![0]).not.toHaveProperty("shapeStyle");
        expect(sheetSnapshot.drawings![0]).not.toHaveProperty("shapeStyle");
        expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
        expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
      }
      sheet.drawings = [{ ...drawing, shapeStyle: { glow: { kind: "none" } } }];
      expect(serializeWorkbook(session.workbook).version).toBe(58);
    }
  });

  test("style-free versions 43..57 and a style-free V58 container preserve legacy writers", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [legacyShapeDrawing()];
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(43);
    for (let version = 43; version <= 58; version++)
      expect(serializeWorkbook(deserializeWorkbook({ ...snapshot, version }))).toEqual(snapshot);
    for (const [drawing, version] of [
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "rect" } }, 54],
      [
        {
          ...legacyShapeDrawing(),
          shapeGeometry: { preset: "line" },
          shapeLineEnds: { end: { kind: "triangle" } },
        },
        55,
      ],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "ellipse" }, shapeFlipY: true }, 56],
      [freePathDrawing(), 57],
    ] as [SheetGraphicDrawing, number][]) {
      sheet.drawings = [drawing];
      const established = serializeWorkbook(session.workbook);
      expect(established.version).toBe(version);
      expect(serializeWorkbook(deserializeWorkbook({ ...established, version: 58 }))).toEqual(
        established,
      );
    }
  });

  test("mixed paths and styles infer 58 last for a standalone sheet in either drawing order", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "aΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Serif" }] },
    );
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "image", image: framedCellImage() });
    const drawings: SheetGraphicDrawing[] = [
      { ...freePathDrawing(), id: "unstyled-path" },
      { ...styledShapeDrawing(), id: "styled-legacy" },
      { ...drawingForGeometry("standard"), id: "styled-preset", shapeStyle: textureShapeStyle() },
      {
        ...drawingForGeometry("open-path"),
        id: "styled-path",
        shapeStyle: { line: { kind: "none" } },
      },
      { ...legacyShapeDrawing(), id: "vertical", kind: "textBox", textDirection: "vertical" },
    ];
    for (const ordered of [drawings, [...drawings].reverse()]) {
      sheet.drawings = ordered;
      const snapshot = serializeWorkbook(session.workbook),
        sheetSnapshot = serializeSheet(sheet);
      expect(snapshot.version).toBe(58);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
    }
    sheet.drawings = drawings.filter((drawing) => !drawing.shapeStyle);
    expect(serializeWorkbook(session.workbook).version).toBe(57);
    expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(serializeSheet(sheet));
    sheet.drawings = [];
    expect(serializeWorkbook(session.workbook).version).toBe(53);
  });

  test("malformed nested style data and accessors fail at workbook and standalone sheet boundaries without reads", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [styledShapeDrawing()];
    const raw = serializeWorkbook(session.workbook),
      sheetRaw = serializeSheet(sheet),
      sparseStops = gradient().stops;
    delete (sparseStops as unknown[])[1];
    for (const shapeStyle of [
      null,
      [],
      { unexpected: true },
      { fill: { kind: "value", value: { ...gradient(), stops: sparseStops } } },
      { glow: { kind: "value", value: { sizePt: NaN } } },
      { line: { kind: "none", inheritedOutline: "inherit" } },
    ]) {
      const drawings = [
        { ...legacyShapeDrawing(), shapeStyle: shapeStyle as unknown as ShapeDetailedStyle },
      ];
      expect(() =>
        deserializeWorkbook({ ...raw, sheets: [{ ...raw.sheets[0], drawings }] }),
      ).toThrow();
      expect(() => deserializeSheet({ ...sheetRaw, drawings })).toThrow();
    }
    let reads = 0;
    const getter = {
        get() {
          reads++;
          return fullStyle();
        },
      },
      outer = legacyShapeDrawing(),
      nested = styledShapeDrawing(),
      inherited = Object.assign(
        Object.create({
          get shapeStyle() {
            reads++;
            return fullStyle();
          },
        }),
        legacyShapeDrawing(),
      );
    Object.defineProperty(outer, "shapeStyle", getter);
    Object.defineProperty(nested.shapeStyle!, "fill", getter);
    for (const drawing of [outer, nested, inherited]) {
      expect(() =>
        deserializeWorkbook({ ...raw, sheets: [{ ...raw.sheets[0], drawings: [drawing] }] }),
      ).toThrow();
      expect(() => deserializeSheet({ ...sheetRaw, drawings: [drawing] })).toThrow();
    }
    expect(reads).toBe(0);
    expect(serializeWorkbook(session.workbook)).toEqual(raw);
  });
});
