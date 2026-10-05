import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@idea10/core/workbook";
import FormControlContent from "../../../modules/form-controls/components/FormControlContent.vue";
import { controlDrawing } from "./fixture";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture(type: "checkbox" | "combo") {
  const sheet = getActiveSheet(createWorkbook({ id: "controls", sheetId: "sheet" }));
  const wrapper = mount(FormControlContent, {
    attachTo: document.body,
    props: {
      drawing: controlDrawing(type),
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision: 0,
    },
  });
  mounted.push(wrapper);
  return { wrapper, sheet };
}
describe("form control content", () => {
  test("emits checked state from the real Checkbox input", async () => {
    const { wrapper } = fixture("checkbox");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted("change")).toEqual([[true]]);
  });
  test("emits a one-based index from the real Select popup", async () => {
    const { wrapper } = fixture("combo");
    await wrapper.get(".t-input__inner").trigger("keydown", { code: "ArrowDown" });
    await expect
      .poll(() =>
        [...document.querySelectorAll<HTMLElement>(".t-select-option")].map((item) =>
          item.textContent?.trim(),
        ),
      )
      .toContain("Two");
    const option = [...document.querySelectorAll<HTMLElement>(".t-select-option")].find(
      (item) => item.textContent?.trim() === "Two",
    );
    expect(option).toBeDefined();
    option!.click();
    await flushPromises();
    expect(wrapper.emitted("change")).toEqual([[2]]);
  });
  test("disables the real Checkbox when its linked cell is protected", async () => {
    const { wrapper, sheet } = fixture("checkbox");
    sheet.properties.protected = true;
    await wrapper.setProps({ revision: 1 });
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).disabled).toBe(true);
  });
});
