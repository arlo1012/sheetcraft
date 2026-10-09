import { computed, nextTick, ref, shallowRef, watch } from "vue";
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
} from "@idea10/core/commands";
import { resolveDataRange } from "@idea10/core/data-range";
import { WorkbookDomainError } from "@idea10/core/errors";
import {
  createBuiltinTableStyles,
  createThemedTableStyles,
  getTableAtAddress,
  hasHighlightedFirstColumn,
  type TableStyleDefinition,
} from "@idea10/core/table-styles";
import type { PivotTableStyleDefinition } from "@idea10/core/pivot-table-styles";
import type { CellAddress, CellRange, Sheet, SheetTable, Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { CreateTableDraft, TableOptionsPatch, TableSettingsDraft } from "./table-ui-types";

type Target = { sheetId: string; range: CellRange; style: TableStyleDefinition };
type SettingsTarget = { sheetId: string; tableId: string; initial: TableSettingsDraft };
type ResizeTarget = { sheetId: string; tableId: string; range: string };

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
          hasHeaders: true,
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
    void nextTick(options.focus);
  }
  watch(options.getGeneration, close);

  function begin(): boolean {
    error.value = "";
    return !options.isBusy() && options.finishEditing();
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
        field === "name"
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
    createTarget.value = {
      sheetId: options.getSheet().id,
      range: resolveDataRange(options.getSheet(), options.getSelection()),
      style,
    };
  }
  function requestCreate(): void {
    applyStyle(defaultStyle());
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
  function confirmCreate(draft: CreateTableDraft): void {
    const target = createTarget.value!;
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
      filter: { range, columns: [] },
    };
    if (execute(createCreateTableCommand(target.sheetId, table, { hasHeaders: draft.hasHeaders })))
      close();
  }
  function openSettings(): void {
    if (!begin()) return;
    const table = activeTable.value;
    if (!table) return;
    settingsTarget.value = {
      sheetId: options.getSheet().id,
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
    };
  }
  function confirmSettings(draft: TableSettingsDraft): void {
    const target = settingsTarget.value!;
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
    resizeTarget.value = {
      sheetId: options.getSheet().id,
      tableId: table.id,
      range: formatRangeReference(options.getSheet().name, table.range),
    };
  }
  function confirmResize(source: string): void {
    const target = resizeTarget.value!;
    const range = resolveRange(source, target.sheetId);
    if (range && execute(createResizeTableCommand(target.sheetId, target.tableId, range))) close();
  }
  function convertToRange(): void {
    const target = settingsTarget.value;
    if (!target && !begin()) return;
    const tableId = target?.tableId ?? activeTable.value?.id;
    if (
      tableId &&
      execute(createRemoveTableCommand(target?.sheetId ?? options.getSheet().id, tableId))
    )
      close();
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
