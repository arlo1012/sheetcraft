import { describe, expect, test } from "vitest";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid axis quick tools", () => {
  test("inserts a row from a hovered header boundary without selecting that row", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    const header = wrapper.get('[data-select-row="2"]');
    await header.trigger("mouseenter");
    const insert = wrapper.get('[data-quick-insert-row="2"].is-before');
    await insert.trigger("mouseenter");
    await insert.trigger("click");

    expect(wrapper.emitted("insertAxis")).toEqual([[{ axis: "row", index: 2, count: 1 }]]);
    expect(header.attributes("aria-pressed")).toBe("false");
  });

  test("uses the selected axis range for an insertion at either selection boundary", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-row="1"]').trigger("mousedown", { button: 0, shiftKey: true });

    await wrapper.get('[data-quick-insert-row="0"].is-before').trigger("click");
    await wrapper.get('[data-quick-insert-row="2"].is-after').trigger("click");

    expect(wrapper.emitted("insertAxis")).toEqual([
      [{ axis: "row", index: 0, count: 2 }],
      [{ axis: "row", index: 2, count: 2 }],
    ]);
  });

  test("keeps more axis actions in the existing context menu", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-column="1"]').trigger("contextmenu", {
      clientX: 100,
      clientY: 100,
    });

    expect(document.body.querySelector(".sheet-axis-context-menu")).not.toBeNull();
  });

  test("hides header insertion points when unavailable", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(true);

    await wrapper.setProps({ showAxisQuickTools: false });
    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(false);

    await wrapper.setProps({ showAxisQuickTools: true, showHeaders: false });
    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(false);

    await wrapper.setProps({ showHeaders: true, readOnly: true });
    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(false);

    await wrapper.setProps({ readOnly: false });
    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(true);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "x" });
    expect(wrapper.find('[data-quick-insert-row="0"]').exists()).toBe(false);
  });

  test("does not collapse an existing multi-row selection when a drag starts", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-row="1"]').trigger("mousedown", { button: 0, shiftKey: true });

    const selectedHeader = wrapper.get('[data-select-row="0"]');
    await selectedHeader.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 8,
      clientY: 8,
    });
    await selectedHeader.trigger("mousedown", { button: 0 });

    expect(wrapper.get('[data-select-row="0"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-select-row="1"]').attributes("aria-pressed")).toBe("true");
    await selectedHeader.trigger("pointerup", { button: 0, pointerId: 1, clientX: 8, clientY: 8 });
  });

  test("changes an all-cell selection into the clicked row or column selection", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get(".sheet-grid__corner").trigger("click");
    await wrapper.get('[data-select-row="2"]').trigger("mousedown", { button: 0 });

    expect(wrapper.get('[data-select-row="2"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-select-column="2"]').attributes("aria-pressed")).toBe("false");

    await wrapper.get(".sheet-grid__corner").trigger("click");
    await wrapper.get('[data-select-column="2"]').trigger("mousedown", { button: 0 });

    expect(wrapper.get('[data-select-column="2"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-select-row="2"]').attributes("aria-pressed")).toBe("false");
  });
});
