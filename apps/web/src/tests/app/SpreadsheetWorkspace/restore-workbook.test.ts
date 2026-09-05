import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbook } from "@idea10/core/workbook";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { createAppI18n } from "../../../shared/i18n";

type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;

let wrapper: ReturnType<typeof mount> | undefined;

function mountController(): Controller {
  let controller: Controller | undefined;
  wrapper = mount(
    defineComponent({
      setup() {
        controller = useSpreadsheetWorkspaceController({
          idFactory: createSequentialIdFactory(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) {
    throw new Error("Workspace controller did not initialize.");
  }
  return controller;
}

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe("spreadsheet workspace restore", () => {
  test("replaces document state and resets the outgoing session state", () => {
    const controller = mountController();
    const clearClipboard = vi.fn();
    const focusGrid = vi.fn();
    controller.setGridNavigator({
      clearClipboard,
      focusGrid,
      navigateToCell() {},
    } as never);
    controller.commitCell({ address: { row: 0, column: 0 }, input: "first" });
    controller.commitCell({ address: { row: 0, column: 1 }, input: "second" });
    controller.undo();
    controller.updateActiveSheetViewState(
      createSheetGridViewState({ scrollPosition: { x: 80, y: 160 } }),
    );
    controller.activateFormatPainter();
    controller.updateSearchQuery("missing");
    controller.findCell("forward");

    expect(controller.session.history.undoStack).toHaveLength(1);
    expect(controller.session.history.redoStack).toHaveLength(1);
    expect(controller.viewStates.size).toBe(1);
    expect(controller.formatPainterActive.value).toBe(true);
    expect(controller.workspaceStatusText.value).toBe("No matches");
    const previousWorkbookId = controller.session.workbook.id;
    const previousRevision = controller.workbookRevision.value;
    const replacement = createWorkbook({
      id: previousWorkbookId,
      sheetId: "restored-sheet",
      sheetName: "Restored",
    });
    controller.replaceWorkbook(replacement);

    expect(controller.session.workbook).toEqual(replacement);
    expect(controller.session.history.undoStack).toHaveLength(0);
    expect(controller.session.history.redoStack).toHaveLength(0);
    expect(controller.undo()).toBe(false);
    expect(controller.redo()).toBe(false);
    expect(clearClipboard).toHaveBeenCalledOnce();
    expect(controller.viewStates.size).toBe(0);
    expect(controller.activeSheetViewState.value).toBeUndefined();
    expect(controller.searchQuery.value).toBe("");
    expect(controller.formatPainterActive.value).toBe(false);
    expect(controller.workspaceStatusText.value).toBe("");
    expect(controller.workbookRevision.value).toBe(previousRevision + 1);
    expect(controller.workbookGeneration.value).toBe(1);
    expect(controller.activeSheet.value.id).toBe("restored-sheet");
    expect(focusGrid).toHaveBeenCalledOnce();
  });

  test("increments generation for same-ID replacements and forwards grid edit state", () => {
    const controller = mountController();
    const flushPendingEdit = vi.fn(() => false);
    const hasPendingEdit = vi.fn(() => true);
    controller.setGridNavigator({
      flushPendingEdit,
      hasPendingEdit,
      focusGrid() {},
      navigateToCell() {},
    } as never);

    expect(controller.flushPendingGridEdit()).toBe(false);
    expect(controller.hasPendingGridEdit()).toBe(true);
    expect(flushPendingEdit).toHaveBeenCalledOnce();
    expect(hasPendingEdit).toHaveBeenCalledOnce();

    const sameWorkbookId = controller.session.workbook.id;
    controller.replaceWorkbook(
      createWorkbook({ id: sameWorkbookId, sheetId: "same-id-restored-sheet" }),
    );

    expect(controller.session.workbook.id).toBe(sameWorkbookId);
    expect(controller.workbookGeneration.value).toBe(1);

    controller.setGridNavigator(null);
    expect(controller.flushPendingGridEdit()).toBe(true);
    expect(controller.hasPendingGridEdit()).toBe(false);
  });
});
