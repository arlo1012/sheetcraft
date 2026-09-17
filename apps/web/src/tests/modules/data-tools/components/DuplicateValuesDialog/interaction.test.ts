import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DuplicateValuesDialog from "../../../../../modules/data-tools/components/DuplicateValuesDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const initial = {
  range: "A1:A4",
  hasHeader: true,
  fillColor: "#ffc7ce",
  destination: "C1",
  overwrite: false,
};
const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function mountDialog(mode: "highlight" | "count" | "reject") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DuplicateValuesDialog, {
    attachTo: host,
    props: { visible: true, mode, initial },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function dialog() {
  return new DOMWrapper(document.body).get('[role="dialog"]');
}

describe("DuplicateValuesDialog", () => {
  test("keeps count inputs and reports an edited draft", async () => {
    const wrapper = mountDialog("count");
    expect(dialog().text()).toContain("Count each value across the selected column");
    await dialog().get('[aria-label="Destination"] input').setValue("D1");
    expect(wrapper.emitted("draftChange")?.at(-1)).toEqual([{ ...initial, destination: "D1" }]);
    await dialog().get('[aria-label="Select range：Destination"]').trigger("click");
    expect(wrapper.emitted("pickRange")).toEqual([["destination"]]);
  });

  test("provides highlight colors and cancellation", async () => {
    const wrapper = mountDialog("highlight");
    expect(dialog().text()).toContain("Light red");
    expect(dialog().text()).toContain("Yellow");
    expect(dialog().text()).toContain("Green");
    await dialog().get(".t-dialog__close").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
