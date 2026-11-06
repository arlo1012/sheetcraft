// 未执行：按用户要求仅编写测试，不运行检查或提交。
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, ref, type EffectScope } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellContent,
  getCellSparkline,
  setCellContent,
  setCellSparkline,
  setCellStyle,
  type CellAddress,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { useSparklineTools } from "../../../modules/sparklines/useSparklineTools";
import { useSparklineActions } from "../../../modules/sparklines/useSparklineActions";

const scopes: EffectScope[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
const firstAddress = { row: 0, column: 0 },
  secondAddress = { row: 0, column: 1 };
const peerAddress = { row: 2, column: 0 },
  secondPeerAddress = { row: 2, column: 1 };
const soloAddress = { row: 0, column: 2 };

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
  const workbook = createWorkbook({ id: "group-tools", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const first = definition(4, "group-a");
  const peer: CellSparkline = {
    ...definition(6, "group-a"),
    color: "#334455",
    highPoint: { show: false, color: "#00aa00" },
  };
  const second: CellSparkline = {
    ...definition(5, "group-b"),
    type: "column",
    color: "#445566",
    markers: true,
  };
  const secondPeer: CellSparkline = {
    ...definition(7, "group-b"),
    type: "column",
    color: "#778899",
    markers: true,
  };
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
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const range = ref<CellRange>({ start: { ...firstAddress }, end: { ...firstAddress } });
  const address = ref<CellAddress>({ ...firstAddress });
  const revision = ref(0),
    generation = ref(0),
    busy = ref(false);
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const changed = executeWorkbookCommand(session, command);
    if (changed) revision.value++;
    return changed;
  });
  const scope = effectScope();
  scopes.push(scope);
  const { tools, actions } = scope.run(() => {
    const shared = {
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRange: () => range.value,
      getGeneration: () => generation.value,
      getRevision: () => revision.value,
      isBusy: () => busy.value,
      flush,
      execute,
    };
    return {
      tools: useSparklineTools({ ...shared, getAddress: () => address.value, edit: vi.fn() }),
      actions: useSparklineActions(shared),
    };
  })!;
  return {
    workbook,
    sheet,
    session,
    first,
    peer,
    second,
    secondPeer,
    solo,
    range,
    address,
    revision,
    generation,
    busy,
    flush,
    execute,
    tools,
    actions,
  };
}

describe("persistent sparkline group tools", () => {
  test("applies style changes to unselected group peers while preserving sources and each point color", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    expect(f.tools.value!.apply({ type: "winLoss", highPoint: { show: true } })).toBe(true);

    expect(getCellSparkline(f.sheet, firstAddress)).toEqual({
      ...f.first,
      type: "winLoss",
      highPoint: { ...f.first.highPoint!, show: true },
    });
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual({
      ...f.peer,
      type: "winLoss",
      highPoint: { ...f.peer.highPoint!, show: true },
    });
    expect(getCellSparkline(f.sheet, secondAddress)).toEqual(f.second);
    expect(getCellSparkline(f.sheet, secondPeerAddress)).toEqual(f.secondPeer);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("groups only selected members using the active primary style without pulling in old peers", () => {
    const f = fixture();
    f.range.value = { start: firstAddress, end: secondAddress };
    f.address.value = secondAddress;
    const before = serializeWorkbook(f.workbook);
    const context = f.tools.value!;
    expect(context.canGroup).toBe(true);
    expect(context.group()).toBe(true);
    const groupId = getCellSparkline(f.sheet, firstAddress)!.groupId;

    expect(groupId).toEqual(expect.any(String));
    expect(groupId).not.toBe("group-a");
    expect(groupId).not.toBe("group-b");
    expect(getCellSparkline(f.sheet, firstAddress)).toEqual({
      ...f.second,
      groupId,
      source: f.first.source,
    });
    expect(getCellSparkline(f.sheet, secondAddress)).toEqual({ ...f.second, groupId });
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual(f.peer);
    expect(getCellSparkline(f.sheet, secondPeerAddress)).toEqual(f.secondPeer);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("ungroups the entire touched group and subsequent edits affect only the independent selected member", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    expect(f.tools.value!.canUngroup).toBe(true);
    expect(f.tools.value!.ungroup()).toBe(true);
    const { groupId: _firstGroup, ...first } = f.first;
    const { groupId: _peerGroup, ...peer } = f.peer;
    expect(getCellSparkline(f.sheet, firstAddress)).toEqual(first);
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual(peer);
    expect(getCellSparkline(f.sheet, secondAddress)).toEqual(f.second);
    expect(f.tools.value!.canUngroup).toBe(false);

    expect(f.tools.value!.apply({ color: "#abcdef" })).toBe(true);
    expect(getCellSparkline(f.sheet, firstAddress)).toEqual({ ...first, color: "#abcdef" });
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual(peer);
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each([false, true])(
    "clear whole group=%s respects deletion boundaries and leaves cell values intact",
    (wholeGroup) => {
      const f = fixture();
      const before = serializeWorkbook(f.workbook);
      const context = f.tools.value!;
      expect(wholeGroup ? context.clearGroup() : context.clear()).toBe(true);

      expect(getCellSparkline(f.sheet, firstAddress)).toBeUndefined();
      expect(getCellSparkline(f.sheet, peerAddress)).toEqual(wholeGroup ? undefined : f.peer);
      expect(getCellSparkline(f.sheet, secondAddress)).toEqual(f.second);
      expect(getCellSparkline(f.sheet, secondPeerAddress)).toEqual(f.secondPeer);
      expect(getCellSparkline(f.sheet, soloAddress)).toEqual(f.solo);
      expect(getCellContent(f.sheet, firstAddress)).toEqual({ kind: "literal", value: 101 });
      expect(getCellContent(f.sheet, peerAddress)).toEqual({ kind: "literal", value: 202 });
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("exposes group capabilities from selected membership rather than the expanded peer count", () => {
    const f = fixture();
    expect(f.tools.value!.canGroup).toBe(false);
    expect(f.tools.value!.canUngroup).toBe(true);
    f.range.value = { start: firstAddress, end: peerAddress };
    expect(f.tools.value!.canGroup).toBe(false);
    expect(f.tools.value!.canUngroup).toBe(true);
    expect(f.tools.value!.group()).toBe(false);
    f.range.value = { start: soloAddress, end: soloAddress };
    f.address.value = soloAddress;
    expect(f.tools.value!.canGroup).toBe(false);
    expect(f.tools.value!.canUngroup).toBe(false);
    expect(f.tools.value!.ungroup()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("rejects whole-group edits when an unselected peer is locked even if the selected member is editable", () => {
    const f = fixture();
    setCellStyle(f.sheet, firstAddress, { unlocked: true });
    f.sheet.properties.protected = true;
    f.sheet.protection = { formatCells: true, editableRanges: [] };
    const before = serializeWorkbook(f.workbook);
    const context = f.tools.value!;
    expect(context.disabled).toBe(true);
    expect(context.apply({ markers: true })).toBe(false);
    expect(context.ungroup()).toBe(false);
    expect(context.clearGroup()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["busy", "flush", "protection"] as const)(
    "rejects grouping actions after %s becomes unavailable",
    (block) => {
      const f = fixture();
      f.range.value = { start: firstAddress, end: secondAddress };
      const context = f.tools.value!;
      if (block === "busy") f.busy.value = true;
      if (block === "flush") f.flush.mockReturnValue(false);
      if (block === "protection") f.sheet.properties.protected = true;
      const before = serializeWorkbook(f.workbook);

      expect(context.group()).toBe(false);
      expect(context.ungroup()).toBe(false);
      expect(context.clearGroup()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test.each(["revision", "selection"] as const)(
    "rejects retained group callbacks after %s changes",
    (change) => {
      const f = fixture();
      f.range.value = { start: firstAddress, end: secondAddress };
      const context = f.tools.value!;
      if (change === "revision") f.revision.value++;
      else f.range.value = { start: soloAddress, end: soloAddress };
      const before = serializeWorkbook(f.workbook);

      expect(context.group()).toBe(false);
      expect(context.ungroup()).toBe(false);
      expect(context.clearGroup()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("gives each newly created batch one shared identity and keeps later creation batches independent", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.range.value = { start: { row: 0, column: 3 }, end: { row: 1, column: 3 } };
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "F1:H2", destination: "D1:D2" });
    const first = getCellSparkline(f.sheet, { row: 0, column: 3 })!;
    const second = getCellSparkline(f.sheet, { row: 1, column: 3 })!;
    expect(first.groupId).toEqual(expect.any(String));
    expect(second.groupId).toBe(first.groupId);
    expect(first.source).toEqual({ start: { row: 0, column: 5 }, end: { row: 0, column: 7 } });
    expect(second.source).toEqual({ start: { row: 1, column: 5 }, end: { row: 1, column: 7 } });
    f.range.value = { start: { row: 0, column: 4 }, end: { row: 1, column: 4 } };
    f.actions.open();
    f.actions.confirm({ ...f.actions.draft.value!, source: "F1:H2", destination: "E1:E2" });
    expect(getCellSparkline(f.sheet, { row: 0, column: 4 })?.groupId).not.toBe(first.groupId);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.session.history.undoStack).toHaveLength(2);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("editing a grouped member updates peer styles while keeping every peer source", () => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.actions.open();
    const draft = f.actions.draft.value!;
    const changed = {
      ...draft,
      source: "J1:L1",
      sparkline: {
        ...draft.sparkline,
        type: "winLoss" as const,
        color: "#abcdef",
        highPoint: { show: true, color: "#123abc" },
      },
    };
    f.actions.confirm(changed);

    expect(getCellSparkline(f.sheet, firstAddress)).toEqual({
      ...changed.sparkline,
      source: { start: { row: 0, column: 9 }, end: { row: 0, column: 11 } },
    });
    expect(getCellSparkline(f.sheet, peerAddress)).toEqual({
      ...changed.sparkline,
      source: f.peer.source,
    });
    expect(getCellSparkline(f.sheet, secondAddress)).toEqual(f.second);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
