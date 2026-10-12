import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV59,
} from "../../serialization.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedCellImage } from "../cell-picture-frame/fixture.js";
import { fullStyle } from "../images/detailed-style-fixture.js";
import { freePathDrawing } from "./free-path-fixture.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
import { shapeText, textDrawing } from "./shape-text-fixture.js";

describe("V59 explicit shape text internal snapshots", () => {
  test("V59 is public and both eligible kinds roundtrip explicit layout, paragraphs, fonts and glyph style", () => {
    expectTypeOf<WorkbookSnapshotV59>().toExtend<WorkbookSnapshot>();
    for (const kind of ["shape", "textBox"] as const)
      for (const geometry of [
        legacyShapeDrawing(),
        {
          ...legacyShapeDrawing(),
          shapeGeometry: { preset: "ellipse" as const },
          shapeFlipX: true as const,
        },
        freePathDrawing(),
      ]) {
        const session = createTestWorkbookSession(),
          sheet = getActiveSheet(session.workbook);
        const model = {
          ...shapeText(),
          fontFamily: "SheetcraftLocal_abcdef",
          underline: true as const,
          strike: true as const,
          style: fullStyle(),
        };
        model.layout.direction = "stacked";
        model.layout.lineOrder = "ltr";
        model.layout.autoFit = "resize-shape";
        model.paragraph.lineSpacing = { kind: "exact", pt: 20 };
        // Text boxes have their own frame contract, never shape-only geometry or appearance.
        sheet.drawings = [
          kind === "shape"
            ? { ...geometry, kind, shapeText: model, shapeStyle: fullStyle() }
            : { ...legacyShapeDrawing(), kind, shapeText: model },
        ];
        const snapshot = serializeWorkbook(session.workbook),
          sheetSnapshot = serializeSheet(sheet);
        expect(snapshot.version).toBe(59);
        const restored = deserializeWorkbook(snapshot);
        expect(serializeWorkbook(restored)).toEqual(snapshot);
        expect(serializeSheet(deserializeSheet(sheetSnapshot))).toEqual(sheetSnapshot);
        const saved = snapshot.sheets[0]!.drawings![0] as SheetGraphicDrawing;
        saved.shapeText!.layout.marginsPt.leftPt = 500;
        saved.shapeText!.paragraph.lineSpacing = { kind: "normal" };
        saved.shapeText!.style!.fill = { kind: "none" };
        expect((getActiveSheet(restored).drawings![0] as SheetGraphicDrawing).shapeText).toEqual(
          model,
        );
        expect((sheet.drawings[0] as SheetGraphicDrawing).shapeText).toEqual(model);
      }
  });

  test("all V1..58 envelopes reject presence including empty, undefined, inherited and accessor without reading getters", () => {
    const raw = serializeWorkbook(createTestWorkbookSession().workbook),
      { dateSystem, ...withoutDateSystem } = raw;
    let reads = 0;
    const accessor = legacyShapeDrawing();
    Object.defineProperty(accessor, "shapeText", {
      get() {
        reads++;
        return shapeText();
      },
    });
    const inherited = Object.assign(
      Object.create({
        get shapeText() {
          reads++;
          return shapeText();
        },
      }),
      legacyShapeDrawing(),
    );
    for (let version = 1; version <= 58; version++)
      for (const drawing of [
        textDrawing(),
        { ...legacyShapeDrawing(), shapeText: {} },
        { ...legacyShapeDrawing(), shapeText: undefined },
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
        ).toThrow(/version 59/);
    expect(reads).toBe(0);
  });

  test("V59 and standalone readers still reject malformed markers and own or inherited accessors", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const raw = serializeWorkbook(session.workbook);
    let reads = 0;
    const accessor = legacyShapeDrawing();
    Object.defineProperty(accessor, "shapeText", {
      get() {
        reads++;
        return shapeText();
      },
    });
    const inherited = Object.assign(
      Object.create({
        get shapeText() {
          reads++;
          return shapeText();
        },
      }),
      legacyShapeDrawing(),
    );
    for (const drawing of [
      { ...legacyShapeDrawing(), shapeText: {} },
      { ...textDrawing(), shapeText: { ...shapeText(), fontFamily: "A\ud800" } },
      accessor,
      inherited,
    ]) {
      expect(() =>
        deserializeWorkbook({
          ...raw,
          version: 59,
          sheets: [{ ...raw.sheets[0], drawings: [drawing] }],
        }),
      ).toThrow();
      expect(() => deserializeSheet({ ...serializeSheet(sheet), drawings: [drawing] })).toThrow();
    }
    expect(reads).toBe(0);
  });

  test("explicit defaults promote to V59 and removal or undefined restores each established minimum version", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const cases: Array<[SheetGraphicDrawing, number]> = [
      [legacyShapeDrawing(), 43],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "rect" } }, 54],
      [{ ...legacyShapeDrawing(), kind: "textBox", textDirection: "vertical" }, 55],
      [{ ...legacyShapeDrawing(), shapeGeometry: { preset: "ellipse" }, shapeFlipY: true }, 56],
      [freePathDrawing(), 57],
      [{ ...legacyShapeDrawing(), shapeStyle: fullStyle() }, 58],
    ];
    for (const [drawing, version] of cases) {
      sheet.drawings = [drawing];
      const established = serializeWorkbook(session.workbook);
      expect(established.version).toBe(version);
      expect(serializeWorkbook(deserializeWorkbook({ ...established, version: 59 }))).toEqual(
        established,
      );
      const { textDirection: _legacy, ...withoutLegacy } = drawing;
      sheet.drawings = [{ ...withoutLegacy, shapeText: shapeText() }];
      const explicit = serializeWorkbook(session.workbook);
      expect(explicit.version).toBe(59);
      expect((explicit.sheets[0]!.drawings![0] as SheetGraphicDrawing).shapeText).toEqual(
        shapeText(),
      );
      expect(serializeWorkbook(deserializeWorkbook(explicit))).toEqual(explicit);
      sheet.drawings = [drawing];
      expect(serializeWorkbook(session.workbook)).toEqual(established);
      if (!Object.hasOwn(drawing, "textDirection")) {
        sheet.drawings = [{ ...drawing, shapeText: undefined }];
        expect(serializeWorkbook(session.workbook)).toEqual(established);
      }
    }
    sheet.drawings = [legacyShapeDrawing()];
    const legacy = serializeWorkbook(session.workbook);
    for (let version = 43; version <= 59; version++)
      expect(serializeWorkbook(deserializeWorkbook({ ...legacy, version }))).toEqual(legacy);
  });

  test("mixed cell frames, fonts, shape styles and paths infer V59 last in either drawing order", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "AΩ", fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Serif" }] },
    );
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "image", image: framedCellImage() });
    const drawings = [
      { ...legacyShapeDrawing(), id: "style", shapeStyle: fullStyle() },
      { ...freePathDrawing(), id: "path" },
      { ...textDrawing(), id: "text" },
    ];
    for (const values of [drawings, [...drawings].reverse()]) {
      sheet.drawings = values;
      const snapshot = serializeWorkbook(session.workbook),
        standalone = serializeSheet(sheet);
      expect(snapshot.version).toBe(59);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    }
  });

  test("empty model-free V1..59 readers add no drawing or font defaults", () => {
    const raw = serializeWorkbook(createTestWorkbookSession().workbook);
    const { dateSystem, ...withoutDateSystem } = raw;
    for (let version = 1; version <= 59; version++) {
      const restored = deserializeWorkbook({
        ...withoutDateSystem,
        ...(version >= 3 ? { dateSystem } : {}),
        version,
      });
      expect(getActiveSheet(restored).drawings ?? []).toEqual([]);
      expect(serializeWorkbook(restored).version).toBe(43);
    }
  });
});
