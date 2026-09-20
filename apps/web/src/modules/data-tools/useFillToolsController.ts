import { computed, ref, watch } from "vue";
import {
  assertFillDataValidation,
  createFillBlanksCommand,
  createFillCurrentDateCommand,
  createFillSeriesCommand,
  createInsertCellTextCommand,
  DataFillError,
  type SetCellContentsCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { datePartsToExcelSerial } from "@idea10/core/formula";
import { parseCellInput } from "@idea10/core/input";
import { getActiveSheet, type CellRange, type Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { formatRangeReference } from "../../shared/range-reference/formatRangeReference";
import type {
  FillBlanksDraft,
  FillCurrentDateDraft,
  FillSeriesDraft,
  FillTextDraft,
} from "./fill-tool-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};
type FillTool = "series" | "blanks" | "text" | "date";

export function useFillToolsController(options: Options) {
  const { t, locale } = useAppI18n();
  const active = ref<FillTool>();
  const fillError = ref("");
  const fillRangeLabel = ref("");
  const fillSeriesInitial = ref<FillSeriesDraft>({
    axis: "columns",
    type: "linear",
    step: 1,
    stop: "",
    dateUnit: "day",
    trend: false,
  });
  const fillBlanksInitial = ref<FillBlanksDraft>({ mode: "up", value: "" });
  const fillTextInitial = ref<FillTextDraft>({
    position: "start",
    from: "left",
    index: 0,
    text: "",
  });
  const fillCurrentDateInitial = ref<FillCurrentDateDraft>({
    year: 2000,
    month: 1,
    day: 1,
    format: "yyyy-mm-dd",
  });
  let target:
    | { workbook: Workbook; generation: number; sheetId: string; range: CellRange }
    | undefined;

  function open(tool: FillTool) {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    if (sheet.properties.protected) return;
    const selection = options.getSelection().range;
    const range = {
      start: {
        row: Math.min(selection.start.row, selection.end.row),
        column: Math.min(selection.start.column, selection.end.column),
      },
      end: {
        row: Math.max(selection.start.row, selection.end.row),
        column: Math.max(selection.start.column, selection.end.column),
      },
    };
    target = { workbook, generation: options.getGeneration(), sheetId: sheet.id, range };
    fillRangeLabel.value = formatRangeReference(sheet.name, range);
    fillError.value = "";
    fillSeriesInitial.value = {
      axis:
        range.end.column - range.start.column > range.end.row - range.start.row
          ? "rows"
          : "columns",
      type: "linear",
      step: 1,
      stop: "",
      dateUnit: "day",
      trend: false,
    };
    fillBlanksInitial.value = { mode: "up", value: "" };
    fillTextInitial.value = { position: "start", from: "left", index: 0, text: "" };
    const today = new Date();
    fillCurrentDateInitial.value = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      format: "yyyy-mm-dd",
    };
    active.value = tool;
  }
  function closeFillTool() {
    active.value = undefined;
    fillError.value = "";
    target = undefined;
  }
  function apply(
    tool: FillTool,
    build: (workbook: Workbook, sheetId: string, range: CellRange) => SetCellContentsCommand,
  ) {
    if (active.value !== tool || !target || options.isBusy() || !options.flush()) return;
    fillError.value = "";
    const workbook = options.getWorkbook();
    if (
      target.workbook !== workbook ||
      target.generation !== options.getGeneration() ||
      workbook.activeSheetId !== target.sheetId ||
      !workbook.sheets.has(target.sheetId)
    ) {
      fillError.value = t("dataTools.fill.rangeChanged");
      return;
    }
    try {
      const command = build(workbook, target.sheetId, target.range);
      if (!command.changes.length) {
        fillError.value = t("dataTools.fill.noChanges");
        return;
      }
      assertFillDataValidation(workbook, command);
      if (!options.execute(command)) {
        fillError.value = t("dataTools.fill.applyBlocked");
        return;
      }
      closeFillTool();
      options.focusSheet();
    } catch (cause) {
      fillError.value =
        cause instanceof DataFillError
          ? t(`dataTools.fill.errors.${cause.reason}`)
          : t("dataTools.fill.errors.invalidOptions");
    }
  }
  function applyFillSeries(draft: FillSeriesDraft) {
    apply("series", (workbook, sheetId, range) => {
      const input = draft.stop.trim();
      let stop: number | undefined;
      if (input && draft.type !== "auto") {
        if (draft.type === "date" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(input)) {
          const [year, month, day] = input.split("-").map(Number) as [number, number, number];
          stop = datePartsToExcelSerial(
            { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 },
            workbook.dateSystem,
          );
        } else {
          stop = Number(input);
          if (!Number.isFinite(stop))
            throw new DataFillError("invalidOptions", "Invalid stop value.");
        }
      }
      return createFillSeriesCommand(workbook, sheetId, range, { ...draft, stop });
    });
  }
  function applyFillBlanks(draft: FillBlanksDraft) {
    apply("blanks", (workbook, sheetId, range) =>
      createFillBlanksCommand(workbook, sheetId, range, {
        mode: draft.mode,
        value: parseCellInput(draft.value) ?? "",
      }),
    );
  }
  function applyFillText(draft: FillTextDraft) {
    apply("text", (workbook, sheetId, range) =>
      createInsertCellTextCommand(workbook, sheetId, range, { ...draft, locale: locale.value }),
    );
  }
  function applyFillCurrentDate(draft: FillCurrentDateDraft) {
    apply("date", (workbook, sheetId, range) =>
      createFillCurrentDateCommand(workbook, sheetId, range, draft),
    );
  }
  watch(options.getGeneration, closeFillTool);
  return {
    fillSeriesVisible: computed(() => active.value === "series"),
    fillBlanksVisible: computed(() => active.value === "blanks"),
    fillTextVisible: computed(() => active.value === "text"),
    fillCurrentDateVisible: computed(() => active.value === "date"),
    fillSeriesInitial,
    fillBlanksInitial,
    fillTextInitial,
    fillCurrentDateInitial,
    fillError,
    fillRangeLabel,
    openFillSeries: () => open("series"),
    openFillBlanks: () => open("blanks"),
    openFillText: () => open("text"),
    openFillCurrentDate: () => open("date"),
    closeFillTool,
    applyFillSeries,
    applyFillBlanks,
    applyFillText,
    applyFillCurrentDate,
  };
}
