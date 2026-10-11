import { describe, expect, test } from "vitest";
import { createTestWorkbookSession } from "../helpers.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import {
  createApplyCellStyleCommand,
  createRestoreCellStylesCommand,
} from "../../commands/formatting.js";
import { createSetCellContentCommand } from "../../commands/values.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { serializeWorkbook } from "../../serialization.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import type { CellContent, CellTextLiteralContent } from "../../formula/types.js";
const address = { row: 0, column: 0 };
const rich = (value = "AΩD", start = 1, end = 2): CellTextLiteralContent => ({
  kind: "literal",
  value,
  fontRuns: [{ start, end, fontFamily: "Symbol" }],
});
function fixture() {
  const session = createTestWorkbookSession(),
    sheet = getActiveSheet(session.workbook);
  setCellContent(sheet, address, rich());
  return {
    session,
    sheet,
    run: (command: Parameters<typeof executeWorkbookCommand>[1]) =>
      executeWorkbookCommand(session, command),
  };
}
describe("font-run command boundaries", () => {
  test.each([{ fontFamily: "Arial" }, { fontTheme: "minor" as const }, { fontFamily: null }])(
    "whole-cell font resets runs with exact undo/redo: %j",
    (patch) => {
      const f = fixture();
      if (patch.fontFamily === "Arial") setCellStyle(f.sheet, address, { fontFamily: "Arial" });
      f.run(createApplyCellStyleCommand(f.sheet.id, { start: address, end: address }, patch));
      expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
      undoWorkbookCommand(f.session);
      expect(getCellContent(f.sheet, address)).toEqual(rich());
      redoWorkbookCommand(f.session);
      expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
    },
  );
  test("run-only clear formats restores content through inverse-of-inverse", () => {
    const f = fixture();
    f.run(
      createRestoreCellStylesCommand(f.sheet.id, [
        { address, style: null, content: { kind: "literal", value: "AΩD" } },
      ]),
    );
    expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual(rich());
    redoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
  });
  test("size-only formatting preserves runs", () => {
    const f = fixture();
    f.run(
      createApplyCellStyleCommand(f.sheet.id, { start: address, end: address }, { fontSize: 20 }),
    );
    expect(getCellContent(f.sheet, address)).toEqual(rich());
  });
  test("protected unlocked text rejects added or changed fonts but permits clipping and shifting", () => {
    const f = fixture();
    setCellStyle(f.sheet, address, { unlocked: true });
    f.sheet.properties.protected = true;
    expect(() =>
      f.run(
        createSetCellContentCommand(f.sheet.id, address, {
          ...rich(),
          fontRuns: [{ start: 1, end: 2, fontFamily: "Arial" }],
        }),
      ),
    ).toThrow();
    expect(() =>
      f.run(createSetCellContentCommand(f.sheet.id, address, rich("AΩXD", 1, 4))),
    ).toThrow();
    f.run(createSetCellContentCommand(f.sheet.id, address, rich("ΩD", 0, 1)));
    expect(getCellContent(f.sheet, address)).toEqual(rich("ΩD", 0, 1));
    f.run(createSetCellContentCommand(f.sheet.id, address, rich("xΩD", 1, 2)));
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual(rich("ΩD", 0, 1));
  });
});

test("restore validates all contents before mutating any cell", () => {
  const f = fixture(),
    before = getCellContent(f.sheet, address);
  expect(() =>
    f.run({
      type: "restoreCellStyles",
      sheetId: f.sheet.id,
      changes: [
        { address, style: { fontSize: 20 }, content: { kind: "literal", value: "AΩD" } },
        {
          address: { row: 1, column: 0 },
          style: null,
          content: {
            kind: "literal",
            value: "x",
            fontRuns: [{ start: 0, end: 2, fontFamily: "Symbol" }],
          },
        },
      ],
    }),
  ).toThrow();
  expect(getCellContent(f.sheet, address)).toEqual(before);
  expect(f.sheet.cells.get("0:0")?.style).toBeUndefined();
});

test("protected plain-to-rich paste is rejected; same-font metadata cannot be smuggled", () => {
  const f = fixture();
  setCellContent(f.sheet, address, { kind: "literal", value: "plain" });
  setCellStyle(f.sheet, address, { unlocked: true });
  f.sheet.properties.protected = true;
  expect(() => f.run(createSetCellContentCommand(f.sheet.id, address, rich()))).toThrow();
  expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "plain" });
});

test("locked cells may clear character formatting when formatCells permits it", () => {
  const f = fixture();
  f.sheet.properties.protected = true;
  f.sheet.protection = { editableRanges: [], formatCells: true };
  f.run(
    createRestoreCellStylesCommand(f.sheet.id, [
      { address, style: null, content: { kind: "literal", value: "AΩD" } },
    ]),
  );
  expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
  expect(() =>
    f.run(
      createRestoreCellStylesCommand(f.sheet.id, [
        { address, style: null, content: { kind: "literal", value: "changed" } },
      ]),
    ),
  ).toThrow();
});

test("protected ordinary typing can inherit only the existing caret font", () => {
  const f = fixture();
  setCellStyle(f.sheet, address, { unlocked: true });
  f.sheet.properties.protected = true;
  f.run(createSetCellContentCommand(f.sheet.id, address, rich("AΩXD", 1, 3)));
  expect(getCellContent(f.sheet, address)).toEqual(rich("AΩXD", 1, 3));
  f.run(createSetCellContentCommand(f.sheet.id, address, rich("AΩYD", 1, 3)));
  expect(getCellContent(f.sheet, address)).toEqual(rich("AΩYD", 1, 3));
  expect(() =>
    f.run(
      createSetCellContentCommand(f.sheet.id, address, {
        kind: "literal",
        value: "AΩYZD",
        fontRuns: [{ start: 1, end: 4, fontFamily: "Arial" }],
      }),
    ),
  ).toThrow();
});

test("protected repeated-text ambiguity is conservatively rejected", () => {
  const f = fixture();
  setCellContent(f.sheet, address, rich("AA", 0, 1));
  setCellStyle(f.sheet, address, { unlocked: true });
  f.sheet.properties.protected = true;
  // Deleting the first A would discard its override, but canonical diff deletes the last A.
  expect(() =>
    f.run(createSetCellContentCommand(f.sheet.id, address, { kind: "literal", value: "A" })),
  ).toThrow();
});

describe("merged-tail font protection", () => {
  const tail = { row: 0, column: 1 };
  function mergedFixture() {
    const f = fixture();
    f.sheet.mergedCells = [{ start: address, end: tail }];
    for (const cell of [address, tail]) setCellStyle(f.sheet, cell, { unlocked: true });
    f.sheet.properties.protected = true;
    return f;
  }
  test.each([
    { kind: "literal" as const, value: "AΩD" },
    { ...rich(), fontRuns: [{ start: 1, end: 2, fontFamily: "Arial" }] },
  ])("tail edits cannot discard or replace the anchor's font %#", (content) => {
    const f = mergedFixture();
    const before = serializeWorkbook(f.session.workbook);
    expect(() => f.run(createSetCellContentCommand(f.sheet.id, tail, content))).toThrow(
      expect.objectContaining({ data: expect.objectContaining({ code: "sheet_protected" }) }),
    );
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("tail typing maps the anchor's surviving run and restores it through history", () => {
    const f = mergedFixture();
    f.run(createSetCellContentCommand(f.sheet.id, tail, rich("xAΩD", 2, 3)));
    expect(getCellContent(f.sheet, address)).toEqual(rich("xAΩD", 2, 3));
    expect(getCellContent(f.sheet, tail)).toBeNull();
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual(rich());
    redoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual(rich("xAΩD", 2, 3));
  });
  test("tail formatting uses the anchor's unlocked state and requires formatCells", () => {
    const f = mergedFixture();
    const command = createRestoreCellStylesCommand(f.sheet.id, [
      { address: tail, style: { unlocked: true }, content: { kind: "literal", value: "AΩD" } },
    ]);
    expect(() => f.run(command)).toThrow();
    f.sheet.protection = { editableRanges: [], formatCells: true };
    f.run(command);
    expect(getCellContent(f.sheet, address)).toEqual({ kind: "literal", value: "AΩD" });
    undoWorkbookCommand(f.session);
    expect(getCellContent(f.sheet, address)).toEqual(rich());
    expect(getCellStyle(f.sheet, address)?.unlocked).toBe(true);
  });
});

describe("style restore content semantics", () => {
  const contents: Array<CellContent | null> = [
    { kind: "literal", value: 17 },
    { kind: "literal", value: false },
    { kind: "formula", formula: { source: "=1+2" } },
    { kind: "error", error: { kind: "formula-error", code: "DIV0" } },
    { kind: "image", image: { assetId: "asset", altText: "Photo", transform: { rotation: 90 } } },
    null,
  ];
  test.each(contents)("locked formatting may carry unchanged content %#", (content) => {
    const f = fixture();
    setCellContent(f.sheet, address, content);
    f.sheet.properties.protected = true;
    const command = createRestoreCellStylesCommand(f.sheet.id, [
      { address, style: { fontSize: 20 }, content },
    ]);
    const before = serializeWorkbook(f.session.workbook);
    expect(() => f.run(command)).toThrow();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.sheet.protection = { editableRanges: [], formatCells: true };
    expect(f.run(command)).toBe(true);
    expect(getCellContent(f.sheet, address)).toEqual(content);
    undoWorkbookCommand(f.session);
    expect(getCellStyle(f.sheet, address)).toBeUndefined();
    redoWorkbookCommand(f.session);
    expect(getCellStyle(f.sheet, address)?.fontSize).toBe(20);
    expect(getCellContent(f.sheet, address)).toEqual(content);
  });
  test.each(contents)("non-history restore cannot change semantic kind/value %#", (content) => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const command = createRestoreCellStylesCommand(f.sheet.id, [
      { address, style: { fontSize: 20 }, content },
    ]);
    expect(() => f.run(command)).toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: "invalid_command_payload" }),
      }),
    );
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test.each([
    [
      { kind: "literal", value: 1 },
      { kind: "literal", value: 2 },
    ],
    [
      { kind: "literal", value: false },
      { kind: "literal", value: true },
    ],
    [
      { kind: "formula", formula: { source: "=1" } },
      { kind: "formula", formula: { source: "=2" } },
    ],
    [
      { kind: "error", error: { kind: "formula-error", code: "NA" } },
      { kind: "error", error: { kind: "formula-error", code: "REF" } },
    ],
    [
      { kind: "image", image: { assetId: "a", altText: "Photo" } },
      { kind: "image", image: { assetId: "b", altText: "Photo" } },
    ],
    [
      { kind: "image", image: { assetId: "a", altText: "Photo" } },
      { kind: "image", image: { assetId: "a", altText: "Changed" } },
    ],
    [
      { kind: "image", image: { assetId: "a", altText: "Photo" } },
      { kind: "image", image: { assetId: "a", altText: "Photo", transform: { rotation: 90 } } },
    ],
    [null, { kind: "literal", value: "new" }],
    [
      { kind: "literal", value: "old" },
      { kind: "literal", value: "new" },
    ],
  ] as Array<[CellContent | null, CellContent | null]>)(
    "semantic changes are rejected atomically after valid font metadata %#",
    (previous, next) => {
      const f = fixture(),
        other = { row: 1, column: 0 };
      setCellContent(f.sheet, other, previous);
      const before = serializeWorkbook(f.session.workbook);
      expect(() =>
        f.run(
          createRestoreCellStylesCommand(f.sheet.id, [
            { address, style: { fontSize: 20 }, content: { kind: "literal", value: "AΩD" } },
            { address: other, style: null, content: next },
          ]),
        ),
      ).toThrow();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );
  test("history snapshots retain exact semantic restoration", () => {
    const f = fixture();
    const command = createRestoreCellStylesCommand(f.sheet.id, [
      { address, style: null, content: { kind: "formula", formula: { source: "=2" } } },
    ]);
    const inverse = applyWorkbookCommand(f.session.workbook, command, { fromHistory: true });
    expect(getCellContent(f.sheet, address)).toEqual({
      kind: "formula",
      formula: { source: "=2" },
    });
    expect(inverse).not.toBeNull();
    applyWorkbookCommand(f.session.workbook, inverse!, { fromHistory: true });
    expect(getCellContent(f.sheet, address)).toEqual(rich());
  });
});
