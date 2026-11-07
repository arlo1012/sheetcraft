import { ref, shallowRef } from "vue";
import {
  createDashboardSheetCommand,
  createSetDashboardCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  newDashboardWidget,
  type DashboardKind,
  type DashboardWidget,
  type SheetDashboard,
} from "@sheetcraft/core/dashboard";
import type { Workbook, Sheet, CellRange } from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { useRangeReferencePicker } from "../../shared/range-reference/useRangeReferencePicker";
import { formatRangeReference } from "../../shared/range-reference/formatRangeReference";

const skipKey = "sheetcraft.dashboard.skip-create",
  snapshotKey = "sheetcraft.dashboard.snapshot";
export function useDashboardActions(options: {
  workbook: () => Workbook;
  sheet: () => Sheet;
  range: () => CellRange;
  selectSheet: (id: string) => void;
  busy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  title: () => string;
  widgetTitle: (kind: DashboardKind) => string;
}) {
  const makeId = createBrowserIdFactory();
  const creating = shallowRef<{ workbook: Workbook; sheet: Sheet }>();
  const editing = shallowRef<{
    sheet: Sheet;
    workbook: Workbook;
    initial: DashboardWidget;
    original?: string;
  }>();
  const error = ref(false);
  const picker = useRangeReferencePicker(() => options.sheet().name);
  function openCreate() {
    if (options.busy() || options.workbook().structureProtected || !options.flush()) return;
    error.value = false;
    creating.value = { workbook: options.workbook(), sheet: options.sheet() };
    if (localStorage.getItem(skipKey) === "1")
      create(localStorage.getItem(snapshotKey) !== "0", true);
  }
  function create(snapshot: boolean, skip: boolean) {
    const target = creating.value;
    if (
      !target ||
      target.workbook !== options.workbook() ||
      target.sheet !== options.sheet() ||
      options.busy() ||
      target.workbook.structureProtected
    )
      return;
    try {
      if (
        !options.execute(
          createDashboardSheetCommand(target.workbook, options.title(), snapshot, makeId),
        )
      )
        throw new Error();
      creating.value = undefined;
      localStorage.setItem(skipKey, skip ? "1" : "0");
      localStorage.setItem(snapshotKey, snapshot ? "1" : "0");
    } catch {
      error.value = true;
    }
  }
  function update(board: SheetDashboard) {
    const owner = options.sheet();
    if (!owner.dashboard || owner.properties.protected || options.busy()) return false;
    if (JSON.stringify(board) === JSON.stringify(owner.dashboard)) return true;
    try {
      return options.execute(createSetDashboardCommand(owner.id, board));
    } catch {
      return false;
    }
  }
  function edit(kind: DashboardKind, widget?: DashboardWidget) {
    const owner = options.sheet();
    if (!owner.dashboard || owner.properties.protected || options.busy()) return;
    error.value = false;
    editing.value = {
      sheet: owner,
      workbook: options.workbook(),
      initial: widget ?? newDashboardWidget(makeId("widget"), kind, options.widgetTitle(kind)),
      original: widget && JSON.stringify(widget),
    };
  }
  function save(widget: DashboardWidget) {
    const target = editing.value,
      board = target?.sheet.dashboard;
    error.value = true;
    if (
      !target ||
      target.sheet !== options.sheet() ||
      target.workbook !== options.workbook() ||
      !board ||
      picker.active.value
    )
      return;
    const original = board.widgets.find((w) => w.id === widget.id);
    if (JSON.stringify(original) !== target.original) return;
    const widgets = original
      ? board.widgets.map((w) => (w.id === widget.id ? widget : w))
      : [...board.widgets, widget];
    if (update({ ...board, widgets })) close();
  }
  async function pick(sheetId: string, current: string) {
    const target = editing.value,
      source = options.workbook().sheets.get(sheetId);
    if (!target || !source || source.dashboard || source.properties.hidden || options.busy())
      return;
    options.selectSheet(source.id);
    const result = await picker.selectReference(
      current || formatRangeReference(source.name, options.range()),
    );
    if (
      !editing.value ||
      target !== editing.value ||
      target.workbook !== options.workbook() ||
      target.workbook.sheets.get(target.sheet.id) !== target.sheet
    )
      return;
    options.selectSheet(target.sheet.id);
    return result;
  }
  function close() {
    picker.cancel();
    editing.value = undefined;
    creating.value = undefined;
    error.value = false;
  }
  return { creating, editing, error, picker, create, openCreate, update, edit, save, pick, close };
}
