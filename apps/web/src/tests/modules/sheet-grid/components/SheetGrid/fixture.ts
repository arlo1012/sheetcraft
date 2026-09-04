import { DOMWrapper, mount } from "@vue/test-utils";
import { reactive } from "vue";
import type { GridPastePayload } from "../../../../../modules/sheet-grid/useGridClipboard";
import {
  getCellMatrixSize,
  getCellRangeContents,
  translateCellContentForCopy,
} from "@idea10/core/clipboard";
import {
  createClearCellRangeCommand,
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveCellRangeCommand,
  createPasteCellContentsCommand,
  createResizeSheetDimensionCommand,
  createSetCellContentCommand,
} from "@idea10/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "@idea10/core/history";
import { parseCellContent } from "@idea10/core/input";
import type { CellContent } from "@idea10/core/formula";
import { getActiveSheet, type CellRange, type SheetDimensionAxis } from "@idea10/core/workbook";
import SheetGrid from "../../../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { createBrowserIdFactory } from "../../../../../shared/runtime/browser-id-factory";

export type SheetGridFixtureOptions = {
  attachTo?: HTMLElement;
  initialRowCount?: number;
  initialColumnCount?: number;
  rowExpansionStep?: number;
  columnExpansionStep?: number;
  rowExpansionTail?: number;
  columnExpansionTail?: number;
};

export function mountSheetGrid(options?: SheetGridFixtureOptions) {
  const session = reactive(
    createWorkbookSession({ idFactory: createBrowserIdFactory() }),
  ) as WorkbookSession;
  const sheet = getActiveSheet(session.workbook);
  const wrapper = mount(SheetGrid, {
    attachTo: options?.attachTo,
    global: {
      plugins: [createAppI18n("en-US")],
    },
    props: {
      sheet,
      initialRowCount: options?.initialRowCount ?? 100,
      initialColumnCount: options?.initialColumnCount ?? 50,
      rowExpansionStep: options?.rowExpansionStep ?? 25,
      columnExpansionStep: options?.columnExpansionStep ?? 10,
      rowExpansionTail: options?.rowExpansionTail ?? 5,
      columnExpansionTail: options?.columnExpansionTail ?? 2,
      onClearCells(range: CellRange) {
        executeWorkbookCommand(session, createClearCellRangeCommand(sheet.id, range));
      },
      onCommitCell(payload) {
        executeWorkbookCommand(
          session,
          createSetCellContentCommand(sheet.id, payload.address, parseCellContent(payload.input)),
        );
      },
      onPasteCells(payload: GridPastePayload) {
        if (payload.kind === "all" && payload.moveSource) {
          executeWorkbookCommand(
            session,
            createMoveCellRangeCommand(sheet.id, payload.moveSource, payload.plan.anchor),
          );
          return;
        }
        const contents = getPasteContents(sheet, payload);
        executeWorkbookCommand(
          session,
          createPasteCellContentsCommand(
            sheet.id,
            payload.plan.anchor,
            contents,
            payload.kind === "all"
              ? { styles: payload.styles }
              : payload.kind === "formats"
                ? { styles: payload.styles }
                : undefined,
          ),
        );
      },
      onResizeDimension(payload: { axis: SheetDimensionAxis; index: number; size: number }) {
        executeWorkbookCommand(
          session,
          createResizeSheetDimensionCommand(sheet.id, payload.axis, payload.index, payload.size),
        );
      },
      onInsertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }) {
        executeWorkbookCommand(
          session,
          createInsertSheetAxisCommand(sheet.id, payload.axis, payload.index, payload.count),
        );
      },
      onDeleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }) {
        executeWorkbookCommand(
          session,
          createDeleteSheetAxisCommand(sheet.id, payload.axis, payload.index, payload.count),
        );
      },
      onUndo() {
        undoWorkbookCommand(session);
      },
      onRedo() {
        redoWorkbookCommand(session);
      },
    },
  });

  return { session, sheet, wrapper };
}

function getPasteContents(
  sheet: ReturnType<typeof getActiveSheet>,
  payload: GridPastePayload,
): Array<Array<CellContent | null>> {
  if (payload.kind === "formats") {
    return getCellRangeContents(sheet, payload.plan.range);
  }
  if (payload.kind === "values") {
    return toLiteralContents(payload.plan.values);
  }
  if (!payload.contents || !payload.sourceRange) {
    return toLiteralContents(payload.plan.values);
  }

  const sourceSize = getCellMatrixSize(payload.contents);
  const targetSize = getCellMatrixSize(payload.plan.values);
  return Array.from({ length: targetSize.rowCount }, (_, row) =>
    Array.from({ length: targetSize.columnCount }, (_, column) => {
      const sourceRow = row % sourceSize.rowCount;
      const sourceColumn = column % sourceSize.columnCount;
      const content = payload.contents?.[sourceRow]?.[sourceColumn] ?? null;
      if (!content) return null;
      return translateCellContentForCopy(
        content,
        {
          row: payload.sourceRange!.start.row + sourceRow,
          column: payload.sourceRange!.start.column + sourceColumn,
        },
        { row: payload.plan.anchor.row + row, column: payload.plan.anchor.column + column },
      );
    }),
  );
}

function toLiteralContents(
  values: readonly (readonly (string | number | boolean | null)[])[],
): Array<Array<CellContent | null>> {
  return values.map((row) =>
    row.map((value) =>
      value === null ? null : ({ kind: "literal", value } satisfies CellContent),
    ),
  );
}

export function getFloatingMenu() {
  return new DOMWrapper(document.body).get('ul[role="menu"]');
}

export function hasFloatingMenu(): boolean {
  return document.body.querySelector('ul[role="menu"]') !== null;
}

export function activeCell(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
): string | undefined {
  return wrapper.get("[data-active-cell]").attributes("data-active-cell");
}
