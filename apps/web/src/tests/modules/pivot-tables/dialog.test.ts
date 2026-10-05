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
function dialogFixture() {
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
      disabled: false,
      error: false,
      suspended: false,
      selectReference: async () => undefined,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, initial };
}
describe("pivot editor dialog", () => {
  test("resolves explicit cross-sheet sources for a real sample preview", async () => {
    const { initial } = dialogFixture();
    await flushPromises();
    const preview = document.querySelector(".pivot-editor__preview")!;
    expect(preview.textContent).toContain("East");
    expect(preview.textContent).toContain("30");
    expect(preview.textContent).toContain("Grand Total");
    expect(preview.textContent).toContain("70");
    expect(initial.table.values).toHaveLength(1);
  });
  test("adds value fields and changes aggregation through real controls", async () => {
    const { wrapper, initial } = dialogFixture();
    await flushPromises();
    const editor = new DOMWrapper(document.querySelector(".pivot-editor")!);
    const add = editor.findAll("button").find((button) => button.text() === "Add value field")!;
    await add.trigger("click");
    expect(editor.findAll(".pivot-editor__value")).toHaveLength(2);
    const firstValue = editor.findAll(".pivot-editor__value")[0]!;
    const selects = firstValue.findAll(".t-input__inner");
    await selects[1]!.trigger("keydown", { code: "ArrowDown" });
    await expect
      .poll(() =>
        [...document.querySelectorAll<HTMLElement>(".t-select-option")].map((item) =>
          item.textContent?.trim(),
        ),
      )
      .toContain("Count");
    const option = [...document.querySelectorAll<HTMLElement>(".t-select-option")].find(
      (item) => item.textContent?.trim() === "Count",
    )!;
    await new DOMWrapper(option).trigger("click");
    await flushPromises();
    const dialog = editor.element.closest(".t-dialog")!;
    await new DOMWrapper(
      dialog.querySelector(".t-dialog__footer .t-button--theme-primary")!,
    ).trigger("click");
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      table: { values: [{ aggregate: "count" }, { aggregate: "sum" }] },
    });
    expect(initial.table.values).toHaveLength(1);
    expect(initial.table.values[0]!.aggregate).toBe("sum");
  });
});
