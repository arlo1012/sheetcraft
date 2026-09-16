import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCanvasLayout, mountSheetGrid } from "./fixture";

describe("SheetGrid data controls", () => {
  test("anchors a request to the visible filter header cell and reflects an applied column", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(target) {
        target.filter = {
          range: { start: { row: 0, column: 0 }, end: { row: 6, column: 2 } },
          columns: [{ column: 1, allowedValues: [{ kind: "string", value: "open" }] }],
        };
      },
    });
    await nextTick();

    const buttons = wrapper.findAll(".sheet-data-controls__filter");
    expect(buttons).toHaveLength(3);
    expect(buttons[1]!.classes()).toContain("is-active");
    await buttons[1]!.trigger("click");
    expect(wrapper.emitted("filterColumnRequest")?.[0]?.[0]).toMatchObject({ column: 1 });
    expect(sheet.filter?.range.start.row).toBe(0);
  });

  test("keeps a collapsed group reopen control on a visible header boundary", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [{ id: "rows-1-3", axis: "row", start: 1, end: 3, collapsed: true }];
      },
    });
    await nextTick();

    expect(getCanvasLayout(wrapper).panes.body.rows.map((item) => item.index)).not.toEqual(
      expect.arrayContaining([1, 2, 3]),
    );
    const control = wrapper.get(".sheet-data-controls__outline");
    await control.trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({
      id: "rows-1-3",
      collapsed: false,
    });
  });

  test("emits a selected validation literal without changing the cell directly", async () => {
    const { wrapper } = mountSheetGrid({
      validationInfo: { values: ["=literal", 7, true], prompt: { message: "Choose a status" } },
    });
    await nextTick();

    await wrapper.get(".sheet-data-controls__validation").trigger("click");
    await wrapper.findAll('[role="option"]')[0]!.trigger("click");
    expect(wrapper.emitted("validationChoose")?.[0]?.[0]).toEqual({
      address: { row: 0, column: 0 },
      value: "=literal",
    });
  });
});
