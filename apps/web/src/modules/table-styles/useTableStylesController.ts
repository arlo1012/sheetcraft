import { computed, nextTick, onScopeDispose, ref, shallowRef, watch } from "vue";
import { MessagePlugin } from "tdesign-vue-next/es/message";
import {
  createApplyTableStyleToRangeCommand,
  createCreateTableCommand,
  createUpdateTableCommand,
  createResizeTableCommand,
  createRemoveTableCommand,
  createSetWorkbookTableStylesCommand,
  createSetWorkbookPivotTableStylesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { resolveDataRange } from "@sheetcraft/core/data-range";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  getTableAtAddress,
  hasHighlightedFirstColumn,
  type TableStyleDefinition,
} from "@sheetcraft/core/table-styles";
import type { PivotTableStyleDefinition } from "@sheetcraft/core/pivot-table-styles";
import type {
  CellAddress,
  CellRange,
  Sheet,
  SheetTable,
  Workbook,
} from "@sheetcraft/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { CreateTableDraft, TableOptionsPatch, TableSettingsDraft } from "./table-ui-types";

type DialogTarget = {
  dialogId: number;
  workbook: Workbook;
  generation: number;
  sheet: Sheet;
  sheetId: string;
  table?: SheetTable;
};
type Target = DialogTarget & {
  intent: "insert" | "applyStyle";
  range: CellRange;
  hasHeaders: boolean;
  style: TableStyleDefinition;
  confirm: (draft: CreateTableDraft) => void;
  cancel: () => void;
};
type SettingsTarget = DialogTarget & {
  tableId: string;
  initial: TableSettingsDraft;
  confirm: (draft: TableSettingsDraft) => void;
  convert: () => void;
  cancel: () => void;
};
type ResizeTarget = DialogTarget & {
  tableId: string;
  range: string;
  confirm: (range: string) => void;
  cancel: () => void;
};

export function useTableStylesController(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getAddress: () => CellAddress;
  getSelection: () => CellRange;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  finishEditing: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  focus: () => void;
}) {
  const { t } = useAppI18n();
  const idFactory = createBrowserIdFactory();
  const createTarget = shallowRef<Target>();
  const settingsTarget = shallowRef<SettingsTarget>();
  const resizeTarget = shallowRef<ResizeTarget>();
  const styleDraft = shallowRef<{ style?: TableStyleDefinition }>();
  const pivotStyleDraft = shallowRef<{ style?: PivotTableStyleDefinition }>();
  const error = ref("");
  let confirming = false;
  let dialogId = 0;
  let disposed = false;
  const activeTable = computed(() => {
    void options.getRevision();
    return getTableAtAddress(options.getSheet(), options.getAddress());
  });
  const customStyles = computed(() => {
    void options.getRevision();
    return options.getWorkbook().tableStyles ?? [];
  });
  const defaultStyleId = computed(() => {
    void options.getRevision();
    return options.getWorkbook().defaultTableStyleId;
  });
  const customPivotStyles = computed(() => {
    void options.getRevision();
    return options.getWorkbook().pivotTableStyles ?? [];
  });
  const defaultPivotStyleId = computed(() => {
    void options.getRevision();
    return options.getWorkbook().defaultPivotTableStyleId;
  });
  const createInitial = computed<CreateTableDraft | undefined>(() => {
    const target = createTarget.value;
    const sheet = target && options.getWorkbook().sheets.get(target.sheetId);
    return sheet && target
      ? {
          range: formatRangeReference(sheet.name, target.range),
          mode: "table",
          headerRows: 1,
          hasHeaders: target.hasHeaders,
          filterButton: true,
        }
      : undefined;
  });
  const modalOpen = computed(() =>
    Boolean(
      createTarget.value ||
      settingsTarget.value ||
      resizeTarget.value ||
      styleDraft.value ||
      pivotStyleDraft.value,
    ),
  );

  function close(): void {
    createTarget.value = undefined;
    settingsTarget.value = undefined;
    resizeTarget.value = undefined;
    styleDraft.value = undefined;
    pivotStyleDraft.value = undefined;
    error.value = "";
    void nextTick(() => {
      if (!disposed && !modalOpen.value) options.focus();
    });
  }
  watch([options.getGeneration, options.getWorkbook], close, { flush: "sync" });
  onScopeDispose(() => {
    disposed = true;
    close();
  });

  function begin(): boolean {
    if (
      confirming ||
      disposed ||
      options.isBusy() ||
      options.getSheet().properties.protected ||
      !options.finishEditing() ||
      options.isBusy() ||
      options.getSheet().properties.protected
    )
      return false;
    error.value = "";
    return true;
  }
  function captureTarget(table?: SheetTable): DialogTarget {
    const sheet = options.getSheet();
    return {
      dialogId: ++dialogId,
      workbook: options.getWorkbook(),
      generation: options.getGeneration(),
      sheet,
      sheetId: sheet.id,
      table,
    };
  }
  function confirmTarget<T extends DialogTarget>(
    target: T | undefined,
    current: T | undefined,
    apply: (target: T) => void,
  ): void {
    if (!target || target !== current || confirming || disposed) return;
    if (
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      target.workbook.sheets.get(target.sheetId) !== target.sheet ||
      (target.table && !target.sheet.tables?.some((table) => table === target.table))
    ) {
      close();
      return;
    }
    if (options.isBusy() || target.sheet.properties.protected) {
      error.value = t("tables.failed");
      return;
    }
    confirming = true;
    try {
      apply(target);
    } finally {
      confirming = false;
    }
  }
  function execute(command: WorkbookCommand): boolean {
    try {
      if (options.execute(command)) return true;
      error.value = t("tables.failed");
      if (!modalOpen.value) void MessagePlugin.warning(error.value);
      return false;
    } catch (cause) {
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      error.value = t(
        command.type === "updateTable" &&
          (field === "headerRow" || field === "sheetId") &&
          [...options.getWorkbook().sheets.values()].some(
            (sheet) =>
              sheet.filter?.advanced || sheet.tables?.some((table) => table.filter?.advanced),
          )
          ? "tables.advancedFilterRowChange"
          : field === "name"
            ? "tables.invalidName"
            : field === "tableOverlap"
              ? "tables.overlap"
              : "tables.failed",
      );
      if (!modalOpen.value) void MessagePlugin.warning(error.value);
      return false;
    }
  }
  function resolveRange(source: string, sheetId: string): CellRange | undefined {
    const result = resolveRangeReference(options.getWorkbook(), source, sheetId);
    if (result?.sheetId === sheetId) return result.range;
    error.value = t("tables.invalidRange");
    return undefined;
  }
  function defaultStyle(): TableStyleDefinition {
    return (
      customStyles.value.find((style) => style.id === defaultStyleId.value) ??
      createBuiltinTableStyles().find((style) => style.id === defaultStyleId.value) ??
      createThemedTableStyles(options.getWorkbook().theme.accentColors[0]).find(
        (style) => style.id === defaultStyleId.value,
      ) ??
      createBuiltinTableStyles().find((style) => style.id === "table-medium-2")!
    );
  }
  function applyStyle(style: TableStyleDefinition): void {
    if (!begin()) return;
    const table = activeTable.value;
    if (table) {
      execute(
        createUpdateTableCommand(options.getSheet().id, table.id, {
          style,
          ...(hasHighlightedFirstColumn(style) ? { firstColumn: true } : {}),
        }),
      );
      void nextTick(options.focus);
      return;
    }
    openCreate(style, "applyStyle");
  }
  function openCreate(style: TableStyleDefinition, intent: Target["intent"]): void {
    const captured = captureTarget();
    const range = resolveDataRange(captured.sheet, options.getSelection());
    // Preserve the populated-range default; native numeric-header detection is not established.
    const hasHeaders = [...captured.sheet.cells].some(([key, cell]) => {
      if (!cell.content) return false;
      const [row, column] = key.split(":").map(Number) as [number, number];
      return (
        row >= range.start.row &&
        row <= range.end.row &&
        column >= range.start.column &&
        column <= range.end.column
      );
    });
    const target: Target = {
      ...captured,
      intent,
      range,
      hasHeaders,
      style,
      confirm: (draft) => confirmCreate(draft, target),
      cancel: () => {
        if (createTarget.value === target) close();
      },
    };
    createTarget.value = target;
  }
  function requestCreate(): void {
    if (!begin() || activeTable.value) return;
    openCreate(defaultStyle(), "insert");
  }
  function nextTableName(): string {
    const names = new Set([
      ...[...options.getWorkbook().sheets.values()].flatMap((sheet) =>
        (sheet.tables ?? []).map((table) => table.name.toLowerCase()),
      ),
      ...[...options.getWorkbook().definedNames.values()].map((entry) => entry.name.toLowerCase()),
    ]);
    let index = 1;
    while (names.has(`table${index}`)) index += 1;
    return `Table${index}`;
  }
  function confirmCreate(draft: CreateTableDraft, target = createTarget.value): void {
    confirmTarget(target, createTarget.value, (target) => {
      const range = resolveRange(draft.range, target.sheetId);
      if (!range) return;
      if (draft.mode === "styleOnly") {
        if (
          !Number.isInteger(draft.headerRows) ||
          draft.headerRows < 0 ||
          draft.headerRows > range.end.row - range.start.row + 1
        ) {
          error.value = t("tables.invalidHeaderRows");
          return;
        }
        if (
          execute(
            createApplyTableStyleToRangeCommand(
              target.sheetId,
              range,
              target.style,
              draft.headerRows,
            ),
          )
        )
          close();
        return;
      }
      const table: SheetTable = {
        id: idFactory("table"),
        name: nextTableName(),
        range,
        columns: [],
        style: target.style,
        headerRow: true,
        totalRow: false,
        firstColumn: hasHighlightedFirstColumn(target.style),
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: draft.filterButton,
        filter: {
          range: draft.hasHeaders
            ? range
            : { start: { ...range.start }, end: { ...range.end, row: range.end.row + 1 } },
          columns: [],
        },
      };
      if (
        execute(createCreateTableCommand(target.sheetId, table, { hasHeaders: draft.hasHeaders }))
      )
        close();
    });
  }
  function openSettings(): void {
    if (!begin()) return;
    const table = activeTable.value;
    if (!table) return;
    const target: SettingsTarget = {
      ...captureTarget(table),
      tableId: table.id,
      initial: {
        name: table.name,
        range: formatRangeReference(options.getSheet().name, table.range),
        headerRow: table.headerRow,
        totalRow: table.totalRow,
        firstColumn: table.firstColumn,
        lastColumn: table.lastColumn,
        bandedRows: table.bandedRows,
        bandedColumns: table.bandedColumns,
        filterButton: table.filterButton,
      },
      confirm: (draft) => confirmSettings(draft, target),
      convert: () => convertToRange(target),
      cancel: () => {
        if (settingsTarget.value === target) close();
      },
    };
    settingsTarget.value = target;
  }
  function confirmSettings(draft: TableSettingsDraft, target = settingsTarget.value): void {
    confirmTarget(target, settingsTarget.value, (target) => {
      const range = resolveRange(draft.range, target.sheetId);
      if (!range) return;
      const { range: _range, ...changes } = draft;
      if (
        execute(
          createUpdateTableCommand(target.sheetId, target.tableId, {
            ...changes,
            name: changes.name.trim(),
            range,
          }),
        )
      )
        close();
    });
  }
  function updateTable(changes: TableOptionsPatch | { name: string }): void {
    if (!begin()) return;
    const table = activeTable.value;
    if (!table) return;
    execute(createUpdateTableCommand(options.getSheet().id, table.id, changes));
  }
  function renameTable(name: string): void {
    updateTable({ name: name.trim() });
  }
  function openResize(): void {
    if (!begin()) return;
    const table = activeTable.value;
    if (!table) return;
    const target: ResizeTarget = {
      ...captureTarget(table),
      tableId: table.id,
      range: formatRangeReference(options.getSheet().name, table.range),
      confirm: (range) => confirmResize(range, target),
      cancel: () => {
        if (resizeTarget.value === target) close();
      },
    };
    resizeTarget.value = target;
  }
  function confirmResize(source: string, target = resizeTarget.value): void {
    confirmTarget(target, resizeTarget.value, (target) => {
      const range = resolveRange(source, target.sheetId);
      if (range && execute(createResizeTableCommand(target.sheetId, target.tableId, range)))
        close();
    });
  }
  function convertToRange(target = settingsTarget.value): void {
    if (target) {
      confirmTarget(target, settingsTarget.value, (target) => {
        if (execute(createRemoveTableCommand(target.sheetId, target.tableId))) close();
      });
      return;
    }
    if (settingsTarget.value || !begin()) return;
    const table = activeTable.value;
    if (table && execute(createRemoveTableCommand(options.getSheet().id, table.id))) close();
  }
  function clearStyle(): void {
    if (!begin() || !activeTable.value) return;
    execute(
      createUpdateTableCommand(options.getSheet().id, activeTable.value.id, {
        style: { id: "table-none", name: "None", category: "custom", elements: {} },
      }),
    );
    void nextTick(options.focus);
  }
  function openStyle(style?: TableStyleDefinition): void {
    if (begin()) styleDraft.value = { style };
  }
  function confirmStyle(value: { style: TableStyleDefinition; setAsDefault: boolean }): void {
    const style = value.style;
    const next = [...customStyles.value.filter((existing) => existing.id !== style.id), style];
    const defaultId = value.setAsDefault
      ? style.id
      : defaultStyleId.value === style.id
        ? undefined
        : defaultStyleId.value;
    if (execute(createSetWorkbookTableStylesCommand(next, defaultId))) close();
  }
  function deleteStyle(style: TableStyleDefinition): void {
    if (!begin()) return;
    const next = customStyles.value.filter((existing) => existing.id !== style.id);
    const defaultId = defaultStyleId.value === style.id ? undefined : defaultStyleId.value;
    if (execute(createSetWorkbookTableStylesCommand(next, defaultId))) void nextTick(options.focus);
  }
  function openPivotStyle(style?: PivotTableStyleDefinition): void {
    if (begin()) pivotStyleDraft.value = { style };
  }
  function confirmPivotStyle(value: {
    style: PivotTableStyleDefinition;
    setAsDefault: boolean;
  }): void {
    const style = value.style;
    const next = [...customPivotStyles.value.filter((existing) => existing.id !== style.id), style];
    const defaultId = value.setAsDefault
      ? style.id
      : defaultPivotStyleId.value === style.id
        ? undefined
        : defaultPivotStyleId.value;
    if (execute(createSetWorkbookPivotTableStylesCommand(next, defaultId))) close();
  }
  function deletePivotStyle(style: PivotTableStyleDefinition): void {
    if (!begin()) return;
    const next = customPivotStyles.value.filter((existing) => existing.id !== style.id);
    const defaultId =
      defaultPivotStyleId.value === style.id ? undefined : defaultPivotStyleId.value;
    if (execute(createSetWorkbookPivotTableStylesCommand(next, defaultId)))
      void nextTick(options.focus);
  }
  function expandTable(payload: { tableId: string; range: CellRange }): void {
    if (begin())
      execute(createResizeTableCommand(options.getSheet().id, payload.tableId, payload.range));
  }

  return {
    activeTable,
    customStyles,
    defaultStyleId,
    customPivotStyles,
    defaultPivotStyleId,
    createTarget,
    createInitial,
    settingsTarget,
    resizeTarget,
    styleDraft,
    pivotStyleDraft,
    error,
    modalOpen,
    applyStyle,
    requestCreate,
    confirmCreate,
    openSettings,
    confirmSettings,
    updateTable,
    renameTable,
    openResize,
    confirmResize,
    convertToRange,
    clearStyle,
    openStyle,
    confirmStyle,
    deleteStyle,
    openPivotStyle,
    confirmPivotStyle,
    deletePivotStyle,
    expandTable,
    close,
  };
}
