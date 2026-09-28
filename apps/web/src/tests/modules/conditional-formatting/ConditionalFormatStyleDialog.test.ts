import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { reactive } from "vue";
import ConditionalFormatStyleDialog from "../../../modules/conditional-formatting/components/ConditionalFormatStyleDialog.vue";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
function mountDialog() {
  const wrapper = mount(ConditionalFormatStyleDialog, {
    attachTo: document.body,
    props: { style: { fillColor: "#FDE2E1" }, sampleValue: 12.3 },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});

describe("ConditionalFormatStyleDialog", () => {
  test("exposes only WPS differential-format tabs", () => {
    const wrapper = mountDialog();
    const labels = [...document.body.querySelectorAll("[data-cell-format-tab]")].map((node) =>
      node.textContent?.trim(),
    );
    expect(labels).toEqual(["Number", "Font", "Border", "Fill"]);
    expect(document.body.textContent).not.toContain("Alignment");
    expect(wrapper.findComponent(CellFormatDialog).props("borderCapabilities")).toEqual({
      innerHorizontal: false,
      innerVertical: false,
    });
  });
  test("cancelling never emits a differential style", async () => {
    const wrapper = mountDialog();
    await wrapper.findComponent(CellFormatDialog).vm.$emit("cancel");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
  test("accepts a reactive nested initial style without sharing it", () => {
    const style = reactive({
      numberFormat: { kind: "percent" as const, fractionDigits: 1 },
    });
    const wrapper = mount(ConditionalFormatStyleDialog, {
      attachTo: document.body,
      props: { style },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    const dialog = wrapper.findComponent(CellFormatDialog);
    expect(dialog.props("initialStylePatch")).toEqual(style);
  });
  test("converts number, font, and border edits into a differential style", async () => {
    const wrapper = mountDialog();
    await wrapper.findComponent(CellFormatDialog).vm.$emit("confirm", {
      style: {
        numberFormat: { kind: "percent", fractionDigits: 1 },
        bold: true,
      },
      borders: [{ preset: "left", border: { style: "double", color: "#FF0000" } }],
    });
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      fillColor: "#FDE2E1",
      bold: true,
      numberFormat: { kind: "percent", fractionDigits: 1 },
      borderLeft: { style: "double", color: "#FF0000" },
    });
  });
});
