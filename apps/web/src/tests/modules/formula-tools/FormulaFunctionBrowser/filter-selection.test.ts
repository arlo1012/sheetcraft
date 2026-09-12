import { DOMWrapper, mount } from "@vue/test-utils";
import { expect, test } from "vitest";
import FormulaFunctionBrowser from "../../../../modules/formula-tools/components/FormulaFunctionBrowser.vue";
import { createAppI18n } from "../../../../shared/i18n";

test("filters within a category, updates the details, and inserts on confirmation", async () => {
  const wrapper = mount(FormulaFunctionBrowser, {
    attachTo: document.body,
    props: { visible: true },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    const body = new DOMWrapper(document.body);
    await body.get('[data-formula-browser-category="Text"]').trigger("click");
    expect(body.find('[data-formula-browser-result="SUM"]').exists()).toBe(false);
    expect(body.find('[data-formula-browser-result="LEN"]').exists()).toBe(true);
    await body.get(".formula-function-browser input").setValue("LOWER(");
    expect(body.findAll("[data-formula-browser-result]")).toHaveLength(1);
    const result = body.get('[data-formula-browser-result="LOWER"]');
    await result.trigger("click");
    expect(body.get(".formula-function-browser__signature").text()).toMatch(/^LOWER\(/);
    expect(wrapper.emitted("insertFunction")).toBeUndefined();
    await result.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("insertFunction")).toEqual([["LOWER"]]);
  } finally {
    wrapper.unmount();
    document.body.innerHTML = "";
  }
});
