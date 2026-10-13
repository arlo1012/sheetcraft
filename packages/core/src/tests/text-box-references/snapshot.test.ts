import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV74,
} from "../../serialization.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { linkedBox, framedBox, ownedBox, target } from "./fixtures.js";

function raw(drawing: unknown, version = 74) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "owner" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("conditional V74 TextBox reference snapshots", () => {
  test("root, canonical and hidden nested owners roundtrip complete source identity and tombstones", () => {
    expectTypeOf<WorkbookSnapshotV74>().toExtend<WorkbookSnapshot>();
    for (const drawing of [
      linkedBox(),
      framedBox(),
      ownedBox(),
      linkedBox("deleted-sheet", null),
    ]) {
      const workbook = deserializeWorkbook(raw(drawing));
      const saved = serializeWorkbook(workbook);
      expect(saved.version).toBe(74);
      expect(saved.sheets[0]!.drawings).toEqual([drawing]);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = getActiveSheet(workbook);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
      expect(target(saved.sheets[0]!.drawings![0]!).textReference).not.toBe(
        target(drawing).textReference,
      );
    }
  });
  test("ordinary literals retain their existing protocol", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "owner" });
    expect(serializeWorkbook(workbook).version).toBe(43);
    const literal = linkedBox();
    delete literal.textReference;
    literal.text = "literal";
    getActiveSheet(workbook).drawings = [literal];
    expect(serializeWorkbook(workbook).version).toBe(43);
    const { textReference: _reference, ...canonical } = framedBox();
    canonical.text = "literal";
    getActiveSheet(workbook).drawings = [canonical];
    expect(serializeWorkbook(workbook).version).toBe(73);
  });
  test("every <=73 envelope rejects field presence before malformed/accessor payloads can be read", () => {
    let hits = 0;
    const getter = {
      enumerable: true,
      get() {
        hits++;
        throw Error("read");
      },
    };
    for (let version = 1; version <= 73; version++)
      for (const drawing of [
        linkedBox(),
        ownedBox(),
        { ...linkedBox(), textReference: undefined },
        Object.defineProperty(linkedBox(), "textReference", getter),
      ]) {
        expect(() => deserializeWorkbook(raw(drawing, version))).toThrow(/version 74/);
      }
    const literal = linkedBox();
    delete literal.textReference;
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "textReference", getter)),
      literal,
    );
    expect(() => deserializeWorkbook(raw(inherited, 73))).toThrow(/version 74/);
    expect(hits).toBe(0);
  });
  test("V74 still rejects malformed references and forbidden literal/run coexistence", () => {
    for (const drawing of [
      { ...linkedBox(), textReference: undefined },
      { ...linkedBox(), text: "stale" },
      {
        ...linkedBox(),
        textReference: {
          sheetId: "source",
          cell: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        },
      },
    ])
      expect(() => deserializeWorkbook(raw(drawing))).toThrow();
  });
});
