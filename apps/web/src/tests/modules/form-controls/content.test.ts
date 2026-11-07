// 未执行：按用户约定仅编写回归，待插入与打印功能完成后统一运行。
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import { Select } from "tdesign-vue-next/es/select";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Slider } from "tdesign-vue-next/es/slider";
import { Radio } from "tdesign-vue-next/es/radio";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import FormControlContent from "../../../modules/form-controls/components/FormControlContent.vue";
import { controlDrawing } from "./fixture";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture(type: FormControlType) {
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
  test("an unlinked checkbox stays interactive and renders its saved local value", async () => {
    const { wrapper } = fixture("checkbox");
    const drawing = controlDrawing("checkbox");
    drawing.control = { ...drawing.control, linkedCell: null, localValue: true };
    await wrapper.setProps({ drawing });
    const input = wrapper.get('input[type="checkbox"]').element as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(false);
    await wrapper.get('input[type="checkbox"]').setValue(false);
    expect(wrapper.emitted("change")).toEqual([[false]]);
  });

  test.each(["combo", "list", "spinner", "scrollbar", "radio"] as const)(
    "renders the unlinked %s value from local state",
    async (type) => {
      const { wrapper } = fixture(type);
      const drawing = controlDrawing(type);
      drawing.control = {
        ...drawing.control,
        linkedCell: null,
        localValue: type === "radio" ? 3 : 2,
      };
      await wrapper.setProps({ drawing });
      if (type === "combo") {
        expect(wrapper.getComponent(Select).props("value")).toBe(2);
        expect(wrapper.getComponent(Select).props("disabled")).toBe(false);
      } else if (type === "spinner") {
        expect(wrapper.getComponent(InputNumber).props("modelValue")).toBe(2);
        expect(wrapper.getComponent(InputNumber).props("disabled")).toBe(false);
      } else if (type === "scrollbar") {
        expect(wrapper.getComponent(Slider).props("value")).toBe(2);
        expect(wrapper.getComponent(Slider).props("disabled")).toBe(false);
      } else if (type === "radio") {
        expect(wrapper.getComponent(Radio).props("checked")).toBe(true);
        expect(wrapper.getComponent(Radio).props("disabled")).toBe(false);
      } else {
        const select = wrapper.get("select").element as HTMLSelectElement;
        expect(select.value).toBe("2");
        expect(select.disabled).toBe(false);
      }
    },
  );

  test("disables the real Checkbox when its linked cell is protected", async () => {
    const { wrapper, sheet } = fixture("checkbox");
    sheet.properties.protected = true;
    await wrapper.setProps({ revision: 1 });
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).disabled).toBe(true);
  });
});
