import type { ComputedRef, Ref } from "vue";
import {
  createAddSheetCommand,
  createDeleteSheetAxisCommand,
  createDeleteSheetCommand,
  createDuplicateSheetCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createMoveSheetCommand,
  createRenameSheetCommand,
  createResizeSheetDimensionCommand,
  createSetSheetPropertiesCommand,
  type WorkbookCommand,
  type WorkbookOperation,
} from "@sheetcraft/core/commands";
import type { WorkbookSession } from "@sheetcraft/core/history";
import {
  setActiveSheet,
  type Sheet,
  type SheetDimensionAxis,
  type SheetProperties,
} from "@sheetcraft/core/workbook";
import type { AxisMovePayload } from "../../modules/sheet-grid/composables/useAxisMoveDrag";
import type { MessageKey, MessageParams } from "../../shared/i18n";
import type { TypedEventBus } from "../../shared/runtime/typed-event-bus";
import type { WorkspaceEvents } from "../../shared/runtime/workspace-runtime";

type FeedbackState = {
  key: MessageKey;
  params?: MessageParams;
};

type WorkspaceControllerSheetsOptions = {
  session: WorkbookSession;
  activeSheet: ComputedRef<Sheet>;
  sheets: ComputedRef<Sheet[]>;
  workbookVersion: Ref<number>;
  events?: TypedEventBus<WorkspaceEvents>;
  execute: (command: WorkbookCommand, operation?: WorkbookOperation) => boolean;
  executeFeature: (
    createCommand: () => WorkbookCommand,
    operation: WorkbookOperation,
    unavailableKey: MessageKey,
  ) => boolean;
  cancelFormatPainter: () => void;
  showWorkspaceStatus: (status: FeedbackState) => void;
  clearWorkspaceStatus: () => void;
};

/** Owns worksheet lifecycle (add/duplicate/rename/delete/move/properties/select) and row/column axis structure commands. */
export function useWorkspaceControllerSheets(options: WorkspaceControllerSheetsOptions) {
  const { session, activeSheet, sheets, workbookVersion } = options;

  function resizeDimension(payload: {
    axis: SheetDimensionAxis;
    index: number;
    size: number;
  }): void {
    options.execute(
      createResizeSheetDimensionCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.size,
      ),
      "dimensions.resize",
    );
  }

  function insertAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
    options.execute(
      createInsertSheetAxisCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.count,
      ),
      "structure.insert",
    );
  }

  function deleteAxis(payload: { axis: SheetDimensionAxis; index: number; count: number }): void {
    options.execute(
      createDeleteSheetAxisCommand(
        activeSheet.value.id,
        payload.axis,
        payload.index,
        payload.count,
      ),
      "structure.delete",
    );
  }

  function moveAxis(payload: AxisMovePayload): boolean {
    return options.executeFeature(
      () =>
        createMoveSheetAxisCommand(
          activeSheet.value.id,
          payload.axis,
          payload.index,
          payload.count,
          payload.toIndex,
        ),
      "structure.move",
      "grid.axisMoveUnavailable",
    );
  }

  function selectSheet(sheetId: string): void {
    const previousSheetId = session.workbook.activeSheetId;
    if (setActiveSheet(session.workbook, sheetId)) {
      workbookVersion.value += 1;
      options.events?.emit("sheet:switched", { previousSheetId, sheetId });
    }
    options.clearWorkspaceStatus();
  }

  function updateSheetProperties(payload: {
    sheetId: string;
    patch: Partial<SheetProperties>;
  }): void {
    if (!session.workbook.sheets.has(payload.sheetId)) return;
    options.execute(
      createSetSheetPropertiesCommand(session.workbook, payload.sheetId, payload.patch),
    );
    if (activeSheet.value.properties.protected) options.cancelFormatPainter();
    options.clearWorkspaceStatus();
  }

  function restoreSheet(sheetId: string): void {
    updateSheetProperties({ sheetId, patch: { hidden: false } });
    selectSheet(sheetId);
  }

  function addSheet(): void {
    options.execute(
      createAddSheetCommand(session.workbook, { idFactory: session.idFactory }),
      "sheets.add",
    );
    options.clearWorkspaceStatus();
  }

  function duplicateSheet(sheetId: string): void {
    const command = createDuplicateSheetCommand(session.workbook, sheetId, {
      idFactory: session.idFactory,
    });
    if (options.execute(command, "sheets.add")) {
      options.showWorkspaceStatus({
        key: "workspace.sheetDuplicated",
        params: { name: command.sheet.name },
      });
      return;
    }
    options.clearWorkspaceStatus();
  }

  function renameSheet(payload: { sheetId: string; name: string }): void {
    const normalizedName = payload.name.trim();
    if (!normalizedName) {
      options.showWorkspaceStatus({ key: "workspace.sheetNameEmpty" });
      return;
    }

    const duplicate = sheets.value.some(
      (sheet) =>
        sheet.id !== payload.sheetId && sheet.name.toLowerCase() === normalizedName.toLowerCase(),
    );
    if (duplicate) {
      options.showWorkspaceStatus({
        key: "workspace.sheetNameDuplicate",
        params: { name: normalizedName },
      });
      return;
    }

    try {
      options.execute(createRenameSheetCommand(payload.sheetId, payload.name), "sheets.rename");
      options.clearWorkspaceStatus();
    } catch {
      options.showWorkspaceStatus({ key: "workspace.renameFailed" });
    }
  }

  function deleteSheet(sheetId: string): void {
    options.execute(createDeleteSheetCommand(session.workbook, sheetId), "sheets.delete");
    options.clearWorkspaceStatus();
  }

  function moveSheet(payload: { sheetId: string; toIndex: number }): void {
    const sheet = session.workbook.sheets.get(payload.sheetId);
    if (!sheet) {
      return;
    }
    if (
      options.execute(createMoveSheetCommand(session.workbook, payload.sheetId, payload.toIndex))
    ) {
      options.showWorkspaceStatus({
        key: "workspace.sheetMoved",
        params: { name: sheet.name, position: payload.toIndex + 1 },
      });
      return;
    }
    options.clearWorkspaceStatus();
  }

  return {
    resizeDimension,
    insertAxis,
    deleteAxis,
    moveAxis,
    selectSheet,
    updateSheetProperties,
    restoreSheet,
    addSheet,
    duplicateSheet,
    renameSheet,
    deleteSheet,
    moveSheet,
  };
}
