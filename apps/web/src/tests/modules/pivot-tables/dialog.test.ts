import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import {
  createSheet,
  insertSheet,
  setCellContent,
  getCellContent,
  getCellValue,
} from "@idea10/core/workbook";
import type { PivotDraft } from "../../../modules/pivot-tables/usePivotActions";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function dialogFixture(disabled = false) {
  const f = fixture();
  f.actions.open();
  const initial = f.actions.editing.value!;
  const output = createSheet("Output", "output");
  insertSheet(f.workbook, output);
  const wrapper = mount(PivotTableDialog, {
    attachTo: document.body,
    props: {
      initial: { ...initial, referenceSheetId: output.id },
      workbook: f.workbook,
      revision: 0,
      disabled,
      error: false,
      suspended: false,
      selectReference: async () => undefined,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, initial };
}
function confirmButton() {
  return document
    .querySelector<HTMLButtonElement>(".pivot-create")!
    .closest(".t-dialog")!
    .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!;
}
describe("pivot creation dialog", () => {
  test("creates an existing-sheet empty report after a real overwrite-checkbox retry", async () => {
    const f = fixture();
    f.source.name = "Sheet14";
    f.source.cells.clear();
    for (let column = 1; column <= 11; column++) {
      setCellContent(f.source, { row: 2, column }, { kind: "literal", value: `Field ${column}` });
      for (let row = 3; row <= 13; row++)
        setCellContent(f.source, { row, column }, { kind: "literal", value: row * column });
    }
    setCellContent(
      f.source,
      { row: 18, column: 0 },
      { kind: "literal", value: "Occupied destination" },
    );
    f.actions.open();
    const draft = f.actions.editing.value!;
    const wrapper = mount(PivotTableDialog, {
      attachTo: document.body,
      props: {
        initial: { ...draft, source: "Sheet14!B3:L14", destination: "A19", newSheet: false },
        workbook: f.workbook,
        revision: 0,
        disabled: false,
        error: false,
        errorReason: f.actions.errorReason.value,
        suspended: false,
        selectReference: async () => undefined,
        onConfirm: (value: PivotDraft) => {
          f.actions.confirm(value);
          void wrapper.setProps({
            error: f.actions.error.value,
            errorReason: f.actions.errorReason.value,
          });
        },
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    await flushPromises();
    confirmButton().click();
    await flushPromises();
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.errorReason.value).toBe("overwrite");
    expect(f.source.pivotTables ?? []).toEqual([]);
    const editor = new DOMWrapper(document.querySelector(".pivot-create")!);
    expect(editor.get('[role="alert"]').text()).toContain("destination contains content");
    await editor.get('input[type="checkbox"]').setValue(true);
    confirmButton().click();
    await flushPromises();
    expect(wrapper.emitted("confirm")?.at(-1)?.[0]).toMatchObject({
      source: "Sheet14!B3:L14",
      destination: "A19",
      overwrite: true,
      newSheet: false,
    });
    expect(f.actions.error.value).toBe(false);
    expect(f.actions.editing.value).toBeUndefined();
    expect(f.source.pivotTables).toHaveLength(1);
    expect(f.source.pivotTables![0]).toMatchObject({
      anchor: { row: 18, column: 0 },
      source: { start: { row: 2, column: 1 }, end: { row: 13, column: 11 } },
      outputRange: null,
    });
    expect(getCellContent(f.source, { row: 18, column: 0 })).toBeNull();
    expect(
      f.actions.update({
        ...f.source.pivotTables![0]!,
        rowFields: [0],
        values: [{ field: 1, aggregate: "sum", caption: "Field 2" }],
      }),
    ).toBe(true);
    expect(getCellValue(f.source, { row: 19, column: 1 })).toBe(6);
    expect(f.onError).not.toHaveBeenCalled();
  });
  test("accepts an explicit cross-sheet source and confirms an empty configuration", async () => {
    const { wrapper, initial } = dialogFixture();
    await flushPromises();
    expect(confirmButton().disabled).toBe(false);
    expect(document.querySelector(".pivot-editor__preview")).toBeNull();
    confirmButton().click();
    await flushPromises();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      source: initial.source,
      newSheet: true,
      table: { values: [], rowFields: [], columnFields: [] },
    });
  });
  test("switches to an existing worksheet using the real destination radio", async () => {
    const { wrapper } = dialogFixture();
    await flushPromises();
    const editor = new DOMWrapper(document.querySelector(".pivot-create")!);
    await new DOMWrapper(
      editor.get('input[type="radio"][value="existing"]').element.closest("label")!,
    ).trigger("click");
    await flushPromises();
    expect(editor.findAll(".t-input__inner")).toHaveLength(2);
    confirmButton().click();
    await flushPromises();
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({ newSheet: false, mode: "create" });
  });
  test("disables confirmation when the caller disables editing", async () => {
    dialogFixture(true);
    await flushPromises();
    expect(confirmButton().disabled).toBe(true);
  });
});
