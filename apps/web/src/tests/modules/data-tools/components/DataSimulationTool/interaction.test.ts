import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DataSimulationTool from "../../../../../modules/data-tools/components/DataSimulationTool.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function mountTool(disabled = false) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DataSimulationTool, {
    attachTo: host,
    props: { disabled },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("DataSimulationTool", () => {
  test("opens both simulation actions from its ribbon menu", async () => {
    const wrapper = mountTool();
    await wrapper.get('[data-data-action="simulation"]').trigger("click");
    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    await menu.get('[data-data-simulation="goal-seek"]').trigger("click");
    expect(wrapper.emitted("goalSeek")).toHaveLength(1);
    await wrapper.get('[data-data-action="simulation"]').trigger("click");
    await new DOMWrapper(document.body).get('[data-data-simulation="planning"]').trigger("click");
    expect(wrapper.emitted("planning")).toHaveLength(1);
  });

  test("does not open while the sheet is unavailable", async () => {
    const wrapper = mountTool(true);
    const trigger = wrapper.get('[data-data-action="simulation"]');
    expect((trigger.element as HTMLButtonElement).disabled).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
