import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Input as TInput } from "tdesign-vue-next/es/input";
import FormulaEditorDialog from "../../../../modules/formula-tools/components/FormulaEditorDialog.vue";
import FormulaFunctionBrowser from "../../../../modules/formula-tools/components/FormulaFunctionBrowser.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountEditor(value = "=SUM(A1,") {
  const wrapper = mount(FormulaEditorDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      value,
      targetLabel: "Sheet1!A1",
      previewValue: "3",
      editSessionId: "editing",
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("FormulaEditorDialog", () => {
  test("uses the controlled input and confirms only with Ctrl+Enter", async () => {
    const wrapper = mountEditor();
    await nextTick();
    const input = document.querySelector<HTMLTextAreaElement>("[data-formula-editor-input]");
    expect(input).toBeTruthy();
    await wrapper.get("textarea").setValue("=SUM(A1,A2)");
    expect(wrapper.emitted("change")).toEqual([["=SUM(A1,A2)"]]);

    await wrapper.get("textarea").trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("confirm")).toBeUndefined();
    await wrapper.get("textarea").trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("confirm")).toEqual([[]]);
  });

  test("opens the existing browser and inserts a function through the controlled change event", async () => {
    const wrapper = mountEditor("");
    await nextTick();
    await wrapper.get("[role='button'][aria-label='Choose function']").trigger("click");
    const browser = wrapper.findComponent(FormulaFunctionBrowser);
    expect(browser.props("visible")).toBe(true);
    browser.vm.$emit("insertFunction", "SUM");
    await nextTick();
    expect(wrapper.emitted("change")).toEqual([["=SUM()"]]);
  });

  test("starts a fresh formula from a plain value and preserves an existing non-operand formula", async () => {
    const valueWrapper = mountEditor("5");
    await nextTick();
    valueWrapper.findComponent(FormulaFunctionBrowser).vm.$emit("insertFunction", "SUM");
    await nextTick();
    expect(valueWrapper.emitted("change")).toEqual([["=SUM()"]]);

    const formulaWrapper = mountEditor("=SUM(A1)");
    await nextTick();
    formulaWrapper.findComponent(FormulaFunctionBrowser).vm.$emit("insertFunction", "IF");
    await nextTick();
    expect(formulaWrapper.emitted("change")).toBeUndefined();
    expect(formulaWrapper.text()).toContain("Place the cursor where a function can be inserted.");
  });

  test("publishes the composition value before ending composition", async () => {
    const wrapper = mountEditor("=");
    await nextTick();
    const input = wrapper.get("textarea");
    await input.trigger("compositionstart");
    (input.element as HTMLTextAreaElement).value = "=\u6c42\u548c";
    await input.trigger("compositionend");
    expect(wrapper.emitted("change")?.at(-1)).toEqual(["=\u6c42\u548c"]);
    expect(wrapper.emitted("composing")).toEqual([[true], [false]]);
  });

  test("renders editable root function arguments from metadata", async () => {
    const wrapper = mountEditor("=IF(A1,1)");
    await nextTick();
    const argumentsInputs = wrapper.findAll("[data-formula-editor-argument]");
    expect(argumentsInputs).toHaveLength(3);
    const optionalInput = wrapper
      .findAllComponents(TInput)
      .find((component) => component.attributes("data-formula-editor-argument") === "2");
    optionalInput?.vm.$emit("change", "0");
    await nextTick();
    expect(wrapper.emitted("change")).toEqual([["=IF(A1,1,0)"]]);
  });

  test("keeps the complete root function details visible at the formula end", async () => {
    const wrapper = mountEditor("=SUM(1,2)");
    await nextTick();
    expect(wrapper.text()).toContain("SUM(…)");
    const argumentsInputs = wrapper.findAll("[data-formula-editor-argument]");
    expect(argumentsInputs).toHaveLength(2);
    const nativeInputs = document.querySelectorAll<HTMLInputElement>(
      "[data-formula-editor-argument] input",
    );
    expect(nativeInputs[0]?.getAttribute("aria-label")).toBe("Value 1");
    expect(nativeInputs[1]?.getAttribute("aria-label")).toBe("Value 2");
  });
});
