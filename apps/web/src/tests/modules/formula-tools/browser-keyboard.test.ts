import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import FormulaFunctionBrowser from "../../../modules/formula-tools/components/FormulaFunctionBrowser.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

describe("FormulaFunctionBrowser keyboard flow", () => {
  test("uses a single result tab stop and selects the active result with Enter", async () => {
    const wrapper = mount(FormulaFunctionBrowser, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, editSessionId: "editing" },
    });
    mounted.push(wrapper);
    await nextTick();
    const results = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-formula-browser-result]"),
    );
    expect(results.filter((result) => result.tabIndex === 0)).toHaveLength(1);
    results[0]?.focus();
    results[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await nextTick();
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(wrapper.emitted("insertFunction")?.[0]?.[0]).toBeTruthy();
  });
});
