import { describe, expect, test } from "vitest";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid axis quick tools", () => {
  test("shows row actions for a selected row and inserts on either side", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-row="2"]').trigger("mousedown", { button: 0 });

    const tools = wrapper.get(".sheet-axis-quick-tools.is-row");
    expect(tools.findAll("button")).toHaveLength(3);
    await tools.get('[data-axis-quick-action="insert-before"]').trigger("click");
    await tools.get('[data-axis-quick-action="insert-after"]').trigger("click");

    expect(wrapper.emitted("insertAxis")).toEqual([
      [{ axis: "row", index: 2, count: 1 }],
      [{ axis: "row", index: 3, count: 1 }],
    ]);
  });

  test("opens the existing axis menu for more actions", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-column="1"]').trigger("mousedown", { button: 0 });
    await wrapper.get('.sheet-axis-quick-tools [data-axis-quick-action="more"]').trigger("click");

    expect(document.body.querySelector(".sheet-axis-context-menu")).not.toBeNull();
  });

  test("hides when its selected header is only retained in overscan", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(true);

    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 24;
    await scroller.trigger("scroll");
    expect(wrapper.find('[data-select-row="0"]').exists()).toBe(true);
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(false);
  });

  test("uses the full frozen multi-row selection count", async () => {
    const { sheet, wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    sheet.freezePanes = { rows: 2, columns: 1 };
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-row="1"]').trigger("mousedown", { button: 0, shiftKey: true });
    await wrapper
      .get('.sheet-axis-quick-tools [data-axis-quick-action="insert-after"]')
      .trigger("click");

    expect(wrapper.emitted("insertAxis")).toEqual([[{ axis: "row", index: 2, count: 2 }]]);
  });

  test("hides with headers, read-only mode, and cell editing", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });

    await wrapper.get('[data-select-row="0"]').trigger("mousedown", { button: 0 });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(true);

    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "x" });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(false);
    await wrapper.get("textarea.cell-editor").trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(true);

    await wrapper.setProps({ showHeaders: false });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(false);

    await wrapper.setProps({ showHeaders: true });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(true);
    await wrapper.setProps({ readOnly: true });
    expect(wrapper.find(".sheet-axis-quick-tools").exists()).toBe(false);
  });
});
