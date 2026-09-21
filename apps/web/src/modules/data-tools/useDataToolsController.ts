import { computed, ref } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createAddSheetOutlineGroupCommand,
  createAdvancedFilterCommand,
  createApplySubtotalsCommand,
  createClearSheetDataValidationsCommand,
  createClearSheetFilterCommand,
  createMultiKeySortSheetRangeCommand,
  createRemoveDuplicatesCommand,
  createRemoveSubtotalsCommand,
  createRemoveSheetOutlineGroupCommand,
  createSetSheetDataValidationsCommand,
  createSetSheetFilterCriteriaCommand,
  createSetSheetOutlineGroupCollapsedCommand,
  createSplitColumnCommand,
  getRemoveDuplicatesCount,
  getSheetFilterColumnValueCounts,
  getSheetFilterValueKey,
  previewSplitColumn,
  suggestSplitColumnOptions,
  subtractSheetDataValidation,
  type WorkbookCommand,
} from "@idea10/core/commands";
import { resolveDataRange } from "@idea10/core/data-range";
import { WorkbookDomainError } from "@idea10/core/errors";
import { translateFormulaForCopy } from "@idea10/core/formula";
import { formatCellNumberValue } from "@idea10/core/number-format";
import {
  getActiveSheet,
  getCellStyle,
  type CellAddress,
  type CellRange,
  type SheetDataValidation,
  type SheetEvaluator,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { readSortSettings, writeSortSettings } from "./sort-settings";
import { getSortColorColumns } from "./sort-color-options";
import { resolveTextToColumnsOptions } from "./text-to-columns-options";
import { isValidationDraftComplete } from "./validation-draft";
import { useDuplicateToolsController } from "./useDuplicateToolsController";
import { useConsolidateController } from "./useConsolidateController";
import { useFillToolsController } from "./useFillToolsController";
import { useDropdownListController } from "./useDropdownListController";
import { useLookupFillController } from "./useLookupFillController";
import { useDataComparisonController } from "./useDataComparisonController";
import { useAdvancedFilterController } from "./useAdvancedFilterController";
import type {
  DataToolAxis,
  DataToolCapabilities,
  DataToolColumn,
  DataToolFilterAnchor,
  DataToolFilterCriteria,
  DataToolFilterValueOption,
  DataToolRangeSnapshot,
  DataValidationDraft,
  DataValidationInitial,
  RemoveDuplicatesDraft,
  SortDraft,
  SortInitial,
  SortLevel,
  SubtotalDraft,
  TextToColumnsDraft,
} from "./data-tools-types";

type Target = DataToolRangeSnapshot;
type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { address: CellAddress; range: CellRange };
  getSheetEvaluator: () => SheetEvaluator;
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
  recalculate?: () => void;
};

function columnName(column: number): string {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
function cloneRange(range: CellRange): CellRange {
  return { start: { ...range.start }, end: { ...range.end } };
}
function intersects(left: CellRange, right: CellRange): boolean {
  return (
    left.start.row <= right.end.row &&
    left.end.row >= right.start.row &&
    left.start.column <= right.end.column &&
    left.end.column >= right.start.column
  );
}
function rangeLabel(range: CellRange): string {
  return `${columnName(range.start.column)}${range.start.row + 1}:${columnName(range.end.column)}${range.end.row + 1}`;
}
function sortRangeKey(target: Target): string {
  const startRow = Math.min(target.range.start.row, target.range.end.row);
  const endRow = Math.max(target.range.start.row, target.range.end.row);
  const startColumn = Math.min(target.range.start.column, target.range.end.column);
  const endColumn = Math.max(target.range.start.column, target.range.end.column);
  return JSON.stringify([target.sheetId, startRow, startColumn, endRow, endColumn]);
}
function cloneSortLevels(levels: readonly SortLevel[] | undefined): SortLevel[] | undefined {
  return levels?.map((level) =>
    level.customOrder === undefined
      ? { ...level }
      : { ...level, customOrder: [...level.customOrder] },
  );
}
function cloneSortInitial(initial: SortInitial): SortInitial {
  return { ...initial, levels: cloneSortLevels(initial.levels) };
}

export function useDataToolsController(options: Options) {
  const { t, locale } = useAppI18n();
  const advancedFilter = useAdvancedFilterController(options);
  const duplicates = useDuplicateToolsController(options);
  const consolidate = useConsolidateController(options);
  const lookupFill = useLookupFillController(options);
  const fillTools = useFillToolsController(options);
  const dropdownList = useDropdownListController(options);
  const comparison = useDataComparisonController(options);
  const createId = createBrowserIdFactory();
  const sortVisible = ref(false);
  const textToColumnsVisible = ref(false);
  const removeDuplicatesVisible = ref(false);
  const validationVisible = ref(false);
  const subtotalVisible = ref(false);
  const sortTarget = ref<Target>();
  const sortInitial = ref<SortInitial>({
    hasHeader: true,
    column: 0,
    direction: "ascending" as "ascending" | "descending",
  });
  let sortSettingsGeneration: number | undefined;
  const sortSettings = new Map<string, SortInitial>();
  const textTarget = ref<Target>();
  const duplicateTarget = ref<Target>();
  const validationTarget = ref<Target>();
  const subtotalTarget = ref<Target>();
  const splitDraft = ref<TextToColumnsDraft>();
  const duplicateDraft = ref<RemoveDuplicatesDraft>();
  const validationInitial = ref<DataValidationInitial>();
  const filterPanel = ref<{ column: number; anchor?: DataToolFilterAnchor; target: Target }>();
  const activeSheet = computed(() => getActiveSheet(options.getWorkbook()));
  const disabled = computed(() => options.isBusy() || activeSheet.value.properties.protected);
  const selectedGroups = computed(() => {
    const { address } = options.getSelection();
    return (activeSheet.value.outlineGroups ?? [])
      .filter((group) => {
        const index = group.axis === "row" ? address.row : address.column;
        return group.start <= index && group.end >= index;
      })
      .sort((left, right) => left.end - left.start - (right.end - right.start));
  });
  const capabilities = computed<DataToolCapabilities>(() => {
    const sheet = activeSheet.value;
    const selection = options.getSelection();
    const range =
      sheet.filter && intersects(sheet.filter.range, selection.range)
        ? sheet.filter.range
        : resolveDataRange(sheet, selection.range);
    const rows = range.end.row - range.start.row;
    const merged = sheet.mergedCells.some((item) => intersects(item, range));
    const filtered = Boolean(sheet.filter && intersects(sheet.filter.range, range));
    return {
      sort: rows > (filtered ? 1 : 0) && !merged && !(filtered && sheet.filter?.advanced),
      split:
        selection.range.start.column === selection.range.end.column &&
        !sheet.mergedCells.some((item) => intersects(item, selection.range)) &&
        !(sheet.filter && intersects(sheet.filter.range, selection.range)),
      removeDuplicates: rows > 0 && !filtered && !merged,
      subtotal:
        (rows > 1 && range.end.column > range.start.column && !filtered && !merged) ||
        Boolean(sheet.subtotalMetadata?.length),
      ungroupRows: selectedGroups.value.some((group) => group.axis === "row"),
      ungroupColumns: selectedGroups.value.some((group) => group.axis === "column"),
      expand: selectedGroups.value.some((group) => group.collapsed),
      collapse: selectedGroups.value.some((group) => !group.collapsed),
      clearFilter: Boolean(sheet.filter?.columns.length || sheet.filter?.advanced),
    };
  });
  function error(message = t("dataTools.common.operationFailed")): void {
    void MessagePlugin.warning(message);
  }
  function capture(dataRegion = true): Target | undefined {
    if (options.isBusy() || !options.flush()) return undefined;
    const sheet = activeSheet.value;
    if (sheet.properties.protected) return undefined;
    const selection = options.getSelection();
    const range = dataRegion
      ? sheet.filter && intersects(sheet.filter.range, selection.range)
        ? sheet.filter.range
        : resolveDataRange(sheet, selection.range)
      : selection.range;
    return { sheetId: sheet.id, generation: options.getGeneration(), range: cloneRange(range) };
  }
  function valid(target: Target | undefined): target is Target {
    return Boolean(
      target &&
      !options.isBusy() &&
      options.getGeneration() === target.generation &&
      activeSheet.value.id === target.sheetId &&
      !activeSheet.value.properties.protected,
    );
  }
  function execute(target: Target | undefined, command: () => WorkbookCommand): boolean {
    if (!valid(target)) {
      error(t("dataTools.common.rangeChanged"));
      return false;
    }
    try {
      options.execute(command());
      return true;
    } catch (cause) {
      error(
        cause instanceof WorkbookDomainError && cause.data.details?.field === "overwrite"
          ? t("dataTools.textToColumns.overwriteRequired")
          : undefined,
      );
      return false;
    }
  }
  function sortSettingsFor(target: Target): SortInitial | undefined {
    if (sortSettingsGeneration !== target.generation) {
      sortSettings.clear();
      sortSettingsGeneration = target.generation;
    }
    const settings =
      sortSettings.get(sortRangeKey(target)) ?? readSortSettings(options.getWorkbook().id, target);
    return settings && cloneSortInitial(settings);
  }
  function rememberSortSettings(target: Target, settings: SortInitial): void {
    if (sortSettingsGeneration !== target.generation) {
      sortSettings.clear();
      sortSettingsGeneration = target.generation;
    }
    sortSettings.set(sortRangeKey(target), cloneSortInitial(settings));
    if (!writeSortSettings(options.getWorkbook().id, target, settings))
      void MessagePlugin.warning(t("dataTools.sort.storageUnavailable"));
  }
  function columnsFor(target?: Target): DataToolColumn[] {
    const range =
      target?.range ??
      activeSheet.value.filter?.range ??
      resolveDataRange(activeSheet.value, options.getSelection().range);
    const evaluator = options.getSheetEvaluator();
    return Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) => {
      const column = range.start.column + offset;
      const value = evaluator.getComputedValue({ row: range.start.row, column });
      return {
        column,
        label: columnName(column),
        ...(value === null || typeof value === "object" ? {} : { header: String(value) }),
      };
    });
  }
  const filterState = computed(() => {
    const panel = filterPanel.value;
    const filter = activeSheet.value.filter;
    if (!panel || !filter || panel.target.sheetId !== activeSheet.value.id) return undefined;
    const existing = filter.columns.find((item) => item.column === panel.column);
    const counts = getSheetFilterColumnValueCounts(
      activeSheet.value,
      filter.range,
      panel.column,
      options.getSheetEvaluator(),
    );
    const values = counts.map(({ value: key, count, address }) => ({
      key,
      count,
      label:
        key.kind === "blank"
          ? t("dataTools.filter.blank")
          : key.kind === "error"
            ? `#${key.code}!`
            : formatCellNumberValue(
                key.value,
                address ? getCellStyle(activeSheet.value, address)?.numberFormat : undefined,
                { locale: locale.value, dateSystem: options.getWorkbook().dateSystem },
              ).text,
    }));
    const header = options.getSheetEvaluator().getComputedValue({
      row: filter.range.start.row,
      column: panel.column,
    });
    const columnLabel = columnName(panel.column);
    const numeric = counts.filter((item) => item.value.kind === "number");
    const preferredKind = numeric.some(
      (item) =>
        item.address &&
        getCellStyle(activeSheet.value, item.address)?.numberFormat?.kind === "date",
    )
      ? ("date" as const)
      : numeric.length > 0
        ? ("number" as const)
        : ("text" as const);
    return {
      visible: true,
      anchor: panel.anchor,
      column: panel.column,
      columnLabel:
        header !== null && typeof header !== "object" && String(header).trim()
          ? `${header} (${columnLabel})`
          : columnLabel,
      values,
      appliedKeys: existing?.allowedValues ?? values.map((item) => item.key),
      criteria: existing?.condition,
      preferredKind,
      hasCriteria: Boolean(existing),
      canSort: filter.range.end.row - filter.range.start.row > 1,
      disabled: disabled.value,
    };
  });
  const filterActive = computed(() => Boolean(activeSheet.value.filter));
  const visibleDialogTarget = computed(() =>
    sortVisible.value
      ? sortTarget.value
      : textToColumnsVisible.value
        ? textTarget.value
        : removeDuplicatesVisible.value
          ? duplicateTarget.value
          : validationVisible.value
            ? validationTarget.value
            : subtotalVisible.value
              ? subtotalTarget.value
              : undefined,
  );
  const dialogColumns = computed(() => {
    const target = visibleDialogTarget.value;
    if (!target) return [];
    const columns = columnsFor(target);
    if (!subtotalVisible.value) return columns;
    const generatedColumns = new Set(
      (activeSheet.value.subtotalMetadata ?? []).flatMap((entry) => entry.generatedColumns ?? []),
    );
    return columns.filter((column) => !generatedColumns.has(column.column));
  });
  const sortColorColumns = computed(() => {
    const target = sortTarget.value;
    return sortVisible.value && target && valid(target)
      ? getSortColorColumns(activeSheet.value, target.range)
      : [];
  });
  const dialogRangeLabel = computed(() => {
    const target = visibleDialogTarget.value;
    return target ? rangeLabel(target.range) : "";
  });
  function splitText(value: ReturnType<SheetEvaluator["getComputedValue"]>): string {
    return value === null ? "" : typeof value === "object" ? `#${value.code}!` : String(value);
  }
  function resolveSplitSource(draft?: TextToColumnsDraft): Target | undefined {
    const target = textTarget.value;
    if (!target || !valid(target)) return undefined;
    if (draft?.source === undefined) return target;
    const source = resolveRangeReference(options.getWorkbook(), draft.source, target.sheetId);
    if (
      !source ||
      source.sheetId !== target.sheetId ||
      source.range.start.column !== source.range.end.column
    )
      return undefined;
    return { ...target, range: source.range };
  }
  const splitSourceTarget = computed(() => resolveSplitSource(splitDraft.value));
  const splitSourceEntries = computed(() => {
    const target = splitSourceTarget.value;
    if (!target || !valid(target)) return [];
    const evaluator = options.getSheetEvaluator();
    const entries: Array<{ row: number; text: string }> = [];
    for (const [key, cell] of activeSheet.value.cells) {
      if (!cell.content) continue;
      const separator = key.indexOf(":");
      const row = Number(key.slice(0, separator));
      const column = Number(key.slice(separator + 1));
      if (
        column === target.range.start.column &&
        row >= target.range.start.row &&
        row <= target.range.end.row
      )
        entries.push({ row, text: splitText(evaluator.getComputedValue({ row, column })) });
    }
    return entries.sort((left, right) => left.row - right.row);
  });
  const splitSuggestions = computed(() => {
    const entries = splitSourceEntries.value.filter(({ text }) => text.trim().length > 0);
    const count = Math.min(entries.length, 200);
    const sample = Array.from(
      { length: count },
      (_, index) =>
        entries[count === 1 ? 0 : Math.floor((index * (entries.length - 1)) / (count - 1))]!.text,
    );
    return suggestSplitColumnOptions(sample);
  });
  const splitSourceRows = computed(() => {
    const target = splitSourceTarget.value;
    if (!target || !valid(target)) return [];
    const evaluator = options.getSheetEvaluator();
    return Array.from(
      { length: Math.min(20, target.range.end.row - target.range.start.row + 1) },
      (_, offset) => {
        const row = target.range.start.row + offset;
        const value = evaluator.getComputedValue({ row, column: target.range.start.column });
        return { row, text: splitText(value) };
      },
    );
  });
  const splitDestinationLabel = computed(() => {
    const target = splitSourceTarget.value ?? textTarget.value;
    return target ? `${columnName(target.range.start.column)}${target.range.start.row + 1}` : "";
  });
  const splitAnalysis = computed(() => {
    const draft = splitDraft.value;
    const empty = { rows: [], columnCount: 0, error: "" };
    if (!draft) return empty;
    if (!splitSourceTarget.value)
      return { ...empty, error: t("dataTools.textToColumns.invalidSource") };
    const resolved = resolveTextToColumnsOptions(draft, splitSuggestions.value);
    if (!resolved) return empty;
    try {
      let columnCount = previewSplitColumn("", resolved).length;
      for (const { text } of splitSourceEntries.value)
        columnCount = Math.max(columnCount, previewSplitColumn(text, resolved).length);
      return {
        rows: splitSourceRows.value.map(({ row, text }) => ({
          row,
          values: previewSplitColumn(text, resolved),
        })),
        columnCount,
        error: "",
      };
    } catch {
      return { ...empty, error: t("dataTools.textToColumns.invalidSettings") };
    }
  });
  const splitPreviewRows = computed(() => splitAnalysis.value.rows);
  const splitColumnCount = computed(() => splitAnalysis.value.columnCount);
  const splitPreviewError = computed(() => splitAnalysis.value.error);
  const splitPreview = computed(() => splitPreviewRows.value[0]?.values ?? []);
  const duplicateCount = computed(() => {
    const target = duplicateTarget.value;
    if (!target || !valid(target)) return undefined;
    try {
      return getRemoveDuplicatesCount(
        options.getWorkbook(),
        createRemoveDuplicatesCommand(
          target.sheetId,
          target.range,
          duplicateDraft.value?.columns ?? [target.range.start.column],
          { hasHeader: duplicateDraft.value?.hasHeader },
        ),
      );
    } catch {
      return undefined;
    }
  });
  function toggleFilter(): void {
    const target = capture();
    if (!target) return;
    execute(target, () =>
      activeSheet.value.filter
        ? createClearSheetFilterCommand(target.sheetId)
        : createSetSheetFilterCriteriaCommand(target.sheetId, target.range, []),
    );
  }
  function clearFilter(): void {
    const target = capture();
    if (target && activeSheet.value.filter)
      execute(target, () =>
        createSetSheetFilterCriteriaCommand(target.sheetId, activeSheet.value.filter!.range, []),
      );
  }
  function reapplyFilter(): void {
    const target = capture();
    const filter = activeSheet.value.filter;
    if (!target || !filter) return;
    execute(target, () =>
      filter.advanced
        ? createAdvancedFilterCommand(target.sheetId, filter.range, {
            mode: "inPlace",
            ...(filter.advanced.criteria ? { criteria: filter.advanced.criteria } : {}),
            uniqueOnly: filter.advanced.uniqueOnly,
            overwrite: false,
          })
        : createSetSheetFilterCriteriaCommand(target.sheetId, filter.range, filter.columns),
    );
    options.recalculate?.();
  }
  function sort(direction: "ascending" | "descending"): void {
    const target = capture();
    if (!target) return;
    const hasHeader = inferHeader(target);
    const column = options.getSelection().address.column;
    if (hasHeader === undefined) {
      sortTarget.value = target;
      sortInitial.value = { hasHeader: true, column, direction };
      sortVisible.value = true;
      return;
    }
    if (
      execute(target, () =>
        createMultiKeySortSheetRangeCommand(target.sheetId, target.range, [{ column, direction }], {
          hasHeader,
        }),
      )
    )
      rememberSortSettings(target, {
        hasHeader,
        column,
        direction,
        levels: [{ column, direction }],
        // The Core command defaults this omitted option to case-sensitive comparisons.
        caseSensitive: true,
      });
  }
  function inferHeader(target: Target): boolean | undefined {
    if (activeSheet.value.filter && intersects(activeSheet.value.filter.range, target.range))
      return true;
    const evaluator = options.getSheetEvaluator();
    let hasTypedBody = false;
    for (let column = target.range.start.column; column <= target.range.end.column; column++) {
      const first = evaluator.getComputedValue({ row: target.range.start.row, column });
      if (typeof first !== "string" || !first.trim()) return false;
      const second = evaluator.getComputedValue({ row: target.range.start.row + 1, column });
      if (typeof second === "number" || typeof second === "boolean") hasTypedBody = true;
    }
    // All-text ranges need the user's header choice before moving any row.
    return hasTypedBody ? true : undefined;
  }
  function openSort(): void {
    const target = capture();
    if (target) {
      sortTarget.value = target;
      const restored = sortSettingsFor(target);
      sortInitial.value = {
        ...restored,
        hasHeader: restored?.hasHeader ?? inferHeader(target) ?? true,
        headerLocked: Boolean(
          activeSheet.value.filter && intersects(activeSheet.value.filter.range, target.range),
        ),
        column: restored?.column ?? options.getSelection().address.column,
        direction: restored?.direction ?? "ascending",
      };
      if (sortInitial.value.headerLocked) sortInitial.value.hasHeader = true;
      sortVisible.value = true;
    }
  }
  function applySort(draft: SortDraft): void {
    const target = sortTarget.value;
    const hasHeader =
      draft.hasHeader ||
      Boolean(
        activeSheet.value.filter &&
        target &&
        intersects(activeSheet.value.filter.range, target.range),
      );
    if (
      execute(target, () =>
        createMultiKeySortSheetRangeCommand(target!.sheetId, target!.range, draft.levels, {
          caseSensitive: draft.caseSensitive ?? false,
          hasHeader,
        }),
      )
    ) {
      if (target)
        rememberSortSettings(target, {
          hasHeader,
          column: draft.levels[0]?.column ?? target.range.start.column,
          direction: draft.levels[0]?.direction ?? "ascending",
          levels: cloneSortLevels(draft.levels),
          caseSensitive: draft.caseSensitive ?? false,
        });
      sortVisible.value = false;
      options.focusSheet();
    }
  }
  function openTextToColumns(): void {
    const target = capture(false);
    if (target && target.range.start.column !== target.range.end.column) {
      error(t("dataTools.textToColumns.selectSingleColumn"));
      return;
    }
    if (target) {
      textTarget.value = target;
      splitDraft.value = undefined;
      textToColumnsVisible.value = true;
    }
  }
  function applyTextToColumns(draft: TextToColumnsDraft): void {
    splitDraft.value = draft;
    const target = resolveSplitSource(draft);
    if (!target) {
      error(t("dataTools.textToColumns.invalidSource"));
      return;
    }
    const resolved = resolveTextToColumnsOptions(draft, splitSuggestions.value);
    if (!resolved) {
      error(
        t(
          draft.mode === "auto"
            ? "dataTools.textToColumns.autoNoSuggestion"
            : "dataTools.textToColumns.invalidSettings",
        ),
      );
      return;
    }
    try {
      previewSplitColumn("", resolved);
    } catch {
      error(t("dataTools.textToColumns.invalidSettings"));
      return;
    }
    const sourceColumn = target.range.start.column;
    // A column-only reference keeps the source row; cell references can move the output vertically.
    const destinationText = /^[A-Z]+$/iu.test(draft.destination.trim())
      ? `${draft.destination.trim()}${target.range.start.row + 1}`
      : draft.destination;
    const destination = resolveRangeReference(
      options.getWorkbook(),
      destinationText,
      target.sheetId,
    );
    if (
      !destination ||
      destination.sheetId !== target.sheetId ||
      destination.range.start.row !== destination.range.end.row ||
      destination.range.start.column !== destination.range.end.column
    ) {
      error(t("dataTools.textToColumns.invalidDestination"));
      return;
    }
    if (
      execute(target, () =>
        createSplitColumnCommand(target.sheetId, sourceColumn, target.range, {
          destinationColumn: destination.range.start.column,
          destinationRow: destination.range.start.row,
          ...resolved,
          dateOrders: draft.dateOrders,
          overwrite: draft.overwrite,
          columnTypes: draft.columnTypes,
        }),
      )
    )
      textToColumnsVisible.value = false;
  }
  function openRemoveDuplicates(): void {
    const target = capture();
    if (target) {
      duplicateTarget.value = target;
      duplicateDraft.value = undefined;
      removeDuplicatesVisible.value = true;
    }
  }
  function applyRemoveDuplicates(draft: RemoveDuplicatesDraft): void {
    const target = duplicateTarget.value;
    if (!draft.columns.length) {
      error();
      return;
    }
    if (
      execute(target, () =>
        createRemoveDuplicatesCommand(target!.sheetId, target!.range, draft.columns, {
          hasHeader: draft.hasHeader,
        }),
      )
    )
      removeDuplicatesVisible.value = false;
  }
  function openValidation(): void {
    const target = capture(false);
    if (!target) return;
    validationTarget.value = target;
    const existing = activeSheet.value.dataValidations?.find(
      (rule) =>
        rule.range.start.row <= target.range.start.row &&
        rule.range.end.row >= target.range.end.row &&
        rule.range.start.column <= target.range.start.column &&
        rule.range.end.column >= target.range.end.column,
    );
    const delta = existing && {
      row: target.range.start.row - existing.range.start.row,
      column: target.range.start.column - existing.range.start.column,
    };
    const initial =
      existing && delta
        ? {
            ...existing,
            ...(existing.formula1 === undefined
              ? {}
              : { formula1: translateFormulaForCopy(existing.formula1, delta) }),
            ...(existing.formula2 === undefined
              ? {}
              : { formula2: translateFormulaForCopy(existing.formula2, delta) }),
          }
        : undefined;
    validationInitial.value = initial;
    validationVisible.value = true;
  }
  function applyValidation(draft: DataValidationDraft): void {
    const target = validationTarget.value;
    if (!target || !isValidationDraftComplete(draft, options.getWorkbook().dateSystem)) return;
    if (draft.type === "any") {
      clearValidation();
      return;
    }
    const type = draft.type === "text-length" ? "textLength" : draft.type;
    const list =
      type === "list" && !draft.source.trim().startsWith("=")
        ? draft.source
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    const rule: SheetDataValidation = {
      id: createId("validation"),
      range: target.range,
      type,
      allowBlank: draft.ignoreBlank,
      showInput: draft.showInputMessage,
      showError: draft.showErrorAlert,
      showDropdown: draft.showDropdown,
      promptTitle: draft.inputTitle,
      prompt: draft.inputMessage,
      errorTitle: draft.errorTitle,
      error: draft.errorMessage,
      errorStyle: draft.errorStyle,
      ...(list
        ? { list }
        : {
            formula1:
              draft.type === "list" || draft.type === "custom" ? draft.source : draft.minimum,
            ...(draft.maximum ? { formula2: draft.maximum } : {}),
            ...(draft.type === "custom" || draft.type === "list"
              ? {}
              : { operator: draft.operator }),
          }),
    };
    const rules = activeSheet.value.dataValidations ?? [];
    const ids = new Set([...rules.map((item) => item.id), rule.id]);
    const existing = rules.flatMap((item) => subtractSheetDataValidation(item, target.range, ids));
    if (
      execute(target, () =>
        createSetSheetDataValidationsCommand(target.sheetId, [...existing, rule]),
      )
    )
      validationVisible.value = false;
  }
  function clearValidation(): void {
    if (
      execute(validationTarget.value, () =>
        createClearSheetDataValidationsCommand(
          validationTarget.value!.sheetId,
          validationTarget.value!.range,
        ),
      )
    )
      validationVisible.value = false;
  }
  function group(axis: DataToolAxis): void {
    const target = capture(false);
    if (target)
      execute(target, () =>
        createAddSheetOutlineGroupCommand(target.sheetId, {
          id: createId("outline"),
          axis: axis === "rows" ? "row" : "column",
          start: axis === "rows" ? target.range.start.row : target.range.start.column,
          end: axis === "rows" ? target.range.end.row : target.range.end.column,
          collapsed: false,
        }),
      );
  }
  function ungroup(axis: DataToolAxis): void {
    const target = capture(false);
    if (!target) return;
    const group = selectedGroups.value.find(
      (item) => item.axis === (axis === "rows" ? "row" : "column"),
    );
    if (group)
      execute(target, () => createRemoveSheetOutlineGroupCommand(target.sheetId, group.id));
  }
  function setGroupsCollapsed(collapsed: boolean): void {
    const target = capture(false);
    if (!target) return;
    const group = selectedGroups.value.find((item) => Boolean(item.collapsed) !== collapsed);
    if (group)
      execute(target, () =>
        createSetSheetOutlineGroupCollapsedCommand(target.sheetId, group.id, collapsed),
      );
  }
  function openSubtotal(): void {
    const target = capture();
    if (target) {
      const existing = (activeSheet.value.subtotalMetadata ?? []).filter((entry) =>
        intersects(entry.range, target.range),
      );
      for (const entry of existing) {
        target.range = {
          start: {
            row: Math.min(target.range.start.row, entry.range.start.row),
            column: Math.min(target.range.start.column, entry.range.start.column),
          },
          end: {
            row: Math.max(target.range.end.row, entry.range.end.row),
            column: Math.max(target.range.end.column, entry.range.end.column),
          },
        };
      }
      subtotalTarget.value = target;
      subtotalVisible.value = true;
    }
  }
  function applySubtotal(draft: SubtotalDraft): void {
    const target = subtotalTarget.value;
    if (!draft.valueColumns.length) {
      error();
      return;
    }
    if (
      execute(target, () =>
        createApplySubtotalsCommand(
          target!.sheetId,
          target!.range,
          [draft.groupColumn],
          draft.valueColumns,
          draft.function,
          {
            hasHeader: true,
            replaceExisting: draft.replaceExisting,
            pageBreaks: draft.pageBreaks,
            summaryBelow: draft.summaryBelow,
            labels: {
              subtotal: t("dataTools.outline.subtotalLabel"),
              grandTotal: t("dataTools.outline.grandTotalLabel"),
            },
          },
        ),
      )
    )
      subtotalVisible.value = false;
  }
  function removeSubtotals(): void {
    const target = subtotalTarget.value;
    if (execute(target, () => createRemoveSubtotalsCommand(target!.sheetId)))
      subtotalVisible.value = false;
  }
  function openColumnFilter(column: number, anchor?: DataToolFilterAnchor): void {
    if (options.isBusy() || !options.flush() || activeSheet.value.properties.protected) return;
    const filter = activeSheet.value.filter;
    if (!filter) return;
    const target = {
      sheetId: activeSheet.value.id,
      generation: options.getGeneration(),
      range: cloneRange(filter.range),
    };
    filterPanel.value = { column, anchor, target };
  }
  function sortFilterColumn(direction: "ascending" | "descending"): void {
    const panel = filterPanel.value;
    if (
      panel &&
      execute(panel.target, () =>
        createMultiKeySortSheetRangeCommand(
          panel.target.sheetId,
          panel.target.range,
          [{ column: panel.column, direction }],
          { hasHeader: true },
        ),
      )
    )
      filterPanel.value = undefined;
  }
  function applyColumnFilter(payload: {
    includedKeys: DataToolFilterValueOption["key"][];
    criteria?: DataToolFilterCriteria;
  }): void {
    const panel = filterPanel.value;
    const filter = activeSheet.value.filter;
    if (!panel || !filter) return;
    const nextColumns = filter.columns.filter((item) => item.column !== panel.column);
    const selected = new Set(payload.includedKeys.map(getSheetFilterValueKey));
    const available = filterState.value?.values ?? [];
    const allSelected =
      !payload.criteria &&
      available.length > 0 &&
      available.every((option) => selected.has(getSheetFilterValueKey(option.key)));
    if (!allSelected)
      nextColumns.push({
        column: panel.column,
        allowedValues: payload.includedKeys.map((key) => ({ ...key })),
        ...(payload.criteria ? { condition: payload.criteria } : {}),
      });
    if (
      execute(panel.target, () =>
        createSetSheetFilterCriteriaCommand(panel.target.sheetId, filter.range, nextColumns),
      )
    )
      filterPanel.value = undefined;
  }
  function clearColumnFilter(): void {
    const panel = filterPanel.value;
    const filter = activeSheet.value.filter;
    if (
      panel &&
      filter &&
      execute(panel.target, () =>
        createSetSheetFilterCriteriaCommand(
          panel.target.sheetId,
          filter.range,
          filter.columns.filter((item) => item.column !== panel.column),
        ),
      )
    )
      filterPanel.value = undefined;
  }
  return {
    ...advancedFilter,
    ...duplicates,
    ...comparison,
    ...lookupFill,
    ...dropdownList,
    ...fillTools,
    ...consolidate,
    disabled,
    capabilities,
    columns: dialogColumns,
    sortInitial,
    sortColorColumns,
    rangeLabel: dialogRangeLabel,
    splitPreview,
    splitPreviewRows,
    splitSourceRows,
    splitSuggestions,
    splitPreviewError,
    splitColumnCount,
    splitDestinationLabel,
    duplicateCount,
    validationInitial,
    hasSubtotals: computed(() => Boolean(activeSheet.value.subtotalMetadata?.length)),
    filterActive,
    filterState,
    sortVisible,
    textToColumnsVisible,
    removeDuplicatesVisible,
    validationVisible,
    subtotalVisible,
    toggleFilter,
    clearFilter,
    reapplyFilter,
    sort,
    applySort,
    openSort,
    openTextToColumns,
    applyTextToColumns,
    updateTextToColumnsDraft: (draft: TextToColumnsDraft) => {
      splitDraft.value = draft;
    },
    updateRemoveDuplicatesDraft: (draft: RemoveDuplicatesDraft) => {
      duplicateDraft.value = draft;
    },
    openRemoveDuplicates,
    applyRemoveDuplicates,
    openValidation,
    applyValidation,
    clearValidation,
    group,
    ungroup,
    setGroupsCollapsed,
    openSubtotal,
    applySubtotal,
    removeSubtotals,
    openColumnFilter,
    sortFilterColumn,
    applyColumnFilter,
    clearColumnFilter,
    closeColumnFilter: () => {
      filterPanel.value = undefined;
    },
    closeSort: () => {
      sortVisible.value = false;
      sortTarget.value = undefined;
    },
    closeTextToColumns: () => {
      textToColumnsVisible.value = false;
      textTarget.value = undefined;
      splitDraft.value = undefined;
    },
    closeRemoveDuplicates: () => {
      removeDuplicatesVisible.value = false;
      duplicateTarget.value = undefined;
    },
    closeValidation: () => {
      validationVisible.value = false;
      validationTarget.value = undefined;
      validationInitial.value = undefined;
    },
    closeSubtotal: () => {
      subtotalVisible.value = false;
      subtotalTarget.value = undefined;
    },
  };
}
