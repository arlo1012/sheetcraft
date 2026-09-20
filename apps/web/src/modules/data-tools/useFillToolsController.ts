import { computed, ref, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  assertFillDataValidation,
  createFlashFillCommand,
  createFillBlanksCommand,
  createFillCurrentDateCommand,
  createFillNumberSequenceCommand,
  createFillRankCommand,
  createFillSeriesCommand,
  createInsertCellTextCommand,
  DataFillError,
  type SetCellContentsCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { parseCellInput } from "@idea10/core/input";
import {
  getActiveSheet,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type {
  FillBlanksDraft,
  FillCurrentDateDraft,
  FillSeriesDraft,
  FillTextDraft,
} from "./fill-tool-types";
import type { FillNumberSequenceDraft, FillRankDraft } from "./fill-number-types";
import { parseFillSeriesDateStop } from "./fill-series-date";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange; address?: CellAddress };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};
type FillTool = "series" | "blanks" | "text" | "date" | "numberSequence" | "rank";

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
  const fillNumberSequenceInitial = ref<FillNumberSequenceDraft>({
    axis: "columns",
    start: 1,
    step: 1,
  });
  const fillRankInitial = ref<FillRankDraft>({
    sourceRange: "",
    destination: "",
    order: "descending",
    ties: "competition",
    overwrite: false,
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
    if (options.isBusy() || !options.flush()) return false;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    if (sheet.properties.protected) return false;
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
    fillNumberSequenceInitial.value = { axis: fillSeriesInitial.value.axis, start: 1, step: 1 };
    const rankDestination =
      range.start.column === range.end.column
        ? { row: range.start.row, column: range.end.column + 1 }
        : { row: range.end.row + 1, column: range.start.column };
    fillRankInitial.value = {
      sourceRange: formatRangeReference(sheet.name, range),
      destination: isCellAddressInBounds(rankDestination)
        ? formatRangeReference(sheet.name, { start: rankDestination, end: rankDestination })
        : "",
      order: "descending",
      ties: "competition",
      overwrite: false,
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
    return true;
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
        if (tool === "rank") {
          // The requested ranks already match; no write or history entry is needed.
          closeFillTool();
          options.focusSheet();
        } else {
          fillError.value = t("dataTools.fill.noChanges");
        }
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
        if (draft.type === "date") {
          stop = parseFillSeriesDateStop(input, draft.dateUnit, draft.step, workbook.dateSystem);
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
  function openFillText(position: FillTextDraft["position"] = "start") {
    if (open("text")) fillTextInitial.value.position = position;
  }
  function fillCurrentDate(format: string) {
    if (!open("date")) return;
    fillCurrentDateInitial.value.format = format;
    applyFillCurrentDate(fillCurrentDateInitial.value);
  }
  function applyFillNumberSequence(draft: FillNumberSequenceDraft) {
    apply("numberSequence", (workbook, sheetId, range) =>
      createFillNumberSequenceCommand(workbook, sheetId, range, draft),
    );
  }
  function applyFillRank(draft: FillRankDraft) {
    apply("rank", (workbook, sheetId) => {
      const source = resolveRangeReference(workbook, draft.sourceRange, sheetId);
      const destination = resolveRangeReference(workbook, draft.destination, sheetId);
      if (
        !source ||
        !destination ||
        destination.range.start.row !== destination.range.end.row ||
        destination.range.start.column !== destination.range.end.column
      )
        throw new DataFillError(
          "invalidRange",
          "Choose a source range and a single destination cell.",
        );
      return createFillRankCommand(workbook, {
        source,
        target: { sheetId: destination.sheetId, start: destination.range.start },
        order: draft.order,
        ties: draft.ties,
        overwrite: draft.overwrite,
      });
    });
  }
  function flashFill() {
    if (active.value || options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    const selection = options.getSelection();
    try {
      const command = createFlashFillCommand(workbook, sheet.id, selection.range, {
        locale: locale.value,
        ...(selection.address ? { anchor: selection.address } : {}),
      });
      if (!command.changes.length) {
        void MessagePlugin.info(t("dataTools.fill.noChanges"));
        return;
      }
      assertFillDataValidation(workbook, command);
      if (!options.execute(command)) {
        void MessagePlugin.warning(t("dataTools.fill.applyBlocked"));
        return;
      }
      void MessagePlugin.success(
        t("dataTools.fill.flashFillSuccess", { count: command.changes.length }),
      );
    } catch (cause) {
      void MessagePlugin.warning(
        cause instanceof DataFillError
          ? t(`dataTools.fill.errors.${cause.reason}`)
          : t("dataTools.fill.applyBlocked"),
      );
    } finally {
      options.focusSheet();
    }
  }
  watch(options.getGeneration, closeFillTool);
  return {
    flashFill,
    fillNumberSequenceVisible: computed(() => active.value === "numberSequence"),
    fillRankVisible: computed(() => active.value === "rank"),
    fillNumberSequenceInitial,
    fillRankInitial,
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
    openFillText,
    fillCurrentDate,
    openFillNumberSequence: () => open("numberSequence"),
    openFillRank: () => open("rank"),
    applyFillNumberSequence,
    applyFillRank,
    openFillCurrentDate: () => open("date"),
    closeFillTool,
    applyFillSeries,
    applyFillBlanks,
    applyFillText,
    applyFillCurrentDate,
  };
}
