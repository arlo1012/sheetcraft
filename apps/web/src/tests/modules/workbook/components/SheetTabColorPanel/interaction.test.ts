import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import SheetTabColorPanel from "../../../../../modules/workbook/components/SheetTabColorPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountPanel() {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const wrapper = mount(SheetTabColorPanel, {
    attachTo: document.body,
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPalette: {
          name: "ColorPalette",
          emits: ["select"],
          template: `<div><button data-picker @click="$emit('select', '#a1b2c3')" /><button data-reset @click="$emit('select', null)" /></div>`,
        },
      },
    },
    props: { anchor, open: true, value: "#112233" },
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe("SheetTabColorPanel", () => {
  test("applies any normalized hex value and resets to null", async () => {
    const wrapper = mountPanel();
    const panel = new DOMWrapper(document.body).get(".sheet-tab-color-panel");
    await panel.get("[data-picker]").trigger("click");
    expect(wrapper.emitted("apply")).toEqual([["#A1B2C3"]]);
    await panel.get("[data-reset]").trigger("click");
    expect(wrapper.emitted("apply")).toEqual([["#A1B2C3"], [null]]);
  });
});
