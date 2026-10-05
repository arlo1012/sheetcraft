import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet, insertSheet } from "@idea10/core/workbook";
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
