import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createWorkbook, getActiveSheet, getCellContent } from "@idea10/core/workbook";
import { useCellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import { createAppI18n } from "../../../shared/i18n";
import { useFormulaEditorController } from "../../../modules/formula-tools/useFormulaEditorController";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
});

function mountController(onCommit = vi.fn(() => true)) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  const revision = ref(0);
  const session = useCellEditSession({ onCommit });
  const focusFormulaBar = vi.fn();
  let controller: ReturnType<typeof useFormulaEditorController> | undefined;

  wrapper = mount(
    defineComponent({
      setup() {
        controller = useFormulaEditorController({
          getWorkbook: () => workbook,
          getRevision: () => revision.value,
          getAddress: () => ({ row: 0, column: 0 }),
          editSession: session,
          isBusy: () => false,
          focusFormulaBar,
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  if (!controller) throw new Error("Formula editor controller did not initialize.");
  return { controller, focusFormulaBar, onCommit, session, sheet, workbook };
}

describe("formula editor controller", () => {
  test("opens an existing draft without committing or replacing its owner", () => {
    const { controller, onCommit, session, sheet } = mountController();
    const owner = { sheetId: sheet.id, address: { row: 2, column: 3 } };
    session.begin({ ...owner, input: "=A1" }, { surface: "formula-bar", mode: "append" });
    session.setDraft("=A1+2");

    controller.open();

    expect(controller.visible.value).toBe(true);
    expect(controller.value.value).toBe("=A1+2");
    expect(session.state.owner).toEqual(owner);
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("cancels the draft without submitting it", () => {
    const { controller, focusFormulaBar, onCommit, session } = mountController();
    controller.open();
    controller.change("=1+2");

    controller.close();

    expect(onCommit).not.toHaveBeenCalled();
    expect(session.state.active).toBe(false);
    expect(controller.visible.value).toBe(false);
    expect(focusFormulaBar).not.toHaveBeenCalled();
  });

  test("restores an existing unfinished draft when the dialog is cancelled", () => {
    const { controller, onCommit, session, sheet } = mountController();
    session.begin(
      { sheetId: sheet.id, address: { row: 0, column: 0 }, input: "=1" },
      { surface: "formula-bar", mode: "append" },
    );
    session.setDraft("=1+");
    session.setSelection(3, 3);
    controller.open();
    controller.change("=SUM(1,2)");

    controller.close();

    expect(session.state.active).toBe(true);
    expect(session.state.draft).toBe("=1+");
    expect(session.state.selection.start).toBe(3);
    expect(onCommit).not.toHaveBeenCalled();
  });

  test("confirms through the edit session and preserves its target", () => {
    const { controller, onCommit, session, sheet } = mountController();
    controller.open();
    controller.change("=1+2");
    const owner = session.state.owner;

    controller.confirm();

    expect(onCommit).toHaveBeenCalledWith({
      ...owner,
      input: "=1+2",
      confirmPendingWarning: true,
    });
    expect(session.state.active).toBe(false);
    expect(controller.visible.value).toBe(false);
    expect(owner).toEqual({
      sheetId: sheet.id,
      address: { row: 0, column: 0 },
    });
  });

  test("keeps the dialog and draft open when the session commit is rejected", () => {
    const rejected = vi.fn(() => false);
    const { controller, session } = mountController(rejected);
    controller.open();
    controller.change("=1+2");
    const owner = session.state.owner;

    controller.confirm();

    expect(controller.visible.value).toBe(true);
    expect(controller.value.value).toBe("=1+2");
    expect(session.state.owner).toEqual(owner);
  });

  test("previews in a shadow workbook without committing the draft", async () => {
    vi.useFakeTimers();
    const { controller, onCommit, sheet } = mountController();
    controller.open();
    controller.change("=1+2");

    await vi.advanceTimersByTimeAsync(150);

    expect(controller.previewValue.value).toBe("3");
    expect(onCommit).not.toHaveBeenCalled();
    expect(getCellContent(sheet, { row: 0, column: 0 })).toBeNull();
  });

  test("does not confirm while IME composition is active", () => {
    const { controller, onCommit, session } = mountController();
    controller.open();
    controller.change("=1+2");
    controller.composing(true);

    controller.confirm();

    expect(onCommit).not.toHaveBeenCalled();
    expect(controller.visible.value).toBe(true);
    expect(session.state.composing).toBe(true);
  });
});
