import { defineComponent, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { createSheet, getActiveSheet, setCellValue } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useLookupFillController } from "../../../../modules/data-tools/useLookupFillController";
const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture(execute = (_command: Parameters<typeof executeWorkbookCommand>[1]) => true) {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() })),
    sheet = getActiveSheet(session.workbook),
    other = createSheet("Other", "other");
  session.workbook.sheets.set(other.id, other);
  const generation = ref(0),
    selection = { range: { start: { row: 0, column: 3 }, end: { row: 1, column: 4 } } };
  let controller!: ReturnType<typeof useLookupFillController>;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useLookupFillController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getGeneration: () => generation.value,
          isBusy: () => false,
          flush: () => true,
          execute,
          focusSheet: () => {},
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  wrappers.push(wrapper);
  ["id", 1].forEach((value, row) => setCellValue(sheet, { row, column: 0 }, value));
  ["value", 9].forEach((value, row) => setCellValue(sheet, { row, column: 1 }, value));
  ["id", 1].forEach((value, row) => setCellValue(sheet, { row, column: 3 }, value));
  return { session, sheet, other, generation, controller };
}
const draft = (controller: ReturnType<typeof useLookupFillController>) => ({
  ...controller.lookupFillDraft.value,
  sourceRange: "Sheet1!A1:B2",
  targetRange: "Sheet1!D1:E2",
  hasHeader: true,
  matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
  fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
});
describe("lookup fill controller", () => {
  test("keeps the dialog open when execution fails or preview has no writes", async () => {
    const f = fixture(() => false);
    f.controller.openLookupFill();
    f.controller.applyLookupFill(draft(f.controller));
    await nextTick();
    expect(f.controller.lookupFillVisible.value).toBe(true);
    expect(f.controller.lookupFillError.value).toContain("could not");
    setCellValue(f.sheet, { row: 1, column: 4 }, "existing");
    f.controller.updateLookupFillDraft(draft(f.controller));
    f.controller.applyLookupFill(f.controller.lookupFillDraft.value);
    expect(f.controller.lookupFillVisible.value).toBe(true);
    expect(f.controller.lookupFillError.value).toContain("No cells");
  });
  test("rejects a stale cross-sheet dialog", () => {
    const f = fixture((command) => executeWorkbookCommand(f.session, command));
    f.controller.openLookupFill();
    const value = { ...draft(f.controller), sourceRange: "Other!A1:B2" };
    f.generation.value++;
    f.controller.applyLookupFill(value);
    expect(f.controller.lookupFillVisible.value).toBe(true);
    expect(f.controller.lookupFillError.value).toContain("changed");
  });
  test("reports a preview analysis failure instead of treating it as no changes", () => {
    const f = fixture();
    f.controller.openLookupFill();
    f.controller.updateLookupFillDraft({
      ...draft(f.controller),
      matchFields: [{ sourceColumn: 2, targetColumn: 0 }],
    });
    expect(f.controller.lookupFillPreview.value).toBeUndefined();
    expect(f.controller.lookupFillError.value).toContain("valid match");
  });
});
