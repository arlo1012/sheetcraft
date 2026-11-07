// 未执行：待跨表主数据与锚记功能完成后统一验证。
import { describe, expect, test } from "vitest";
import {
  getSparklineValues,
  translateCellSparkline,
  type CellSparkline,
} from "../../sparklines.js";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  setCellSparkline,
  getCellSparkline,
  createWorkbookEvaluator,
} from "../../workbook.js";
import {
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createGroupCellSparklinesCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";
const position = { row: 10, column: 10 };
function fixture() {
  const session = createTestWorkbookSession(),
    owner = getActiveSheet(session.workbook),
    source = createSheet("Source", "source");
  insertSheet(session.workbook, source);
  const value: CellSparkline = {
    type: "line",
    sourceSheetId: source.id,
    source: { start: { row: 2, column: 2 }, end: { row: 2, column: 4 } },
    color: "#123456",
    negativeColor: "#ff0000",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
  };
  [10, 20, 30].forEach((n, i) => {
    setCellContent(source, { row: 2, column: i + 2 }, { kind: "literal", value: n });
    setCellContent(owner, { row: 2, column: i + 2 }, { kind: "literal", value: 999 });
  });
  setCellSparkline(owner, position, value);
  const current = () => getCellSparkline(owner, position)!;
  const read = (sparkline = current()) =>
    getSparklineValues(owner, sparkline, createWorkbookEvaluator(session.workbook, owner.id));
  return { session, owner, source, value, current, read };
}
describe("sparkline main-data sheet and anchors", () => {
  test("reads external values and uses source visibility rather than destination visibility", () => {
    const f = fixture();
    f.owner.hiddenColumns = new Set([2]);
    f.source.hiddenColumns = new Set([3]);
    expect(f.read()).toEqual([10, 30]);
    expect(f.read({ ...f.current(), showHidden: true })).toEqual([10, 20, 30]);
    f.source.hiddenRows = new Set([2]);
    expect(f.read()).toEqual([]);
  });
  test.each([
    { name: "relative", flags: {}, row: 5, start: 6, end: 8 },
    { name: "$column", flags: { columnAbsolute: true }, row: 5, start: 2, end: 4 },
    { name: "$row", flags: { rowAbsolute: true }, row: 2, start: 6, end: 8 },
    {
      name: "absolute",
      flags: { rowAbsolute: true, columnAbsolute: true },
      row: 2,
      start: 2,
      end: 4,
    },
  ])(
    "copy translates $name main-data anchors and keeps source sheet",
    ({ flags, row, start, end }) => {
      const f = fixture();
      const original = {
        ...f.value,
        source: { start: { row: 2, column: 2, ...flags }, end: { row: 2, column: 4, ...flags } },
      };
      const before = structuredClone(original);
      const copy = translateCellSparkline(original, { row: 3, column: 4 })!;
      expect(copy.sourceSheetId).toBe(f.source.id);
      expect(copy.source).toEqual({
        start: { row, column: start, ...flags },
        end: { row, column: end, ...flags },
      });
      expect(original).toEqual(before);
    },
  );
  test("source structural edits move absolute references; destination edits leave external source unchanged", () => {
    const f = fixture();
    const flags = { rowAbsolute: true, columnAbsolute: true };
    setCellSparkline(f.owner, position, {
      ...f.value,
      source: { start: { row: 2, column: 2, ...flags }, end: { row: 2, column: 4, ...flags } },
    });
    const before = structuredClone(f.current());
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 1));
    expect(f.current().source).toEqual({
      start: { row: 2, column: 3, ...flags },
      end: { row: 2, column: 5, ...flags },
    });
    expect(f.read()).toEqual([10, 20, 30]);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.owner.id, "row", 0));
    expect(getCellSparkline(f.owner, { row: 11, column: 10 })).toEqual(before);
    undoWorkbookCommand(f.session);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "row", 2));
    expect(f.current().source).toBeNull();
    expect(f.current().sourceSheetId).toBe(f.source.id);
    undoWorkbookCommand(f.session);
    expect(f.current()).toEqual(before);
  });
  test("deleting the source sheet preserves a broken identity and undo restores data", () => {
    const f = fixture();
    executeWorkbookCommand(f.session, createDeleteSheetCommand(f.session.workbook, f.source.id));
    expect(f.current().sourceSheetId).toBe(f.source.id);
    expect(f.current().source).toBeNull();
    expect(f.read()).toEqual([]);
    const broken = serializeWorkbook(f.session.workbook);
    expect(serializeWorkbook(deserializeWorkbook(broken))).toEqual(broken);
    undoWorkbookCommand(f.session);
    expect(f.read()).toEqual([10, 20, 30]);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.session.workbook)).toEqual(broken);
  });
  test("grouping retains each member's own main-data sheet and anchors", () => {
    const f = fixture(),
      second = { row: 10, column: 11 };
    const another = createSheet("Another", "another");
    insertSheet(f.session.workbook, another);
    const peer = {
      ...f.value,
      sourceSheetId: another.id,
      source: {
        start: { row: 3, column: 0, columnAbsolute: true },
        end: { row: 3, column: 2, columnAbsolute: true },
      },
    };
    setCellSparkline(f.owner, second, peer);
    const command = createGroupCellSparklinesCommand(
      f.session.workbook,
      f.owner.id,
      { start: position, end: second },
      position,
      "joined",
    );
    executeWorkbookCommand(f.session, command!);
    expect(f.current()).toMatchObject({
      groupId: "joined",
      sourceSheetId: f.source.id,
      source: f.value.source,
    });
    expect(getCellSparkline(f.owner, second)).toMatchObject({
      groupId: "joined",
      sourceSheetId: another.id,
      source: peer.source,
    });
    undoWorkbookCommand(f.session);
    expect(getCellSparkline(f.owner, second)).toEqual(peer);
  });
  test.each(["sheet", "anchors"] as const)("V111 gates new main-data $name metadata", (kind) => {
    const f = fixture();
    if (kind === "anchors") {
      const local = {
        ...f.value,
        source: {
          start: { row: 2, column: 2, rowAbsolute: true },
          end: { row: 2, column: 4, rowAbsolute: true },
        },
      };
      delete local.sourceSheetId;
      setCellSparkline(f.owner, position, local);
    }
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(111);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 110 })).toThrow();
  });
});
