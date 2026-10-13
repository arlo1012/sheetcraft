import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV71,
} from "../../serialization.js";
import { getActiveSheet } from "../../workbook.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { createTestWorkbookSession } from "../helpers.js";
import { shapeText } from "../drawings/shape-text-fixture.js";
import { legacyShapeDrawing } from "../drawings/shape-style-fixture.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";
import {
  framedWarpedDrawing,
  textWarpLeaf,
  warpedDrawing,
  warpedText,
  warpedTree,
} from "./model-fixtures.js";

describe("conditional V71 standard text-warp internal snapshots", () => {
  test("root and deeply owned shape/text-box models roundtrip in V71 with detached overrides", () => {
    expectTypeOf<WorkbookSnapshotV71>().toExtend<WorkbookSnapshot>();
    for (const drawing of [
      warpedDrawing(),
      warpedDrawing("textBox"),
      framedWarpedDrawing(),
      warpedTree(),
      warpedTree("textBox"),
    ]) {
      const session = createTestWorkbookSession(),
        sheet = getActiveSheet(session.workbook);
      sheet.drawings = [drawing];
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(71);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      const saved = snapshot.sheets[0]!.drawings![0]!;
      const copied =
        saved.kind === "shapeGroup" ? textWarpLeaf(saved) : (saved as SheetGraphicDrawing);
      const source = drawing.kind === "shapeGroup" ? textWarpLeaf(drawing) : drawing;
      expect(copied.shapeText!.warp).not.toBe(source.shapeText!.warp);
      expect(copied.shapeText!.warp!.adjustments).not.toBe(source.shapeText!.warp!.adjustments);
      (copied.shapeText!.warp!.adjustments as Record<string, number>).adj1 = 999;
      expect(source.shapeText!.warp!.adjustments!.adj1).toBe(17000);
    }
  });

  test("old versions reject raw own/null/undefined/accessor/inherited warp presence before reads", () => {
    const base = serializeWorkbook(createTestWorkbookSession().workbook);
    let reads = 0;
    const accessor = Object.defineProperty(shapeText(), "warp", {
      get() {
        reads++;
        return { preset: "textPlain" };
      },
    });
    const inherited = Object.assign(
      Object.create({
        get warp() {
          reads++;
          return undefined;
        },
      }),
      shapeText(),
    );
    for (const model of [
      { ...shapeText(), warp: { preset: "textPlain" } },
      { ...shapeText(), warp: undefined },
      { ...shapeText(), warp: null },
      { ...shapeText(), warp: {} },
      accessor,
      inherited,
    ])
      for (const owned of [false, true]) {
        const drawing = owned
          ? { ...group(), members: [{ ...nested(), members: [{ ...leaf(), shapeText: model }] }] }
          : { ...legacyShapeDrawing(), shapeText: model };
        for (let version = owned ? 61 : 59; version <= 70; version++)
          expect(() =>
            deserializeWorkbook({
              ...base,
              version,
              sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
            }),
          ).toThrow(/version 71/);
      }
    expect(reads).toBe(0);
  });

  test("V71 still rejects malformed warp payloads and never executes model or nested getters", () => {
    const base = serializeWorkbook(createTestWorkbookSession().workbook);
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return "textPlain";
      },
      enumerable: true,
    };
    const invalidModels = [
      { ...shapeText(), warp: undefined },
      { ...shapeText(), warp: null },
      { ...shapeText(), warp: { preset: "textNoShape" } },
      { ...shapeText(), warp: { preset: "textPlain", adjustments: { adj: Infinity } } },
      Object.defineProperty(shapeText(), "warp", getter),
      { ...shapeText(), warp: Object.defineProperty({}, "preset", getter) },
      Object.assign(Object.create({ warp: { preset: "textPlain" } }), shapeText()),
    ];
    for (const model of invalidModels)
      for (const owned of [false, true]) {
        const drawing = owned
          ? { ...group(), members: [{ ...nested(), members: [{ ...leaf(), shapeText: model }] }] }
          : { ...legacyShapeDrawing(), shapeText: model };
        expect(() =>
          deserializeWorkbook({
            ...base,
            version: 71,
            sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
          }),
        ).toThrow();
        expect(() => deserializeSheet({ ...base.sheets[0]!, drawings: [drawing] })).toThrow();
      }
    expect(reads).toBe(0);
  });

  test("textPlain alone retains V71 and None removes only warp without upgrading old no-warp models", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    for (const drawing of [warpedDrawing(), warpedTree()]) {
      const target = drawing.kind === "shapeGroup" ? textWarpLeaf(drawing) : drawing;
      target.shapeText!.warp = { preset: "textPlain" };
      sheet.drawings = [drawing];
      expect(serializeWorkbook(session.workbook).version).toBe(71);
      const { warp: _warp, ...none } = target.shapeText!;
      target.shapeText = none;
      const expected = structuredClone(drawing),
        snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(66);
      expect(snapshot.sheets[0]!.drawings).toEqual([expected]);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    }
    const noWarp = { ...legacyShapeDrawing(), shapeText: shapeText() };
    sheet.drawings = [noWarp];
    const old = serializeWorkbook(session.workbook);
    expect(old.version).toBe(59);
    expect(serializeWorkbook(deserializeWorkbook(old))).toEqual(old);
    const { shapeText: _model, ...legacy } = noWarp;
    sheet.drawings = [{ ...legacy, kind: "wordArt" }];
    const oldWordArt = serializeWorkbook(session.workbook);
    expect(oldWordArt.version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(oldWordArt))).toEqual(oldWordArt);
  });

  test("modern V70 WordArt and run paint coexist with independent V71 warp and stay V70 without it", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    const drawing = {
      ...warpedDrawing(),
      wordArt: true as const,
      shapeText: {
        ...warpedText(),
        characterRuns: [
          { start: 0, end: 5, fill: { kind: "none" as const }, line: { kind: "none" as const } },
        ],
      },
    };
    sheet.drawings = [drawing];
    const combined = serializeWorkbook(session.workbook);
    expect(combined.version).toBe(71);
    expect(serializeWorkbook(deserializeWorkbook(combined))).toEqual(combined);
    const { warp: _warp, ...none } = drawing.shapeText;
    drawing.shapeText = none;
    const modern = serializeWorkbook(session.workbook);
    expect(modern.version).toBe(70);
    expect(serializeWorkbook(deserializeWorkbook(modern))).toEqual(modern);
    expect(modern.sheets[0]!.drawings![0]).toMatchObject({ wordArt: true, shapeText: none });
    const { wordArt: _tag, ...runOnly } = drawing;
    sheet.drawings = [runOnly];
    expect(serializeWorkbook(session.workbook).version).toBe(70);
  });
});
