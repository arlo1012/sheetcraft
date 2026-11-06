// 未执行：按用户要求仅编写测试，不运行检查或提交。
import { describe, expect, test } from "vitest";
import {
  copySparklineGroups,
  expandSparklineGroups,
  getSheetSparklines,
  normalizeCellSparkline,
  type CellSparkline,
} from "../../sparklines.js";
import {
  createGroupCellSparklinesCommand,
  createUngroupCellSparklinesCommand,
  createInsertSheetAxisCommand,
  createDeleteSheetAxisCommand,
  createMoveCellRangeCommand,
} from "../../commands/index.js";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { createSequentialIdFactory } from "../../runtime.js";
import {
  deserializeWorkbook,
  serializeWorkbook,
  deserializeSheet,
  serializeSheet,
} from "../../serialization.js";
import {
  createSheet,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
  setCellContent,
  setCellSparkline,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

const firstAddress = { row: 0, column: 0 },
  secondAddress = { row: 0, column: 1 };
const peerAddress = { row: 2, column: 0 },
  secondPeerAddress = { row: 2, column: 1 };
const soloAddress = { row: 0, column: 2 };
const pair = { start: firstAddress, end: secondAddress };

function definition(row: number, groupId?: string): CellSparkline {
  return {
    type: "line",
    source: { start: { row, column: 5 }, end: { row, column: 7 } },
    color: "#112233",
    negativeColor: "#ef4444",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    highPoint: { show: false, color: "#aa0000" },
    ...(groupId === undefined ? {} : { groupId }),
  };
}

function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const first = definition(4, "group-a"),
    peer = definition(6, "group-a");
  const second: CellSparkline = {
    ...definition(5, "group-b"),
    type: "column",
    color: "#445566",
    markers: true,
    highPoint: { show: true, color: "#00aa00" },
  };
  const secondPeer = { ...second, source: definition(7).source };
  const solo = definition(8);
  for (const [address, value] of [
    [firstAddress, first],
    [secondAddress, second],
    [peerAddress, peer],
    [secondPeerAddress, secondPeer],
    [soloAddress, solo],
  ] as const)
    setCellSparkline(sheet, address, value);
  setCellContent(sheet, firstAddress, { kind: "literal", value: 101 });
  setCellContent(sheet, peerAddress, { kind: "literal", value: 202 });
  return { session, sheet, first, second, peer, secondPeer, solo };
}

describe("persistent sparkline groups", () => {
  test("validates explicit group identities without injecting one into an independent sparkline", () => {
    expect(normalizeCellSparkline(definition(4, "group-a"))?.groupId).toBe("group-a");
    expect(Object.hasOwn(normalizeCellSparkline(definition(4))!, "groupId")).toBe(false);
    for (const groupId of ["", "  ", 42, null])
      expect(() =>
        normalizeCellSparkline({ ...definition(4), groupId } as unknown as CellSparkline),
      ).toThrow();
  });

  test("collects only actual selected sparklines and expands worksheet-local groups without duplicates or mutations", () => {
    const f = fixture();
    const other = createSheet("Other", "other");
    insertSheet(f.session.workbook, other);
    setCellSparkline(other, { row: 9, column: 9 }, definition(9, "group-a"));
    const before = serializeWorkbook(f.session.workbook);
    const selected = getSheetSparklines(f.sheet, { start: firstAddress, end: soloAddress });
    expect(selected.map(({ address }) => address)).toEqual([
      firstAddress,
      secondAddress,
      soloAddress,
    ]);
    const groupA = selected.find(({ value }) => value.groupId === "group-a")!;
    const solo = selected.find(({ value }) => value.groupId === undefined)!;
    const expanded = expandSparklineGroups(f.sheet, [groupA, solo, groupA]);
    expect(expanded.map(({ address }) => `${address.row}:${address.column}`).sort()).toEqual([
      "0:0",
      "0:2",
      "2:0",
    ]);
    expanded[0]!.value.source!.start.row = 99;
    expanded[0]!.value.highPoint!.color = "#ffffff";
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("groups only selected members using the primary style and retains every independent source", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const command = createGroupCellSparklinesCommand(
      f.session.workbook,
      f.sheet.id,
      pair,
      secondAddress,
      "joined",
    );
    expect(command?.changes.map(({ address }) => address)).toEqual([firstAddress, secondAddress]);
    expect(executeWorkbookCommand(f.session, command!)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(getCellSparkline(f.sheet, firstAddress)).toEqual({
      ...f.second,
      groupId: "joined",
      source: f.first.source,
    });
    expect(getCellSparkline(f.sheet, secondAddress)).toEqual({ ...f.second, groupId: "joined" });
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual(f.peer);
    expect(getCellSparkline(f.sheet, secondPeerAddress)).toEqual(f.secondPeer);
    expect(getCellSparkline(f.sheet, soloAddress)).toEqual(f.solo);
    const grouped = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(grouped);
  });

  test("ungroups every touched group including unselected peers while retaining their complete definitions", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    const command = createUngroupCellSparklinesCommand(f.session.workbook, f.sheet.id, {
      start: firstAddress,
      end: soloAddress,
    });
    expect(command?.changes).toHaveLength(4);
    expect(executeWorkbookCommand(f.session, command!)).toBe(true);
    for (const [address, value] of [
      [firstAddress, f.first],
      [secondAddress, f.second],
      [peerAddress, f.peer],
      [secondPeerAddress, f.secondPeer],
    ] as const) {
      const { groupId: _groupId, ...independent } = value;
      expect(getCellSparkline(f.sheet, address)).toEqual(independent);
    }
    expect(getCellSparkline(f.sheet, soloAddress)).toEqual(f.solo);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("has no grouping command for fewer than two members or ungrouping command for independent members", () => {
    const f = fixture();
    expect(
      createGroupCellSparklinesCommand(
        f.session.workbook,
        f.sheet.id,
        { start: soloAddress, end: soloAddress },
        soloAddress,
        "joined",
      ),
    ).toBeNull();
    expect(
      createUngroupCellSparklinesCommand(f.session.workbook, f.sheet.id, {
        start: soloAddress,
        end: soloAddress,
      }),
    ).toBeNull();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test("saves groups conditionally in snapshot 96, rejects older envelopes and infers standalone sheet support", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    setCellSparkline(sheet, firstAddress, definition(4));
    const legacy = serializeWorkbook(session.workbook);
    expect(legacy.version).toBeLessThan(96);
    setCellSparkline(sheet, firstAddress, definition(4, "group-a"));
    setCellSparkline(sheet, peerAddress, definition(6, "group-a"));
    const snapshot = serializeWorkbook(session.workbook);
    expect(snapshot.version).toBe(96);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 95 })).toThrow(/version 96/);
    const standalone = serializeSheet(sheet);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(getCellSparkline(deserializeSheet(standalone), peerAddress)?.groupId).toBe("group-a");
  });

  test.each([
    {
      axis: "row" as const,
      index: 2,
      first: { row: 0, column: 0 },
      peer: { row: 3, column: 0 },
      source: { start: { row: 5, column: 5 }, end: { row: 5, column: 7 } },
    },
    {
      axis: "column" as const,
      index: 0,
      first: { row: 0, column: 1 },
      peer: { row: 2, column: 1 },
      source: { start: { row: 4, column: 6 }, end: { row: 4, column: 8 } },
    },
  ])(
    "retains group identities through $axis insertion while transforming sources and target cells",
    ({ axis, index, first, peer, source }) => {
      const f = fixture();
      const before = serializeWorkbook(f.session.workbook);
      expect(
        executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.sheet.id, axis, index)),
      ).toBe(true);
      expect(getCellSparkline(f.sheet, first)?.groupId).toBe("group-a");
      expect(getCellSparkline(f.sheet, peer)?.groupId).toBe("group-a");
      expect(getCellSparkline(f.sheet, first)?.source).toEqual(source);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("keeps surviving peer identity when another group member's row is deleted", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.sheet.id, "row", 0));
    expect(getCellSparkline(f.sheet, { row: 1, column: 0 })?.groupId).toBe("group-a");
    expect(getCellSparkline(f.sheet, firstAddress)).toBeUndefined();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });

  test("copies group relationships into fresh identities per block and per copy operation without mutating originals", () => {
    const f = fixture();
    const matrix = [
      [f.first, f.second, null],
      [f.peer, f.solo, null],
    ];
    const before = structuredClone(matrix);
    const ids = createSequentialIdFactory();
    const firstCopy = copySparklineGroups(matrix, ids);
    const nextCopy = copySparklineGroups(matrix, ids);
    expect(firstCopy[0]![0]!.groupId).toBe(firstCopy[1]![0]!.groupId);
    expect(firstCopy[0]![0]!.groupId).not.toBe("group-a");
    expect(firstCopy[0]![1]!.groupId).not.toBe("group-b");
    expect(firstCopy[0]![1]!.groupId).not.toBe(firstCopy[0]![0]!.groupId);
    expect(nextCopy[0]![0]!.groupId).not.toBe(firstCopy[0]![0]!.groupId);
    expect(Object.hasOwn(firstCopy[1]![1]!, "groupId")).toBe(false);
    expect(firstCopy[0]![2]).toBeNull();
    firstCopy[0]![0]!.source!.start.row = 99;
    firstCopy[0]![0]!.highPoint!.color = "#ffffff";
    expect(matrix).toEqual(before);
  });

  test("retains group membership for cut moves and ordinary fill copies with undo", () => {
    const f = fixture();
    const before = serializeWorkbook(f.session.workbook);
    executeWorkbookCommand(
      f.session,
      createMoveCellRangeCommand(
        f.sheet.id,
        { start: firstAddress, end: firstAddress },
        { row: 0, column: 3 },
      ),
    );
    expect(getCellSparkline(f.sheet, { row: 0, column: 3 })?.groupId).toBe("group-a");
    expect(getCellSparkline(f.sheet, peerAddress)?.groupId).toBe("group-a");
    expect(getCellSparkline(f.sheet, firstAddress)).toBeUndefined();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);

    const plan = captureCellFill(
      f.session.workbook,
      f.sheet.id,
      { start: firstAddress, end: firstAddress },
      { start: firstAddress, end: { row: 1, column: 0 } },
    );
    expect(
      executeWorkbookCommand(f.session, createCellFillCommand(f.session.workbook, plan, "copy")),
    ).toBe(true);
    expect(getCellSparkline(f.sheet, { row: 1, column: 0 })?.groupId).toBe("group-a");
    expect(getCellSparkline(f.sheet, firstAddress)?.groupId).toBe("group-a");
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
  });
});
