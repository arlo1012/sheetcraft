import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { CellFillGradient } from "@idea10/core/style";
import ColorPaletteSelect from "../../../../../shared/color/ColorPaletteSelect.vue";
import CellFormatFillEffectsDialog from "../../../../../modules/cell-format/components/CellFormatFillEffectsDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
const customGradient: CellFillGradient = {
  type: "linear",
  angle: 27,
  stops: [
    { position: 0, color: "#123456" },
    { position: 0.4, color: "#789abc" },
    { position: 1, color: "#def012" },
  ],
};

function mountDialog() {
  const wrapper = mount(CellFormatFillEffectsDialog, {
    attachTo: document.body,
    props: { gradient: customGradient, defaultColor: "#ffffff" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("CellFormatFillEffectsDialog", () => {
  test("confirms an untouched imported gradient without rewriting its stops or angle", () => {
    const wrapper = mountDialog();
    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toEqual([[customGradient]]);
  });

  test("keeps edits in the dialog draft when cancelled", async () => {
    const wrapper = mountDialog();
    wrapper.getComponent(ColorPaletteSelect).vm.$emit("select", "#aabbcc");
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-fill-effects-preview]").attributes("style")).toContain(
      "linear-gradient",
    );

    wrapper.findComponent({ name: "TDialog" }).vm.$emit("close");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  test("maps automatic color selections to each gradient color default", async () => {
    const wrapper = mountDialog();
    const controls = wrapper.findAllComponents(ColorPaletteSelect);
    controls[0]!.vm.$emit("select", null);
    controls[1]!.vm.$emit("select", null);
    await wrapper.vm.$nextTick();

    wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
    const gradient = wrapper.emitted("confirm")?.at(-1)?.[0] as CellFillGradient;
    expect(gradient.stops).toEqual([
      { position: 0, color: "#ffffff" },
      { position: 1, color: "#4472c4" },
    ]);
  });
});
