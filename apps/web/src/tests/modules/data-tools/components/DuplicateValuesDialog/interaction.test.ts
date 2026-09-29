import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DuplicateValuesDialog from "../../../../../modules/data-tools/components/DuplicateValuesDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const initial = {
  range: "A1:A4",
  fillColor: "#ffc7ce",
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
  test("edits a multicolumn source range and opens its picker", async () => {
    const wrapper = mountDialog("count");
    await dialog().get('[aria-label="Range"] input').setValue("A1:E7");
    expect(wrapper.emitted("draftChange")?.at(-1)).toEqual([{ ...initial, range: "A1:E7" }]);
    await dialog().get('[aria-label="Select range：Range"]').trigger("click");
    expect(wrapper.emitted("pickRange")).toEqual([[]]);
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
