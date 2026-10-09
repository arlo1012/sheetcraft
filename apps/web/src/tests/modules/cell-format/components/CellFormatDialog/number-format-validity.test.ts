import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import type { SelectionBorderState } from "@sheetcraft/core/style-state";
import CellFormatDialog from "../../../../../modules/cell-format/components/CellFormatDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const STORAGE_KEY = "sheetcraft.custom-number-formats";
const wrappers: Array<{ unmount(): void }> = [];

function borderState(): SelectionBorderState {
  const empty = { value: undefined, mixed: false };
  return {
    top: empty,
    right: empty,
    bottom: empty,
    left: empty,
    innerHorizontal: empty,
    innerVertical: empty,
    diagonalUp: empty,
    diagonalDown: empty,
  };
}

function mountDialog() {
  const wrapper = mount(CellFormatDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      state: createDefaultSelectionCellStyleState(),
      borderState: borderState(),
      sampleValue: 12.3,
      initialTab: "number",
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
  localStorage.removeItem(STORAGE_KEY);
});

describe("CellFormatDialog number format validation", () => {
  test("keeps confirm disabled after moving away from an invalid custom format", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-cell-format-number-category="custom"]').trigger("click");
    wrapper
      .get("[data-cell-format-custom-code]")
      .findComponent({ name: "TInput" })
      .vm.$emit("change", "[broken");
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-cell-format-tab="font"]').trigger("click");
    await wrapper.vm.$nextTick();
    const dialog = wrapper.findComponent({ name: "TDialog" });
    expect(dialog.props("confirmBtn")).toMatchObject({ disabled: true });
  });

  test("remembers a valid custom format only when the dialog is confirmed", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-cell-format-number-category="custom"]').trigger("click");
    wrapper
      .get("[data-cell-format-custom-code]")
      .findComponent({ name: "TInput" })
      .vm.$emit("change", "0.0000;[Red]-0.0000");
    await wrapper.vm.$nextTick();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const dialog = wrapper.findComponent({ name: "TDialog" });
    dialog.vm.$emit("confirm");
    await wrapper.vm.$nextTick();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      version: 1,
      codes: ["0.0000;[Red]-0.0000"],
    });
    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      style: { numberFormat: { kind: "custom", code: "0.0000;[Red]-0.0000" } },
    });
  });
});
