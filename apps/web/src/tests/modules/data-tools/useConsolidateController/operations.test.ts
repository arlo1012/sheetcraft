import { defineComponent, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createSheet, getActiveSheet, setCellValue } from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useConsolidateController } from "../../../../modules/data-tools/useConsolidateController";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

function fixture(execute = true) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const first = getActiveSheet(session.workbook);
  const second = createSheet("Other", "other");
  session.workbook.sheets.set(second.id, second);
  setCellValue(first, { row: 0, column: 0 }, 2);
  setCellValue(second, { row: 0, column: 0 }, 3);
  const generation = ref(0);
  let controller!: ReturnType<typeof useConsolidateController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useConsolidateController({
          getWorkbook: () => session.workbook,
          getSelection: () => ({
            range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          }),
          getGeneration: () => generation.value,
          isBusy: () => false,
          flush: () => true,
          execute: (command) => execute && executeWorkbookCommand(session, command),
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  return { session, first, controller };
}

describe("consolidate controller", () => {
  test("previews and consolidates cross-sheet references in one history action", () => {
    const f = fixture();
    f.controller.openConsolidate();
    f.controller.applyConsolidate({
      ...f.controller.consolidateDraft.value,
      sources: ["Sheet1!A1", "Other!A1"],
      destination: "Sheet1!C1",
    });
    expect(f.first.cells.get("0:2")?.content).toEqual({ kind: "literal", value: 5 });
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.controller.consolidateVisible.value).toBe(false);
  });

  test("keeps the dialog open when execution declines the command", () => {
    const f = fixture(false);
    f.controller.openConsolidate();
    f.controller.applyConsolidate({ ...f.controller.consolidateDraft.value, destination: "C1" });
    expect(f.controller.consolidateVisible.value).toBe(true);
    expect(f.controller.consolidateError.value).not.toBe("");
  });
});
