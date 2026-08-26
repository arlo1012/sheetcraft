import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createSetCellValueCommand } from "../../../../../modules/workbook/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
  type WorkbookSession,
} from "../../../../../modules/workbook/history";
import { parseCellInput } from "../../../../../modules/workbook/input";
import { getActiveSheet } from "../../../../../modules/workbook/workbook";
import SheetGrid from "../../../../../modules/sheet-grid/components/SheetGrid.vue";

export type SheetGridFixtureOptions = {
  initialRowCount?: number;
  initialColumnCount?: number;
  rowExpansionStep?: number;
  columnExpansionStep?: number;
  rowExpansionTail?: number;
  columnExpansionTail?: number;
};

export function mountSheetGrid(options?: SheetGridFixtureOptions) {
  const session = reactive(createWorkbookSession()) as WorkbookSession;
  const sheet = getActiveSheet(session.workbook);
  const wrapper = mount(SheetGrid, {
    props: {
      sheet,
      initialRowCount: options?.initialRowCount ?? 100,
      initialColumnCount: options?.initialColumnCount ?? 50,
      rowExpansionStep: options?.rowExpansionStep ?? 25,
      columnExpansionStep: options?.columnExpansionStep ?? 10,
      rowExpansionTail: options?.rowExpansionTail ?? 5,
      columnExpansionTail: options?.columnExpansionTail ?? 2,
      onCommitCell(payload) {
        executeWorkbookCommand(
          session,
          createSetCellValueCommand(sheet.id, payload.address, parseCellInput(payload.input)),
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

export function activeCell(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
): string | undefined {
  return wrapper.get("[data-active-cell]").attributes("data-active-cell");
}
