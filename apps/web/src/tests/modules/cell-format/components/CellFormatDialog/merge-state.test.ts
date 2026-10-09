import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import CellFormatDialog from "../../../../../modules/cell-format/components/CellFormatDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];

function mountDialog(merged: "on" | "off" | "mixed") {
  const empty = { value: undefined, mixed: false };
  const wrapper = mount(CellFormatDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      state: createDefaultSelectionCellStyleState(),
      borderState: {
        top: empty,
        bottom: empty,
        left: empty,
        right: empty,
        innerHorizontal: empty,
        innerVertical: empty,
        diagonalUp: empty,
        diagonalDown: empty,
      },
      sampleValue: "Example",
      initialTab: "alignment",
      mergeState: { merged, canMerge: merged === "off", canUnmerge: merged !== "off" },
    },
  });
  wrappers.push(wrapper);
  const checkbox = () =>
    wrapper.get("[data-cell-format-merge]").findComponent({ name: "TCheckbox" });
  return {
    wrapper,
    checkbox,
    async toggle(next: boolean) {
      checkbox().vm.$emit("change", next);
      await wrapper.vm.$nextTick();
    },
    confirm() {
      wrapper.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      return wrapper.emitted("confirm")?.at(-1)?.[0];
    },
  };
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.innerHTML = "";
});

describe("CellFormatDialog merge state", () => {
  test("shows the checked draft across tab changes and confirms the merge", async () => {
    const dialog = mountDialog("off");
    await dialog.toggle(true);
    expect(dialog.checkbox().props("modelValue")).toBe(true);
    await dialog.wrapper.get('[data-cell-format-tab="font"]').trigger("click");
    await dialog.wrapper.get('[data-cell-format-tab="alignment"]').trigger("click");
    expect(dialog.checkbox().props("modelValue")).toBe(true);
    expect(dialog.confirm()).toEqual({ merge: true });
  });

  test.each(["on", "off"] as const)(
    "returning to the original %s state removes the draft command",
    async (initial) => {
      const dialog = mountDialog(initial);
      await dialog.toggle(initial !== "on");
      expect(dialog.checkbox().props("modelValue")).toBe(initial !== "on");
      await dialog.toggle(initial === "on");
      expect(dialog.checkbox().props("modelValue")).toBe(initial === "on");
      expect(dialog.confirm()).toEqual({});
    },
  );

  test("unchecking a mixed selection clears indeterminate state and requests unmerge", async () => {
    const dialog = mountDialog("mixed");
    expect(dialog.checkbox().props("indeterminate")).toBe(true);
    await dialog.toggle(false);
    expect(dialog.checkbox().props("indeterminate")).toBe(false);
    expect(dialog.checkbox().props("modelValue")).toBe(false);
    expect(dialog.confirm()).toEqual({ merge: false });
  });
});
