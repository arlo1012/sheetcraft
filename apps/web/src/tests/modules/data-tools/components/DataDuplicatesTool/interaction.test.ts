import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DataDuplicatesTool from "../../../../../modules/data-tools/components/DataDuplicatesTool.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function mountTool(props = { disabled: false, removeDuplicates: true }) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DataDuplicatesTool, {
    attachTo: host,
    props,
    global: { plugins: [createAppI18n("zh-CN")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("DataDuplicatesTool", () => {
  test("maps each menu action and keeps unavailable removal disabled", async () => {
    const wrapper = mountTool({ disabled: false, removeDuplicates: false });
    await wrapper.get('[data-data-action="duplicates"]').trigger("click");
    expect(menu().get('[data-data-duplicates="remove"]').attributes("aria-disabled")).toBe("true");
    await menu().get('[data-data-duplicates="highlight"]').trigger("click");
    expect(wrapper.emitted("open")).toEqual([["highlight"]]);
    await wrapper.get('[data-data-action="duplicates"]').trigger("click");
    await menu().get('[data-data-duplicates="clear-highlights"]').trigger("click");
    expect(wrapper.emitted("clearHighlights")).toHaveLength(1);
  });

  test("only disables the trigger for a globally disabled toolbar", async () => {
    const wrapper = mountTool({ disabled: true, removeDuplicates: false });
    const trigger = wrapper.get('[data-data-action="duplicates"]');
    expect((trigger.element as HTMLButtonElement).disabled).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
